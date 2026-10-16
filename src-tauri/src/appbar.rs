//! Docked mode via the Win32 AppBar API (SHAppBarMessage): the widget reserves a strip at
//! the left or right screen edge, like the taskbar, so maximised windows don't cover it.
//!
//! Rules this module keeps:
//! - Every Win32 call here runs on the window's (main) thread. Callers use run_on_main_thread.
//! - The DOCK lock is never held across a call that can dispatch messages (SetWindowPos,
//!   SHAppBarMessage), because those can re-enter `subclass_proc` on this thread.
//! - The AppBar is removed on undock, hide, window destroy, app exit and panic. A marker file
//!   records "registered". If the process was killed, the next launch sees the marker and
//!   registers/removes once so Explorer frees the dead strip.

use std::cell::Cell;
use std::path::PathBuf;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde::Deserialize;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Shell::{
    DefSubclassProc, RemoveWindowSubclass, SHAppBarMessage, SetWindowSubclass, ABE_LEFT, ABE_RIGHT, ABM_ACTIVATE,
    ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_WINDOWPOSCHANGED, ABN_FULLSCREENAPP, ABN_POSCHANGED,
    APPBARDATA,
};
use windows::Win32::UI::WindowsAndMessaging::{
    IsWindowVisible, PostMessageW, SetWindowPos, HWND_BOTTOM, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    WINDOWPOS, WM_ACTIVATE, WM_APP, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_NCDESTROY, WM_SHOWWINDOW,
    WM_WINDOWPOSCHANGED, WM_WINDOWPOSCHANGING,
};

const CALLBACK_MSG: u32 = WM_APP + 0x51; // shell -> us (ABN_* notifications)
const REPOSITION_MSG: u32 = WM_APP + 0x52; // deferred re-layout
const REGISTER_MSG: u32 = WM_APP + 0x53; // deferred register after the window is shown
const SUBCLASS_ID: usize = 0x5457_4447;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Left,
    Right,
}

#[derive(Clone, Copy)]
struct Dock {
    hwnd: isize,
    edge: Edge,
    /// Width in logical pixels; converted with the window's current DPI.
    width: i32,
    registered: bool,
    /// Physical rect granted by the shell (while registered).
    rect: Option<RECT>,
}

static DOCK: Mutex<Option<Dock>> = Mutex::new(None);
static MARKER: Mutex<Option<PathBuf>> = Mutex::new(None);
/// Lock-free copy of the registered HWND for the panic hook.
static REGISTERED_HWND: AtomicIsize = AtomicIsize::new(0);

thread_local! {
    /// Guards against re-entering reposition() from messages it causes itself.
    static REPOSITIONING: Cell<bool> = const { Cell::new(false) };
}

fn dock_state() -> MutexGuard<'static, Option<Dock>> {
    DOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn snapshot() -> Option<Dock> {
    *dock_state()
}

fn to_hwnd(h: isize) -> HWND {
    HWND(h as *mut _)
}

fn appbar_data(h: isize) -> APPBARDATA {
    APPBARDATA {
        cbSize: size_of::<APPBARDATA>() as u32,
        hWnd: to_hwnd(h),
        uCallbackMessage: CALLBACK_MSG,
        ..Default::default()
    }
}

fn shell(msg: u32, h: isize) -> usize {
    let mut abd = appbar_data(h);
    unsafe { SHAppBarMessage(msg, &mut abd) }
}

fn set_marker(present: bool) {
    if let Some(path) = MARKER.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        if present {
            let _ = std::fs::write(path, b"registered");
        } else {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Call once at startup (main thread). Frees a strip left by a killed process and installs
/// a panic hook that removes the AppBar before the process dies.
pub fn init(marker: PathBuf, main_hwnd: isize) {
    if marker.exists() {
        shell(ABM_NEW, main_hwnd);
        shell(ABM_REMOVE, main_hwnd);
        let _ = std::fs::remove_file(&marker);
    }
    *MARKER.lock().unwrap_or_else(|e| e.into_inner()) = Some(marker);

    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let h = REGISTERED_HWND.swap(0, Ordering::SeqCst);
        if h != 0 {
            shell(ABM_REMOVE, h);
            set_marker(false);
        }
        previous(info);
    }));
}

pub fn is_docked() -> bool {
    snapshot().is_some()
}

/// Dock `hwnd` to `edge`. If the window is hidden, registration waits until it's shown.
pub fn dock(h: isize, edge: Edge, width: i32) -> Result<(), String> {
    {
        let mut state = dock_state();
        let registered = state.map(|d| d.registered && d.hwnd == h).unwrap_or(false);
        *state = Some(Dock { hwnd: h, edge, width, registered, rect: None });
    }
    let ok = unsafe { SetWindowSubclass(to_hwnd(h), Some(subclass_proc), SUBCLASS_ID, 0) };
    if !ok.as_bool() {
        *dock_state() = None;
        return Err("couldn't subclass the widget window".into());
    }
    if unsafe { IsWindowVisible(to_hwnd(h)) }.as_bool() {
        register()?;
        reposition();
    }
    Ok(())
}

/// Leave docked mode and give the screen space back.
pub fn undock(h: isize) {
    unregister();
    *dock_state() = None;
    unsafe {
        let _ = RemoveWindowSubclass(to_hwnd(h), Some(subclass_proc), SUBCLASS_ID);
    }
}

/// App exit: release the strip (the window may already be gone).
pub fn shutdown() {
    unregister();
}

fn register() -> Result<(), String> {
    let Some(d) = snapshot() else { return Ok(()) };
    if d.registered {
        return Ok(());
    }
    if shell(ABM_NEW, d.hwnd) == 0 {
        return Err("Windows refused to register the docked panel (ABM_NEW failed)".into());
    }
    if let Some(s) = dock_state().as_mut() {
        s.registered = true;
    }
    REGISTERED_HWND.store(d.hwnd, Ordering::SeqCst);
    set_marker(true);
    Ok(())
}

fn unregister() {
    let Some(d) = snapshot() else { return };
    if !d.registered {
        return;
    }
    shell(ABM_REMOVE, d.hwnd);
    if let Some(s) = dock_state().as_mut() {
        s.registered = false;
        s.rect = None;
    }
    REGISTERED_HWND.store(0, Ordering::SeqCst);
    set_marker(false);
}

/// Ask the shell for our strip on the window's current monitor and move the window there.
fn reposition() {
    let Some(d) = snapshot() else { return };
    if !d.registered || REPOSITIONING.get() {
        return;
    }
    REPOSITIONING.set(true);
    let h = to_hwnd(d.hwnd);
    unsafe {
        let mut mi = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
        let _ = GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut mi);
        let dpi = GetDpiForWindow(h).max(96) as i32;
        let width = (d.width * dpi + 48) / 96;

        let mut abd = appbar_data(d.hwnd);
        abd.uEdge = match d.edge {
            Edge::Left => ABE_LEFT,
            Edge::Right => ABE_RIGHT,
        };
        // Horizontal extent from the monitor, vertical from the work area so we stop at a
        // top/bottom taskbar instead of sliding under it.
        abd.rc = RECT { left: mi.rcMonitor.left, right: mi.rcMonitor.right, top: mi.rcWork.top, bottom: mi.rcWork.bottom };
        let fit = |rc: &mut RECT| match d.edge {
            Edge::Left => rc.right = rc.left + width,
            Edge::Right => rc.left = rc.right - width,
        };
        fit(&mut abd.rc);
        SHAppBarMessage(ABM_QUERYPOS, &mut abd); // shell moves us clear of other bars
        fit(&mut abd.rc);
        SHAppBarMessage(ABM_SETPOS, &mut abd);

        let rc = abd.rc;
        if let Some(s) = dock_state().as_mut() {
            s.rect = Some(rc);
        }
        let _ = SetWindowPos(
            h,
            Some(HWND_TOPMOST),
            rc.left,
            rc.top,
            rc.right - rc.left,
            rc.bottom - rc.top,
            SWP_NOACTIVATE,
        );
    }
    REPOSITIONING.set(false);
}

fn post(h: HWND, msg: u32) {
    unsafe {
        let _ = PostMessageW(Some(h), msg, WPARAM(0), LPARAM(0));
    }
}

unsafe extern "system" fn subclass_proc(
    h: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    let docked = snapshot();
    match msg {
        CALLBACK_MSG => {
            match wparam.0 as u32 {
                ABN_POSCHANGED => reposition(),
                // A fullscreen app (video, game, presentation) opened or closed on this monitor:
                // step out of its way, then come back on top.
                ABN_FULLSCREENAPP => unsafe {
                    let after = if lparam.0 != 0 { HWND_BOTTOM } else { HWND_TOPMOST };
                    let _ = SetWindowPos(h, Some(after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                },
                _ => {}
            }
            return LRESULT(0);
        }
        REPOSITION_MSG => {
            reposition();
            return LRESULT(0);
        }
        REGISTER_MSG => {
            if docked.is_some() && register().is_ok() {
                reposition();
            }
            return LRESULT(0);
        }
        // Keep the window pinned to its strip: no dragging, Aero Snap or Win+arrow moves.
        WM_WINDOWPOSCHANGING => {
            if let Some(rc) = docked.and_then(|d| d.rect) {
                if !REPOSITIONING.get() && lparam.0 != 0 {
                    let pos = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
                    if !pos.flags.contains(SWP_NOMOVE) {
                        pos.x = rc.left;
                        pos.y = rc.top;
                    }
                    if !pos.flags.contains(SWP_NOSIZE) {
                        pos.cx = rc.right - rc.left;
                        pos.cy = rc.bottom - rc.top;
                    }
                }
            }
        }
        WM_WINDOWPOSCHANGED => {
            if docked.is_some_and(|d| d.registered) {
                shell(ABM_WINDOWPOSCHANGED, h.0 as isize);
            }
        }
        WM_ACTIVATE => {
            if docked.is_some_and(|d| d.registered) {
                shell(ABM_ACTIVATE, h.0 as isize);
            }
        }
        // Hidden (tray/hotkey) = give the space back; shown again = reclaim it.
        WM_SHOWWINDOW => {
            if docked.is_some() {
                if wparam.0 != 0 {
                    post(h, REGISTER_MSG);
                } else {
                    unregister();
                }
            }
        }
        // Resolution or scale changed: the monitor rect is only final after these settle.
        WM_DISPLAYCHANGE | WM_DPICHANGED => {
            if docked.is_some() {
                let result = unsafe { DefSubclassProc(h, msg, wparam, lparam) };
                post(h, REPOSITION_MSG);
                return result;
            }
        }
        WM_NCDESTROY => {
            unregister();
            unsafe {
                let _ = RemoveWindowSubclass(h, Some(subclass_proc), SUBCLASS_ID);
            }
        }
        _ => {}
    }
    unsafe { DefSubclassProc(h, msg, wparam, lparam) }
}
