use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[cfg(windows)]
use winreg::{enums::*, RegKey};

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

#[cfg(windows)]
fn resolve_progid_command(progid: &str) -> Option<String> {
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let targets = [
        format!("{progid}\\shell\\open\\command"),
        format!("{progid}\\shell\\edit\\command"),
        format!("Applications\\{progid}\\shell\\open\\command"),
        format!("Applications\\{progid}\\shell\\edit\\command"),
    ];

    for target in &targets {
        // Try HKCR first
        if let Some(cmd) = try_read_command(&hkcr, target) {
            return Some(cmd);
        }
        // Try HKCU\Software\Classes
        if let Some(cmd) = try_read_command(
            &hkcu,
            &format!("Software\\Classes\\{target}"),
        ) {
            return Some(cmd);
        }
    }
    None
}

#[cfg(windows)]
fn try_read_command(hive: &RegKey, key_path: &str) -> Option<String> {
    if let Ok(key) = hive.open_subkey_with_flags(key_path, KEY_READ) {
        // Default value as string
        if let Ok(cmd) = key.get_value::<String, _>("") {
            return Some(cmd);
        }
        // Sometimes stored as raw REG_SZ via get_raw_value
        if let Ok(raw) = key.get_raw_value("") {
            let cmd = reg_value_to_string(raw);
            if !cmd.is_empty() {
                return Some(cmd);
            }
        }
    }
    None
}

#[cfg(windows)]
fn reg_value_to_string(raw: winreg::RegValue) -> String {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    match raw.vtype {
        winreg::enums::REG_SZ | winreg::enums::REG_EXPAND_SZ => {
            let bytes = &raw.bytes;
            if bytes.len() < 2 {
                return String::new();
            }
            // Remove trailing null bytes
            let end = if bytes.len() >= 2
                && bytes[bytes.len() - 1] == 0
                && bytes[bytes.len() - 2] == 0
            {
                bytes.len() - 2
            } else {
                bytes.len()
            };
            let pairs: Vec<u16> = bytes[..end]
                .chunks(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect();
            OsString::from_wide(&pairs)
                .to_string_lossy()
                .into_owned()
        }
        _ => String::new(),
    }
}

#[cfg(windows)]
fn extract_exe_from_command(cmd: &str) -> Option<String> {
    let s = cmd.trim();
    if s.is_empty() {
        return None;
    }
    let mut exe = s.to_string();
    if let Some(stripped) = s.strip_prefix('"') {
        if let Some(end) = stripped.find('"') {
            exe = stripped[..end].to_string();
        }
    }
    if exe == s {
        exe = s.split_whitespace().next().unwrap_or("").to_string();
    }
    let p = Path::new(&exe);
    if p.exists() && (exe.ends_with(".exe") || exe.ends_with(".com")) {
        Some(exe)
    } else {
        None
    }
}

#[cfg(windows)]
fn get_app_name_from_exe(exe_path: &str) -> String {
    Path::new(exe_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("App")
        .to_string()
}

#[cfg(windows)]
fn suggested_apps_for_extension(ext: &str) -> Vec<InstalledApp> {
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut seen = HashSet::new();
    let mut apps: Vec<InstalledApp> = Vec::new();

    fn try_add_exe(seen: &mut HashSet<String>, apps: &mut Vec<InstalledApp>, cmd: &str) {
        if let Some(exe) = extract_exe_from_command(cmd) {
            if seen.insert(exe.to_lowercase()) {
                let name = get_app_name_from_exe(&exe);
                apps.push(InstalledApp { name, path: exe });
            }
        }
    }

    let dot_ext = format!(".{}", ext.trim_start_matches('.'));

    // 1. Default ProgID for this extension
    if let Ok(key) = hkcr.open_subkey_with_flags(&dot_ext, KEY_READ) {
        if let Ok(default) = key.get_value::<String, _>("") {
            if let Some(cmd) = resolve_progid_command(&default) {
                try_add_exe(&mut seen, &mut apps, &cmd);
            }
        }
    }

    // 2. OpenWithProgids
    if let Ok(key) = hkcr.open_subkey_with_flags(&format!("{dot_ext}\\OpenWithProgids"), KEY_READ) {
        for name in key.enum_keys().flatten() {
            if let Some(cmd) = resolve_progid_command(&name) {
                try_add_exe(&mut seen, &mut apps, &cmd);
            }
        }
    }

    // 3. HKCU FileExts OpenWithList (MRU)
    let open_with_path = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\{dot_ext}\\OpenWithList"
    );
    if let Ok(key) = hkcu.open_subkey_with_flags(&open_with_path, KEY_READ) {
        for (name, _value) in key.enum_values().flatten() {
            if name == "MRUList" {
                continue;
            }
            if let Ok(val) = key.get_value::<String, _>(&name) {
                let exe_path = if val.to_lowercase().ends_with(".exe") {
                    val.clone()
                } else {
                    format!("{val}.exe")
                };
                let found = Path::new(&exe_path).exists();
                if !found {
                    if let Some(cmd) = resolve_progid_command(&val) {
                        if let Some(exe) = extract_exe_from_command(&cmd) {
                            if Path::new(&exe).exists() {
                                if seen.insert(exe.to_lowercase()) {
                                    apps.push(InstalledApp {
                                        name: get_app_name_from_exe(&exe),
                                        path: exe,
                                    });
                                }
                            }
                        }
                    }
                }
                if found && seen.insert(exe_path.to_lowercase()) {
                    apps.push(InstalledApp {
                        name: Path::new(&exe_path)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("App")
                            .to_string(),
                        path: exe_path,
                    });
                }
            }
        }
    }

    // 4. HKCU Explorer FileExts Application (user-assigned apps)
    let app_key = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\{dot_ext}\\Application"
    );
    if let Ok(key) = hkcu.open_subkey_with_flags(&app_key, KEY_READ) {
        if let Ok(app) = key.get_value::<String, _>("Application") {
            if seen.insert(app.to_lowercase()) {
                if let Some(cmd) = resolve_progid_command(&app) {
                    try_add_exe(&mut seen, &mut apps, &cmd);
                }
            }
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[cfg(windows)]
fn suggested_apps_for_directory() -> Vec<InstalledApp> {
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut seen = HashSet::new();
    let mut apps: Vec<InstalledApp> = Vec::new();

    fn try_add_exe(seen: &mut HashSet<String>, apps: &mut Vec<InstalledApp>, cmd: &str) {
        if let Some(exe) = extract_exe_from_command(cmd) {
            if seen.insert(exe.to_lowercase()) {
                let name = get_app_name_from_exe(&exe);
                apps.push(InstalledApp { name, path: exe });
            }
        }
    }

    // Directory shell verbs
    for class in &["Directory", "Folder"] {
        if let Ok(key) = hkcr.open_subkey_with_flags(&format!("{class}\\shell"), KEY_READ) {
            for verb in key.enum_keys().flatten() {
                if verb.eq_ignore_ascii_case("open") || verb.eq_ignore_ascii_case("explore") {
                    continue;
                }
                if let Some(cmd) = resolve_progid_command(&format!("{class}\\shell\\{verb}")) {
                    try_add_exe(&mut seen, &mut apps, &cmd);
                }
            }
        }
        if let Ok(key) = hkcu.open_subkey_with_flags(
            &format!("Software\\Classes\\{class}\\shell"),
            KEY_READ,
        ) {
            for verb in key.enum_keys().flatten() {
                if verb.eq_ignore_ascii_case("open") || verb.eq_ignore_ascii_case("explore") {
                    continue;
                }
                if let Some(cmd) = resolve_progid_command(&format!("{class}\\shell\\{verb}")) {
                    try_add_exe(&mut seen, &mut apps, &cmd);
                }
            }
        }
    }

    // * (all files) shell
    for base in &["*"] {
        if let Ok(key) = hkcr.open_subkey_with_flags(&format!("{base}\\shell"), KEY_READ) {
            for verb in key.enum_keys().flatten() {
                if verb.eq_ignore_ascii_case("open") {
                    continue;
                }
                if let Some(cmd) = resolve_progid_command(&format!("{base}\\shell\\{verb}")) {
                    try_add_exe(&mut seen, &mut apps, &cmd);
                }
            }
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

pub fn suggested_apps_for_path(path: &str) -> Vec<InstalledApp> {
    let p = Path::new(path);

    #[cfg(windows)]
    {
        let current_exe = std::env::current_exe()
            .ok()
            .map(|e| e.to_string_lossy().to_lowercase());

        let mut apps = if p.is_dir() {
            suggested_apps_for_directory()
        } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            if !ext.is_empty() {
                suggested_apps_for_extension(ext)
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        // Filter out DeskAll itself
        if let Some(ref exe) = current_exe {
            apps.retain(|app| {
                let app_path = app.path.to_lowercase();
                !app_path.contains("deskall")
                    && app_path != *exe
                    && !app.name.to_lowercase().contains("deskall")
            });
        }

        apps
    }

    #[cfg(not(windows))]
    {
        let _ = p;
        list_installed_apps()
    }
}
