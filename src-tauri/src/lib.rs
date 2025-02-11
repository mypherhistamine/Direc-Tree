mod state_management;
mod commands;
mod ldap_conn;
mod models;
use std::sync::{Arc, Mutex};

use state_management::app_state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(Mutex::new(AppState::default()));
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(app_state) // Ensure AppState is registered here
        .invoke_handler(tauri::generate_handler![
            commands::connect_ldap::connect_ldap,
            commands::get_all_ldap_objects::get_all_ldap_objects,
            commands::fetch_ldap_tree::fetch_ldap_tree
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
