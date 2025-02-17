use ldap3::{Scope, SearchEntry};
use std::{
    collections::HashMap, sync::{Arc, Mutex}
};
use tauri::State;

use crate::state_management::app_state::AppState;

#[tauri::command]
pub fn fetch_node_attributes(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
) -> Result<HashMap<String, String>, String> {
    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    if let Some(conn) = ldap_conn {
        let (results, _) = conn
            .search(&base_dn, Scope::Base, "(objectClass=*)", vec!["*"])
            .map_err(|e| format!("Failed to search LDAP: {}", e))?
            .success()
            .map_err(|e| format!("Failed to parse LDAP response: {}", e))?;

        let mut attributes = HashMap::new();

        if let Some(entry) = results.into_iter().next() {
            // println!("Entry -> {:?}", entry);
            let search_entry = SearchEntry::construct(entry);
            // println!("Search Entry -> {:?}", search_entry);
            for (key, values) in search_entry.attrs {
                attributes.insert(key, values.join(", "));
            }
            println!("bin attrs -> {:?}" , search_entry.bin_attrs);
        }
        return Ok(attributes);
    }
    Ok(HashMap::new())
}
