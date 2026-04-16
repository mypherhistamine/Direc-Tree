mod commands;
mod constants;
mod ldap_conn;
mod logging;
mod models;
mod state_management;
use std::sync::{Arc, Mutex};
use tauri_plugin_clipboard_manager::init as clipboard_init;

use state_management::app_state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise structured file logging before anything else
    logging::init_logging();

    let app_state = Arc::new(Mutex::new(AppState::default()));
    tauri::Builder::default()
        .plugin(clipboard_init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::connect_ldap::connect_ldap,
            commands::disconnect_ldap::disconnect_ldap,
            commands::get_all_ldap_objects::get_all_ldap_objects,
            commands::fetch_ldap_tree::fetch_ldap_tree,
            commands::fetch_ldap_tree::get_parsed_json_tree,
            commands::fetch_ldap_entry_attrs::fetch_node_attributes,
            commands::fetch_ldap_entry_attrs::determine_attribute_type,
            commands::fetch_attribute_value::fetch_attribute_value,
            commands::profile_management::list_profiles,
            commands::profile_management::upsert_profile,
            commands::profile_management::delete_profile,
            commands::search_ldap::search_ldap,
            commands::search_ldap::is_ldap_connected,
            commands::search_ldap::fetch_root_dse,
            commands::modify_entry::modify_ldap_entry,
            commands::search_ldap::fetch_node_attributes_operational,
            commands::search_ldap::get_entry_ldif,
            commands::search_ldap::export_ldif,
            commands::fetch_schema::fetch_schema,
            commands::log_commands::get_log_tail,
            commands::log_commands::get_log_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
