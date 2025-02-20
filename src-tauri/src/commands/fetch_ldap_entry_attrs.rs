use ldap3::{Scope, SearchEntry};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
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
            println!("bin attrs -> {:?}", search_entry.bin_attrs);
        }
        return Ok(attributes);
    }
    Ok(HashMap::new())
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AttributeType {
    Xml,
    Base64,
    Json,
    String,
}

#[tauri::command]
pub fn determine_attribute_type(value: &str) -> AttributeType {
    println!("Determining the type of the value -> {value}");
    // Check if it's a valid JSON format
    let json_regex = Regex::new(r"^\{.*\}$|^\[.*\]$").unwrap();
    if json_regex.is_match(value) {
        println!("attribute is json type");
        return AttributeType::Json;
    }

    // Check if it's a Base64 string (a simplistic check)
    let base64_regex = Regex::new(r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$").unwrap();
    if base64_regex.is_match(value) {
        println!("attribute is base64 type");
        return AttributeType::Base64;
    }

    // Check if it looks like an XML string (simplified check for XML tags)
    let xml_regex = Regex::new(r"<.*?>").unwrap();
    if xml_regex.is_match(value) {
        println!("attribute is xml type");
        return AttributeType::Xml;
    }

    println!("The determined type looks to be a String value");
    // If none of the above, it's a string
    AttributeType::String
}
