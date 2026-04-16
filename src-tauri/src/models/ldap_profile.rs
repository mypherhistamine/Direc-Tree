use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LdapProfile {
    pub id: String,
    pub name: String,
    pub url: String,
    pub bind_dn: String,
    pub password: String,
    #[serde(default)]
    pub base_dn: String,
}
