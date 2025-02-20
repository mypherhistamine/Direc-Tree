use std::sync::{Arc, Mutex};

use tauri::State;

use crate::{
    ldap_conn::{get_ldap_conn, simple_user_pwd_bind},
    models::ldap_node::LdapNode,
    state_management::app_state::AppState,
};

use ldap3::{LdapConn, Scope, SearchEntry};

#[tauri::command]
pub fn fetch_ldap_tree(state: State<'_, Arc<Mutex<AppState>>>, base_dn: &str) -> Vec<LdapNode> {
    println!("Fetching the ldap entries based on the dn -> {}", base_dn);
    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    match ldap_conn {
        Some(con) => {
            let entries = get_ldap_tree(con, base_dn);
            println!("Fetched the ldap entries");
            entries
        }
        None => Vec::new(),
    }
}

pub fn get_ldap_tree(ldap_conn: &mut LdapConn, base_dn: &str) -> Vec<LdapNode> {
    // Perform the search to get the immediate children of the base_dn
    //let (rs, _res) = ldap_conn
    //    .search(
    //        base_dn,
    //        Scope::OneLevel,   // Only fetch direct children (one level deep)
    //        "(objectClass=*)", // Adjust search filter as needed
    //        vec!["*"],         // Retrieve all attributes (or specify the ones you need)
    //    )
    //    .unwrap()
    //    .success()
    //    .unwrap();

    let mut nodes = Vec::new();

    match ldap_conn.search(
        base_dn,
        Scope::OneLevel,   // Only fetch direct children (one level deep)
        "(objectClass=*)", // Adjust search filter as needed
        vec!["*"],         // Retrieve all attributes (or specify the ones you need)
    ) {
        Ok(result) => {
            let result_entry = result.success().unwrap();
            println!("Entries exist adding into answer");
            for entry in result_entry.0 {
                let search_entry: SearchEntry = SearchEntry::construct(entry);

                // Check if the node has children
                let has_child_nodes = has_children(ldap_conn, &search_entry.dn);

                let node = LdapNode {
                    dn: search_entry.dn.clone(),
                    attributes: Vec::new(),
                    // attributes: search_entry.attrs.keys().cloned().collect(),
                    children: Vec::new(), // Initially empty; will be populated on demand
                    toggled: false,       // Default state is collapsed
                    has_children: has_child_nodes, // Add the flag to check if the node can be expanded
                };
                // println!("node -> {:?}", node);

                nodes.push(node);
            }
        }
        Err(err) => {
            println!("Some ldap error occurred -> {err} forcing re-connection");
            let mut ldap_conn = get_ldap_conn();
            simple_user_pwd_bind(&mut ldap_conn);
        }
    }

    nodes
}
pub fn has_children(ldap_conn: &mut LdapConn, base_dn: &str) -> bool {
    // Perform an LDAP search with Scope::OneLevel to check for immediate children
    let (rs, _res) = ldap_conn
        .search(
            base_dn,
            Scope::OneLevel,     // Only check the immediate children (one level deep)
            "(objectClass=*)",   // Adjust search filter as needed
            vec!["objectClass"], // Retrieve all attributes (or specify the ones you need)
        )
        .unwrap()
        .success()
        .unwrap();

    // If we get any results, it means there are children
    !rs.is_empty()
}
