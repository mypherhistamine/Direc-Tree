use std::fs;
use std::path::PathBuf;

use crate::models::ldap_profile::LdapProfile;

/// Returns the path to the profiles JSON file in the app config directory.
fn profiles_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join("direc-tree");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    Ok(app_dir.join("profiles.json"))
}

fn read_profiles_from_disk() -> Result<Vec<LdapProfile>, String> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read profiles file: {}", e))?;
    let profiles: Vec<LdapProfile> =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse profiles: {}", e))?;
    Ok(profiles)
}

fn write_profiles_to_disk(profiles: &[LdapProfile]) -> Result<(), String> {
    let path = profiles_path()?;
    let data = serde_json::to_string_pretty(profiles)
        .map_err(|e| format!("Failed to serialize profiles: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write profiles file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_profiles() -> Result<Vec<LdapProfile>, String> {
    read_profiles_from_disk()
}

#[tauri::command]
pub fn upsert_profile(profile: LdapProfile) -> Result<(), String> {
    let mut profiles = read_profiles_from_disk()?;
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        profiles.push(profile);
    }
    write_profiles_to_disk(&profiles)
}

#[tauri::command]
pub fn delete_profile(profile_id: String) -> Result<(), String> {
    let mut profiles = read_profiles_from_disk()?;
    profiles.retain(|p| p.id != profile_id);
    write_profiles_to_disk(&profiles)
}
