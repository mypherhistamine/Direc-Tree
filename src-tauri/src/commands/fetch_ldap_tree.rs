use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;

use crate::{
    ldap_conn::{get_ldap_conn, simple_user_pwd_bind},
    logging::{log_command_end, log_command_start, new_request_id, truncate_preview},
    models::ldap_node::LdapNode,
    state_management::app_state::AppState,
};

use ldap3::{LdapConn, Scope, SearchEntry};

#[tauri::command]
pub fn fetch_ldap_tree(state: State<'_, Arc<Mutex<AppState>>>, base_dn: &str) -> Vec<LdapNode> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("fetch_ldap_tree", &req_id, &format!("base_dn={}", truncate_preview(base_dn, 200)));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    match ldap_conn {
        Some(con) => {
            let entries = get_ldap_tree(con, base_dn);
            tracing::debug!(req_id = req_id, child_count = entries.len(), "fetch_ldap_tree result");
            log_command_end("fetch_ldap_tree", &req_id, start);
            entries
        }
        None => {
            tracing::warn!(req_id = req_id, "fetch_ldap_tree: no connection");
            log_command_end("fetch_ldap_tree", &req_id, start);
            Vec::new()
        }
    }
}

#[tauri::command]
pub fn get_parsed_json_tree(
    state: State<'_, Arc<Mutex<AppState>>>,
    base_dn: &str,
) -> Vec<LdapNode> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("get_parsed_json_tree", &req_id, &format!("base_dn={}", truncate_preview(base_dn, 200)));

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();
    let mut nodes = Vec::new();
    if let Some(ldap_conn) = ldap_conn {
        match ldap_conn.search(
            base_dn,
            Scope::Subtree,
            "(objectClass=*)",
            vec!["*"],
        ) {
            Ok(result) => {
                let result_entry = result.success().unwrap();
                for entry in result_entry.0 {
                    let search_entry: SearchEntry = SearchEntry::construct(entry);
                    let node = LdapNode {
                        dn: search_entry.dn.clone(),
                        attributes: Vec::new(),
                        children: Vec::new(),
                        toggled: false,
                        has_children: false,
                    };
                    nodes.push(node);
                }
            }
            Err(err) => {
                tracing::error!(req_id = req_id, error = %err, "get_parsed_json_tree: search failed, forcing reconnect");
                let mut ldap_conn = get_ldap_conn();
                simple_user_pwd_bind(&mut ldap_conn);
            }
        }
    }
    tracing::debug!(req_id = req_id, node_count = nodes.len(), "get_parsed_json_tree result");
    log_command_end("get_parsed_json_tree", &req_id, start);
    nodes
}

pub fn get_ldap_tree(ldap_conn: &mut LdapConn, base_dn: &str) -> Vec<LdapNode> {
    let mut nodes = Vec::new();
    match ldap_conn.search(
        base_dn,
        Scope::OneLevel,
        "(objectClass=*)",
        vec!["*"],
    ) {
        Ok(result) => {
            let result_entry = result.success().unwrap();
            for entry in result_entry.0 {
                let search_entry: SearchEntry = SearchEntry::construct(entry);
                let has_child_nodes = has_children(ldap_conn, &search_entry.dn);

                let node = LdapNode {
                    dn: search_entry.dn.clone(),
                    attributes: Vec::new(),
                    children: Vec::new(),
                    toggled: false,
                    has_children: has_child_nodes,
                };
                nodes.push(node);
            }
        }
        Err(err) => {
            tracing::error!(error = %err, "get_ldap_tree: search failed, forcing reconnect");
            let mut ldap_conn = get_ldap_conn();
            simple_user_pwd_bind(&mut ldap_conn);
        }
    }

    nodes
}

pub fn has_children(ldap_conn: &mut LdapConn, base_dn: &str) -> bool {
    let (rs, _res) = ldap_conn
        .search(
            base_dn,
            Scope::OneLevel,
            "(objectClass=*)",
            vec!["objectClass"],
        )
        .unwrap()
        .success()
        .unwrap();

    !rs.is_empty()
}
