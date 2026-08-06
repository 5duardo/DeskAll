use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

const BATCH_SIZE: usize = 16;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

fn path_priority(path: &Path) -> u8 {
    let s = path.to_string_lossy().to_lowercase();
    if s.contains("\\programdata\\") {
        0
    } else if s.contains("\\start menu\\") {
        1
    } else {
        2
    }
}

fn push_unique(map: &mut BTreeMap<String, InstalledApp>, name: String, path: PathBuf) {
    let key = name.to_lowercase();
    let candidate = InstalledApp {
        name,
        path: path.to_string_lossy().into_owned(),
    };
    match map.get(&key) {
        None => {
            map.insert(key, candidate);
        }
        Some(existing) => {
            if path_priority(Path::new(&candidate.path)) < path_priority(Path::new(&existing.path))
            {
                map.insert(key, candidate);
            }
        }
    }
}

fn walk_shortcuts(dir: &Path, map: &mut BTreeMap<String, InstalledApp>, depth: u8) {
    if depth > 6 || !dir.is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            walk_shortcuts(&path, map, depth + 1);
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext != "lnk" && ext != "url" && ext != "exe" {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("App")
            .to_string();
        let lower = name.to_lowercase();
        if lower.contains("uninstall")
            || lower.contains("desinstalar")
            || lower.contains("help")
            || lower.contains("readme")
            || lower.contains("documentation")
        {
            continue;
        }
        push_unique(map, name, path);
    }
}

#[cfg(target_os = "macos")]
fn walk_applications(dir: &Path, map: &mut BTreeMap<String, InstalledApp>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            let name = path
                .file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("App")
                .to_string();
            push_unique(map, name, path);
        }
    }
}

fn flush_new(
    map: &BTreeMap<String, InstalledApp>,
    emitted: &mut HashSet<String>,
    on_batch: &mut dyn FnMut(Vec<InstalledApp>),
) {
    let mut fresh: Vec<InstalledApp> = Vec::new();
    for (k, v) in map.iter() {
        if emitted.insert(k.clone()) {
            fresh.push(v.clone());
        }
    }
    if fresh.is_empty() {
        return;
    }
    fresh.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    for chunk in fresh.chunks(BATCH_SIZE) {
        on_batch(chunk.to_vec());
        std::thread::sleep(Duration::from_millis(24));
    }
}

pub fn list_installed_apps() -> Vec<InstalledApp> {
    let mut map = BTreeMap::new();
    scan_into(&mut map);
    let mut list: Vec<_> = map.into_values().collect();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    list
}

fn scan_into(map: &mut BTreeMap<String, InstalledApp>) {
    #[cfg(windows)]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            walk_shortcuts(
                &PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
                map,
                0,
            );
        }
        if let Some(roaming) = dirs::data_dir() {
            walk_shortcuts(
                &roaming.join("Microsoft\\Windows\\Start Menu\\Programs"),
                map,
                0,
            );
        }
        if let Some(desktop) = dirs::desktop_dir() {
            walk_shortcuts(&desktop, map, 0);
        }
    }

    #[cfg(target_os = "macos")]
    {
        walk_applications(Path::new("/Applications"), map);
        if let Some(home) = dirs::home_dir() {
            walk_applications(&home.join("Applications"), map);
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        for c in [
            "/usr/share/applications",
            "/usr/local/share/applications",
        ] {
            walk_shortcuts(Path::new(c), map, 0);
        }
        if let Some(home) = dirs::home_dir() {
            walk_shortcuts(&home.join(".local/share/applications"), map, 0);
        }
    }
}

/// Scan source-by-source and emit small batches so the UI fills gradually.
pub fn scan_installed_apps_batched(mut on_batch: impl FnMut(Vec<InstalledApp>)) -> usize {
    let mut map = BTreeMap::new();
    let mut emitted = HashSet::new();

    #[cfg(windows)]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            walk_shortcuts(
                &PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
                &mut map,
                0,
            );
            flush_new(&map, &mut emitted, &mut on_batch);
        }
        if let Some(roaming) = dirs::data_dir() {
            walk_shortcuts(
                &roaming.join("Microsoft\\Windows\\Start Menu\\Programs"),
                &mut map,
                0,
            );
            flush_new(&map, &mut emitted, &mut on_batch);
        }
        if let Some(desktop) = dirs::desktop_dir() {
            walk_shortcuts(&desktop, &mut map, 0);
            flush_new(&map, &mut emitted, &mut on_batch);
        }
    }

    #[cfg(target_os = "macos")]
    {
        walk_applications(Path::new("/Applications"), &mut map);
        flush_new(&map, &mut emitted, &mut on_batch);
        if let Some(home) = dirs::home_dir() {
            walk_applications(&home.join("Applications"), &mut map);
            flush_new(&map, &mut emitted, &mut on_batch);
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        for c in [
            "/usr/share/applications",
            "/usr/local/share/applications",
        ] {
            walk_shortcuts(Path::new(c), &mut map, 0);
            flush_new(&map, &mut emitted, &mut on_batch);
        }
        if let Some(home) = dirs::home_dir() {
            walk_shortcuts(&home.join(".local/share/applications"), &mut map, 0);
            flush_new(&map, &mut emitted, &mut on_batch);
        }
    }

    map.len()
}
