//! Notch mode: a small black island at the top centre of the primary monitor that grows
//! when used (pill -> peek -> open), like Coucou's island on Windows.
//!
//! The window is always exactly the island's size (resized per state), so there is no
//! transparent area that would need click-through and no cursor polling.
//! A background check every 2 s hides the island while a fullscreen app is in front and
//! re-centres it if the primary monitor's resolution or scale changes.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SW_HIDE, SW_SHOWNOACTIVATE,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotchState {
    Pill,
    Peek,
    Open,
}

/// Island size per state, in logical pixels.
pub fn logical_size(state: NotchState) -> (f64, f64) {
    match state {
        NotchState::Pill => (220.0, 30.0),
        NotchState::Peek => (360.0, 150.0),
        NotchState::Open => (780.0, 460.0),
    }
}

/// Monitor rect in physical pixels plus its scale factor.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct MonitorGeom {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Physical (x, y, width, height) of the island: centred horizontally, flush with the top,
/// never wider than the monitor.
pub fn geometry(m: MonitorGeom, logical: (f64, f64)) -> (i32, i32, i32, i32) {
    let w = ((logical.0 * m.scale).round() as i32).clamp(1, m.width as i32);
    let h = ((logical.1 * m.scale).round() as i32).clamp(1, m.height as i32);
    let x = m.x + (m.width as i32 - w) / 2;
    (x, m.y, w, h)
}

#[derive(Default)]
pub struct NotchCtl {
    active: AtomicBool,
    state: Mutex<Option<NotchState>>,
    hidden_for_fullscreen: AtomicBool,
    monitor: Mutex<Option<MonitorGeom>>,
}

pub fn is_active(app: &AppHandle) -> bool {
    app.try_state::<NotchCtl>().is_some_and(|c| c.active.load(Ordering::SeqCst))
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "main window missing".to_string())
}

fn hwnd(w: &WebviewWindow) -> Result<HWND, String> {
    w.hwnd().map_err(|e| e.to_string())
}

fn primary_geom(w: &WebviewWindow) -> Result<MonitorGeom, String> {
    let m = w.primary_monitor().map_err(|e| e.to_string())?.ok_or("no primary monitor")?;
    Ok(MonitorGeom {
        x: m.position().x,
        y: m.position().y,
        width: m.size().width,
        height: m.size().height,
        scale: m.scale_factor(),
    })
}

/// Size and place the island for `state`. `reveal` also shows it (without taking focus);
/// `Open` additionally gives it the keyboard.
fn layout(app: &AppHandle, state: NotchState, reveal: bool) -> Result<(), String> {
    let w = main_window(app)?;
    let geom = primary_geom(&w)?;
    let (x, y, width, height) = geometry(geom, logical_size(state));
    let h = hwnd(&w)?;
    // One SetWindowPos so position and size change together (no lopsided growth).
    unsafe { SetWindowPos(h, Some(HWND_TOPMOST), x, y, width, height, SWP_NOACTIVATE) }.map_err(|e| e.to_string())?;

    let ctl = app.state::<NotchCtl>();
    *ctl.state.lock().unwrap() = Some(state);
    *ctl.monitor.lock().unwrap() = Some(geom);

    if reveal && !w.is_visible().unwrap_or(false) && !ctl.hidden_for_fullscreen.load(Ordering::SeqCst) {
        unsafe {
            let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        }
    }
    if state == NotchState::Open {
        let _ = w.set_focus();
    }
    Ok(())
}

/// Frontend: move the island to a new state.
pub fn set_state(app: &AppHandle, state: NotchState) -> Result<(), String> {
    if !is_active(app) {
        return Ok(());
    }
    layout(app, state, true)
}

/// Enter notch mode (window already undecorated and topmost).
pub fn activate(app: &AppHandle) -> Result<(), String> {
    let w = main_window(app)?;
    // Floating mode's minimum size would stop the window shrinking to a pill.
    w.set_min_size(None::<tauri::LogicalSize<f64>>).map_err(|e| e.to_string())?;
    app.state::<NotchCtl>().active.store(true, Ordering::SeqCst);
    layout(app, NotchState::Pill, true)
}

pub fn deactivate(app: &AppHandle) {
    let ctl = app.state::<NotchCtl>();
    ctl.active.store(false, Ordering::SeqCst);
    *ctl.state.lock().unwrap() = None;
    if ctl.hidden_for_fullscreen.swap(false, Ordering::SeqCst) {
        if let Ok(w) = main_window(app) {
            let _ = w.show();
        }
    }
}

/// Show the island (e.g. after Show/Hide) without taking focus.
pub fn reveal(app: &AppHandle) {
    if let Ok(w) = main_window(app) {
        if let Ok(h) = hwnd(&w) {
            app.state::<NotchCtl>().hidden_for_fullscreen.store(false, Ordering::SeqCst);
            unsafe {
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            }
        }
    }
}

/// Tray / second launch: make sure the island is visible, then let the frontend open it.
pub fn reveal_and_open(app: &AppHandle) {
    reveal(app);
    let _ = app.emit("notch-open", ());
}

fn fullscreen_app_in_front() -> bool {
    matches!(
        unsafe { SHQueryUserNotificationState() },
        Ok(s) if s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE
    )
}

/// Background check (2 s): fullscreen apps and monitor changes. Idle unless in notch mode.
pub fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        if !is_active(&app) {
            continue;
        }
        let Ok(w) = main_window(&app) else { continue };
        let ctl = app.state::<NotchCtl>();

        let fullscreen = fullscreen_app_in_front();
        if fullscreen && w.is_visible().unwrap_or(false) {
            if let Ok(h) = hwnd(&w) {
                ctl.hidden_for_fullscreen.store(true, Ordering::SeqCst);
                unsafe {
                    let _ = ShowWindow(h, SW_HIDE);
                }
            }
        } else if !fullscreen && ctl.hidden_for_fullscreen.swap(false, Ordering::SeqCst) {
            if let Ok(h) = hwnd(&w) {
                unsafe {
                    let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
                }
            }
        }

        let current = *ctl.state.lock().unwrap();
        let last = *ctl.monitor.lock().unwrap();
        if let (Some(state), Ok(geom)) = (current, primary_geom(&w)) {
            if last != Some(geom) {
                let _ = layout(&app, state, false);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const FHD: MonitorGeom = MonitorGeom { x: 0, y: 0, width: 1920, height: 1080, scale: 1.0 };

    #[test]
    fn centred_and_flush_with_top() {
        assert_eq!(geometry(FHD, logical_size(NotchState::Pill)), (850, 0, 220, 30));
        assert_eq!(geometry(FHD, logical_size(NotchState::Open)), (570, 0, 780, 460));
    }

    #[test]
    fn scales_with_dpi() {
        let m = MonitorGeom { scale: 1.5, ..FHD };
        assert_eq!(geometry(m, logical_size(NotchState::Pill)), (795, 0, 330, 45));
    }

    #[test]
    fn follows_monitor_origin() {
        // A primary monitor that isn't at (0,0), e.g. after rearranging displays.
        let m = MonitorGeom { x: -2560, y: -200, width: 2560, height: 1440, scale: 1.25 };
        assert_eq!(geometry(m, logical_size(NotchState::Peek)), (-2560 + (2560 - 450) / 2, -200, 450, 188));
    }

    #[test]
    fn never_wider_than_the_monitor() {
        let small = MonitorGeom { x: 0, y: 0, width: 1280, height: 720, scale: 2.0 };
        let (x, _, w, h) = geometry(small, logical_size(NotchState::Open));
        assert_eq!((x, w, h), (0, 1280, 720));
    }
}
