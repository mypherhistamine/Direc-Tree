use ldap3::Mod;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

use crate::{
    logging::{log_command_end, log_command_error, log_command_start, new_request_id, truncate_preview},
    state_management::app_state::AppState,
};

/// What kind of LDAP modification to perform.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ModifyOp {
    Replace,
    Add,
    Delete,
}

/// A single attribute modification.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AttrModification {
    pub op: ModifyOp,
    pub attribute: String,
    /// Values to set / add / delete.  For Delete with an empty vec, the whole attr is removed.
    pub values: Vec<String>,
}

/// Apply one or more modifications to an LDAP entry.
#[tauri::command]
pub fn modify_ldap_entry(
    state: State<'_, Arc<Mutex<AppState>>>,
    dn: String,
    modifications: Vec<AttrModification>,
) -> Result<(), String> {
    let req_id = new_request_id();
    let start = Instant::now();
    let mod_summary: Vec<String> = modifications
        .iter()
        .map(|m| format!("{:?} {} ({} vals)", m.op, m.attribute, m.values.len()))
        .collect();
    log_command_start(
        "modify_ldap_entry",
        &req_id,
        &format!("dn={}, mods=[{}]", truncate_preview(&dn, 200), mod_summary.join(", ")),
    );

    let app_state = state.lock().unwrap();
    let mut ldap_guard = app_state.ldap_connection.lock().unwrap();
    let conn = ldap_guard
        .as_mut()
        .ok_or_else(|| {
            let msg = "Not connected to LDAP".to_string();
            log_command_error("modify_ldap_entry", &req_id, start, &msg);
            msg
        })?;

    // Build ldap3 Mod vec
    let mods: Vec<Mod<String>> = modifications
        .iter()
        .map(|m| {
            let vals: HashSet<String> = m.values.iter().cloned().collect();
            match m.op {
                ModifyOp::Replace => Mod::Replace(m.attribute.clone(), vals),
                ModifyOp::Add => Mod::Add(m.attribute.clone(), vals),
                ModifyOp::Delete => Mod::Delete(m.attribute.clone(), vals),
            }
        })
        .collect();

    let result = conn.modify(&dn, mods).map_err(|e| {
        let msg = format!("LDAP modify error: {}", e);
        log_command_error("modify_ldap_entry", &req_id, start, &msg);
        msg
    })?;

    result.success().map_err(|e| {
        let msg = format!("LDAP modify failed: {}", e);
        log_command_error("modify_ldap_entry", &req_id, start, &msg);
        msg
    })?;

    log_command_end("modify_ldap_entry", &req_id, start);
    Ok(())
}
