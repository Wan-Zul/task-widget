use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::appbar::Edge;
use crate::modes::Mode;
use crate::notch;

/// Menu items whose state must follow changes made from the widget itself.
pub struct TrayState {
    always_on_top: CheckMenuItem<Wry>,
    /// (menu id, item) for the Mode submenu; exactly one is checked.
    modes: Vec<(&'static str, CheckMenuItem<Wry>)>,
}

const MODE_ITEMS: [(&str, &str); 4] = [
    ("mode_notch", "Notch (top centre)"),
    ("mode_floating", "Floating"),
    ("mode_docked_left", "Docked left"),
    ("mode_docked_right", "Docked right"),
];

#[derive(Clone, Serialize)]
struct SetMode {
    mode: &'static str,
    edge: Option<&'static str>,
}

fn mode_request(id: &str) -> Option<SetMode> {
    Some(match id {
        "mode_notch" => SetMode { mode: "notch", edge: None },
        "mode_floating" => SetMode { mode: "floating", edge: None },
        "mode_docked_left" => SetMode { mode: "docked", edge: Some("left") },
        "mode_docked_right" => SetMode { mode: "docked", edge: Some("right") },
        _ => return None,
    })
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let always_on_top =
        CheckMenuItem::with_id(app, "always_on_top", "Always on top", true, false, None::<&str>)?;
    let modes = MODE_ITEMS
        .iter()
        .map(|(id, label)| Ok((*id, CheckMenuItem::with_id(app, *id, *label, true, false, None::<&str>)?)))
        .collect::<tauri::Result<Vec<_>>>()?;
    let mode_menu = Submenu::with_items(
        app,
        "Mode",
        true,
        &modes.iter().map(|(_, i)| i as &dyn tauri::menu::IsMenuItem<Wry>).collect::<Vec<_>>(),
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &mode_menu,
            &always_on_top,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Task Widget")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_main(app),
            "always_on_top" => {
                // muda flips the check mark before this handler runs.
                let on = app.state::<TrayState>().always_on_top.is_checked().unwrap_or(false);
                let _ = set_always_on_top(app, on);
            }
            "settings" => {
                show_main(app);
                let _ = app.emit("open-settings", ());
            }
            "quit" => app.exit(0),
            id => {
                // The frontend owns the saved mode/edge, so it performs the switch;
                // modes::apply then fixes the check marks.
                if let Some(req) = mode_request(id) {
                    let _ = app.emit("set-mode", req);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayState { always_on_top, modes });
    Ok(())
}

/// Tick the Mode submenu entry matching the active mode.
pub fn sync_mode(app: &AppHandle, mode: Mode, edge: Edge) {
    let Some(state) = app.try_state::<TrayState>() else { return };
    let active = match (mode, edge) {
        (Mode::Notch, _) => "mode_notch",
        (Mode::Floating, _) => "mode_floating",
        (Mode::Docked, Edge::Left) => "mode_docked_left",
        (Mode::Docked, Edge::Right) => "mode_docked_right",
    };
    for (id, item) in &state.modes {
        let _ = item.set_checked(*id == active);
    }
}

/// Bring the widget forward. In notch mode that means opening the island.
pub fn show_main(app: &AppHandle) {
    if notch::is_active(app) {
        notch::reveal_and_open(app);
    } else if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

/// Single path for always-on-top so the window, tray check mark and UI never disagree.
/// The frontend persists the value when it receives `always-on-top-changed`.
pub fn set_always_on_top(app: &AppHandle, on: bool) -> tauri::Result<()> {
    // Docked and notch modes are always topmost; the preference applies to floating mode.
    if !crate::appbar::is_docked() && !notch::is_active(app) {
        if let Some(w) = app.get_webview_window("main") {
            w.set_always_on_top(on)?;
        }
    }
    if let Some(state) = app.try_state::<TrayState>() {
        state.always_on_top.set_checked(on)?;
    }
    app.emit("always-on-top-changed", on)
}
