use std::sync::{Arc, Mutex};

use tauri::State;

use crate::{models::ldap_node::LdapNode, state_management::app_state::AppState};

use ldap3::{LdapConn, Scope, SearchEntry};

#[tauri::command]
pub fn fetch_ldap_tree(state: State<'_, Arc<Mutex<AppState>>>) -> Vec<LdapNode> {
    println!("Fetching the ldap entries");
    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    match ldap_conn {
        Some(con) => {
            let entries = get_ldap_tree(con, "o=novell");
            println!("Fetched the ldap entries");
            entries
        }
        None => Vec::new(),
    }
}

pub fn get_ldap_tree(ldap_conn: &mut LdapConn, base_dn: &str) -> Vec<LdapNode> {
    // println!("Searching in base dn -> {}", base_dn);
    let (rs, _res) = ldap_conn
        .search(
            base_dn,
            Scope::OneLevel,
            "(objectClass=*)",
            vec!["*"],
        ) // Adjust search as needed
        .unwrap()
        .success()
        .unwrap();

    let mut nodes = Vec::new();

    for entry in rs {
        let search_entry: SearchEntry = SearchEntry::construct(entry);
        let children = get_ldap_tree(ldap_conn, &search_entry.dn);  // Recursively fetch children

        let node = LdapNode {
            dn: search_entry.dn.clone(),
            attributes: search_entry.attrs.keys().cloned().collect(),
            children: children,
        };

        nodes.push(node);
    }

    nodes
}
