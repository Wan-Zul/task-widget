use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

/// Menu items whose state must follow changes made from the widget itself.
pub struct TrayState {
    always_on_top: CheckMenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let always_on_top =
        CheckMenuItem::with_id(app, "always_on_top", "Always on top", true, false, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &toggle,
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
            _ => {}
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

    app.manage(TrayState { always_on_top });
    Ok(())
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
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
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(on)?;
    }
    if let Some(state) = app.try_state::<TrayState>() {
        state.always_on_top.set_checked(on)?;
    }
    app.emit("always-on-top-changed", on)
}
