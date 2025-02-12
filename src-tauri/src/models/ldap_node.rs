use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LdapNode {
    pub dn: String,                // Distinguished Name
    pub attributes: Vec<String>,   // Attributes of the entry
    pub children: Vec<LdapNode>,   // Children of the entry
    pub toggled : bool,
    pub has_children: bool
}
