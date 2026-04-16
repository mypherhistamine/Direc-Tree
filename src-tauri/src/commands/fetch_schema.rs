use ldap3::{Scope, SearchEntry};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

use crate::{
    logging::{log_command_end, log_command_error, log_command_start, new_request_id},
    state_management::app_state::AppState,
};

// ═══════════════════════════════════════════════════════════════
//  Schema data types
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ObjectClassDef {
    pub oid: String,
    pub names: Vec<String>,
    pub description: String,
    pub sup: Vec<String>,
    pub kind: String, // STRUCTURAL | AUXILIARY | ABSTRACT
    pub must: Vec<String>,
    pub may: Vec<String>,
    pub raw: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttributeTypeDef {
    pub oid: String,
    pub names: Vec<String>,
    pub description: String,
    pub syntax: String,
    pub single_value: bool,
    pub equality: String,
    pub ordering: String,
    pub substr: String,
    pub sup: String,
    pub usage: String,
    pub no_user_modification: bool,
    pub raw: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MatchingRuleDef {
    pub oid: String,
    pub names: Vec<String>,
    pub description: String,
    pub syntax: String,
    pub raw: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LdapSyntaxDef {
    pub oid: String,
    pub description: String,
    pub raw: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaBundle {
    pub object_classes: Vec<ObjectClassDef>,
    pub attribute_types: Vec<AttributeTypeDef>,
    pub matching_rules: Vec<MatchingRuleDef>,
    pub ldap_syntaxes: Vec<LdapSyntaxDef>,
    pub subschema_dn: String,
}

// ═══════════════════════════════════════════════════════════════
//  RFC 4512 lightweight schema definition parser
// ═══════════════════════════════════════════════════════════════

/// Tokenise an RFC 4512 schema definition string.
/// E.g. "( 2.5.6.0 NAME 'top' ABSTRACT MUST objectClass )"
fn tokenize(def: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = def.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        match chars[i] {
            ' ' | '\t' | '\n' | '\r' => { i += 1; }
            '(' => { tokens.push("(".into()); i += 1; }
            ')' => { tokens.push(")".into()); i += 1; }
            '$' => { tokens.push("$".into()); i += 1; }
            '\'' => {
                // Quoted string
                i += 1; // skip opening quote
                let start = i;
                while i < len && chars[i] != '\'' { i += 1; }
                tokens.push(chars[start..i].iter().collect());
                if i < len { i += 1; } // skip closing quote
            }
            _ => {
                let start = i;
                while i < len && !matches!(chars[i], ' ' | '\t' | '\n' | '\r' | '(' | ')' | '$' | '\'') {
                    i += 1;
                }
                tokens.push(chars[start..i].iter().collect());
            }
        }
    }
    tokens
}

/// Read a list of names/OIDs from tokens: either a single name or ( name1 $ name2 )
fn read_oid_list(tokens: &[String], pos: &mut usize) -> Vec<String> {
    if *pos >= tokens.len() { return vec![]; }
    if tokens[*pos] == "(" {
        *pos += 1; // skip (
        let mut items = Vec::new();
        while *pos < tokens.len() && tokens[*pos] != ")" {
            if tokens[*pos] == "$" {
                *pos += 1;
                continue;
            }
            items.push(tokens[*pos].clone());
            *pos += 1;
        }
        if *pos < tokens.len() { *pos += 1; } // skip )
        items
    } else {
        let val = tokens[*pos].clone();
        *pos += 1;
        vec![val]
    }
}

/// Read a single quoted or unquoted value
fn read_single(tokens: &[String], pos: &mut usize) -> String {
    if *pos >= tokens.len() { return String::new(); }
    let val = tokens[*pos].clone();
    *pos += 1;
    val
}

/// Parse a single objectClass definition
fn parse_object_class(raw: &str) -> Option<ObjectClassDef> {
    let tokens = tokenize(raw);
    if tokens.len() < 3 { return None; }

    let mut pos = 0;
    // Skip leading (
    if tokens.get(pos).map(|t| t.as_str()) == Some("(") { pos += 1; }

    // OID
    let oid = if pos < tokens.len() { tokens[pos].clone() } else { return None; };
    pos += 1;

    let mut names = Vec::new();
    let mut description = String::new();
    let mut sup = Vec::new();
    let mut kind = "STRUCTURAL".to_string();
    let mut must = Vec::new();
    let mut may = Vec::new();

    while pos < tokens.len() {
        let kw = tokens[pos].to_uppercase();
        match kw.as_str() {
            ")" => break,
            "NAME" => { pos += 1; names = read_oid_list(&tokens, &mut pos); }
            "DESC" => { pos += 1; description = read_single(&tokens, &mut pos); }
            "SUP" => { pos += 1; sup = read_oid_list(&tokens, &mut pos); }
            "ABSTRACT" => { kind = "ABSTRACT".into(); pos += 1; }
            "STRUCTURAL" => { kind = "STRUCTURAL".into(); pos += 1; }
            "AUXILIARY" => { kind = "AUXILIARY".into(); pos += 1; }
            "MUST" => { pos += 1; must = read_oid_list(&tokens, &mut pos); }
            "MAY" => { pos += 1; may = read_oid_list(&tokens, &mut pos); }
            "OBSOLETE" | "X-ORIGIN" | "X-SCHEMA-FILE" | "X-NDS_NAME" | "X-NDS_NOT_SCHED" | "X-ORDERED" => {
                pos += 1;
                // Skip value(s)
                if pos < tokens.len() && tokens[pos] == "(" {
                    while pos < tokens.len() && tokens[pos] != ")" { pos += 1; }
                    if pos < tokens.len() { pos += 1; }
                } else if pos < tokens.len() && tokens[pos] != ")" {
                    pos += 1;
                }
            }
            _ => {
                pos += 1;
                // Unknown keyword — skip potential value
                if pos < tokens.len() && tokens[pos] != ")" && !is_keyword(&tokens[pos]) {
                    if tokens[pos] == "(" {
                        while pos < tokens.len() && tokens[pos] != ")" { pos += 1; }
                        if pos < tokens.len() { pos += 1; }
                    } else {
                        pos += 1;
                    }
                }
            }
        }
    }

    Some(ObjectClassDef { oid, names, description, sup, kind, must, may, raw: raw.to_string() })
}

/// Parse a single attributeType definition
fn parse_attribute_type(raw: &str) -> Option<AttributeTypeDef> {
    let tokens = tokenize(raw);
    if tokens.len() < 3 { return None; }

    let mut pos = 0;
    if tokens.get(pos).map(|t| t.as_str()) == Some("(") { pos += 1; }

    let oid = if pos < tokens.len() { tokens[pos].clone() } else { return None; };
    pos += 1;

    let mut names = Vec::new();
    let mut description = String::new();
    let mut syntax = String::new();
    let mut single_value = false;
    let mut equality = String::new();
    let mut ordering = String::new();
    let mut substr = String::new();
    let mut sup = String::new();
    let mut usage = String::new();
    let mut no_user_modification = false;

    while pos < tokens.len() {
        let kw = tokens[pos].to_uppercase();
        match kw.as_str() {
            ")" => break,
            "NAME" => { pos += 1; names = read_oid_list(&tokens, &mut pos); }
            "DESC" => { pos += 1; description = read_single(&tokens, &mut pos); }
            "SUP" => { pos += 1; sup = read_single(&tokens, &mut pos); }
            "SYNTAX" => { pos += 1; syntax = read_single(&tokens, &mut pos); }
            "SINGLE-VALUE" => { single_value = true; pos += 1; }
            "EQUALITY" => { pos += 1; equality = read_single(&tokens, &mut pos); }
            "ORDERING" => { pos += 1; ordering = read_single(&tokens, &mut pos); }
            "SUBSTR" => { pos += 1; substr = read_single(&tokens, &mut pos); }
            "USAGE" => { pos += 1; usage = read_single(&tokens, &mut pos); }
            "NO-USER-MODIFICATION" => { no_user_modification = true; pos += 1; }
            "COLLECTIVE" | "OBSOLETE" => { pos += 1; }
            _ => {
                pos += 1;
                if pos < tokens.len() && tokens[pos] != ")" && !is_keyword(&tokens[pos]) {
                    if tokens[pos] == "(" {
                        while pos < tokens.len() && tokens[pos] != ")" { pos += 1; }
                        if pos < tokens.len() { pos += 1; }
                    } else {
                        pos += 1;
                    }
                }
            }
        }
    }

    Some(AttributeTypeDef { oid, names, description, syntax, single_value, equality, ordering, substr, sup, usage, no_user_modification, raw: raw.to_string() })
}

/// Parse a matching rule definition
fn parse_matching_rule(raw: &str) -> Option<MatchingRuleDef> {
    let tokens = tokenize(raw);
    if tokens.len() < 3 { return None; }

    let mut pos = 0;
    if tokens.get(pos).map(|t| t.as_str()) == Some("(") { pos += 1; }

    let oid = if pos < tokens.len() { tokens[pos].clone() } else { return None; };
    pos += 1;

    let mut names = Vec::new();
    let mut description = String::new();
    let mut syntax = String::new();

    while pos < tokens.len() {
        let kw = tokens[pos].to_uppercase();
        match kw.as_str() {
            ")" => break,
            "NAME" => { pos += 1; names = read_oid_list(&tokens, &mut pos); }
            "DESC" => { pos += 1; description = read_single(&tokens, &mut pos); }
            "SYNTAX" => { pos += 1; syntax = read_single(&tokens, &mut pos); }
            _ => { pos += 1; }
        }
    }

    Some(MatchingRuleDef { oid, names, description, syntax, raw: raw.to_string() })
}

/// Parse an ldapSyntax definition
fn parse_ldap_syntax(raw: &str) -> Option<LdapSyntaxDef> {
    let tokens = tokenize(raw);
    if tokens.len() < 2 { return None; }

    let mut pos = 0;
    if tokens.get(pos).map(|t| t.as_str()) == Some("(") { pos += 1; }

    let oid = if pos < tokens.len() { tokens[pos].clone() } else { return None; };
    pos += 1;

    let mut description = String::new();

    while pos < tokens.len() {
        let kw = tokens[pos].to_uppercase();
        match kw.as_str() {
            ")" => break,
            "DESC" => { pos += 1; description = read_single(&tokens, &mut pos); }
            _ => { pos += 1; }
        }
    }

    Some(LdapSyntaxDef { oid, description, raw: raw.to_string() })
}

fn is_keyword(token: &str) -> bool {
    matches!(
        token.to_uppercase().as_str(),
        "NAME" | "DESC" | "SUP" | "ABSTRACT" | "STRUCTURAL" | "AUXILIARY"
            | "MUST" | "MAY" | "SYNTAX" | "SINGLE-VALUE" | "EQUALITY"
            | "ORDERING" | "SUBSTR" | "USAGE" | "NO-USER-MODIFICATION"
            | "COLLECTIVE" | "OBSOLETE" | ")" | "("
    )
}

// ═══════════════════════════════════════════════════════════════
//  Tauri commands
// ═══════════════════════════════════════════════════════════════

/// Fetch and parse the full LDAP schema from the server.
///
/// Steps:
///   1) Read RootDSE to find subschemaSubentry DN
///   2) Read that entry for objectClasses, attributeTypes, matchingRules, ldapSyntaxes
///   3) Parse each definition string with our light RFC 4512 parser
#[tauri::command]
pub fn fetch_schema(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<SchemaBundle, String> {
    let req_id = new_request_id();
    let start = Instant::now();
    log_command_start("fetch_schema", &req_id, "");

    let app_state = state.lock().unwrap();
    let ldap_conn = &mut *app_state.ldap_connection.lock().unwrap();

    let conn = ldap_conn
        .as_mut()
        .ok_or_else(|| {
            let msg = "No LDAP connection available".to_string();
            log_command_error("fetch_schema", &req_id, start, &msg);
            msg
        })?;

    // Step 1: Find subschemaSubentry from RootDSE
    let (root_results, _) = conn
        .search("", Scope::Base, "(objectClass=*)", vec!["subschemaSubentry"])
        .map_err(|e| format!("RootDSE search failed: {}", e))?
        .success()
        .map_err(|e| format!("RootDSE result error: {}", e))?;

    let subschema_dn = root_results
        .into_iter()
        .next()
        .and_then(|entry| {
            let se = SearchEntry::construct(entry);
            se.attrs
                .get("subschemaSubentry")
                .or_else(|| se.attrs.get("subschemasubentry"))
                .and_then(|v| v.first().cloned())
        })
        .unwrap_or_else(|| "cn=Subschema".to_string()); // common fallback

    // Step 2: Read schema attributes from the subschemaSubentry
    let schema_attrs = vec![
        "objectClasses",
        "attributeTypes",
        "matchingRules",
        "ldapSyntaxes",
    ];

    let (schema_results, _) = conn
        .search(
            &subschema_dn,
            Scope::Base,
            "(objectClass=*)",
            schema_attrs,
        )
        .map_err(|e| format!("Schema entry search failed ({}): {}", subschema_dn, e))?
        .success()
        .map_err(|e| format!("Schema entry result error: {}", e))?;

    let schema_entry = schema_results
        .into_iter()
        .next()
        .map(SearchEntry::construct);

    let get_vals = |key: &str| -> Vec<String> {
        schema_entry
            .as_ref()
            .and_then(|se| {
                se.attrs
                    .get(key)
                    .or_else(|| se.attrs.get(&key.to_lowercase()))
                    .cloned()
            })
            .unwrap_or_default()
    };

    // Step 3: Parse
    let object_classes: Vec<ObjectClassDef> = get_vals("objectClasses")
        .iter()
        .filter_map(|raw| parse_object_class(raw))
        .collect();

    let attribute_types: Vec<AttributeTypeDef> = get_vals("attributeTypes")
        .iter()
        .filter_map(|raw| parse_attribute_type(raw))
        .collect();

    let matching_rules: Vec<MatchingRuleDef> = get_vals("matchingRules")
        .iter()
        .filter_map(|raw| parse_matching_rule(raw))
        .collect();

    let ldap_syntaxes: Vec<LdapSyntaxDef> = get_vals("ldapSyntaxes")
        .iter()
        .filter_map(|raw| parse_ldap_syntax(raw))
        .collect();

    tracing::info!(
        req_id = req_id,
        object_classes = object_classes.len(),
        attribute_types = attribute_types.len(),
        matching_rules = matching_rules.len(),
        ldap_syntaxes = ldap_syntaxes.len(),
        "fetch_schema parsed"
    );
    log_command_end("fetch_schema", &req_id, start);
    Ok(SchemaBundle {
        object_classes,
        attribute_types,
        matching_rules,
        ldap_syntaxes,
        subschema_dn,
    })
}
