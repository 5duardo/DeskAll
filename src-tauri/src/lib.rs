#[cfg(windows)]
mod autostart;
mod icons;
mod installed;
mod process;
mod system_info;
mod game_covers;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub name: String,
    pub extension: Option<String>,
    pub kind: String,
    pub on_desktop: bool,
}

fn desktop_dir() -> Result<PathBuf, String> {
    dirs::desktop_dir().ok_or_else(|| "No se encontró la carpeta Escritorio".into())
}

fn path_is_on_desktop(path: &Path) -> bool {
    let Ok(desktop) = desktop_dir() else {
        return false;
    };
    let desk = desktop.canonicalize().unwrap_or(desktop);
    let candidate = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    candidate.starts_with(&desk)
}

fn looks_like_game(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    const HINTS: &[&str] = &[
        "steam",
        "steamapps",
        "epic games",
        "epicgames",
        "riot games",
        "ubisoft",
        "battle.net",
        "battlenet",
        "gog galaxy",
        "gog games",
        "xbox games",
        "ea games",
        "origin games",
        "rockstar games",
        "minecraft",
        "roblox",
        "valorant",
        "league of legends",
    ];
    HINTS.iter().any(|h| s.contains(h))
}

fn detect_kind(path: &Path, is_dir: bool) -> String {
    if is_dir {
        #[cfg(target_os = "macos")]
        {
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                return if looks_like_game(path) {
                    "game".into()
                } else {
                    "app".into()
                };
            }
        }
        return "folder".into();
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "exe" | "lnk" | "bat" | "cmd" | "com" | "msi" | "app" | "appimage" | "desktop" => {
            if looks_like_game(path) {
                "game".into()
            } else {
                "app".into()
            }
        }
        "url" | "webloc" => "url".into(),
        _ => "file".into(),
    }
}

#[tauri::command]
fn get_path_info(path: String) -> PathInfo {
    let p = Path::new(&path);
    let exists = p.exists();
    let is_dir = exists && p.is_dir();
    let is_file = exists && p.is_file();
    let name = p
        .file_stem()
        .or_else(|| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or(&path)
        .to_string();
    let extension = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    let kind = if exists {
        detect_kind(p, is_dir)
    } else if path.starts_with("http://") || path.starts_with("https://") {
        "url".into()
    } else {
        "file".into()
    };

    PathInfo {
        exists,
        is_dir,
        is_file,
        name,
        extension,
        kind,
        on_desktop: path_is_on_desktop(p),
    }
}

#[tauri::command]
fn extract_file_icon(path: String) -> Option<String> {
    icons::extract_icon_data_url(&path)
}

#[tauri::command]
fn list_file_icons(path: String) -> Vec<String> {
    icons::list_icon_data_urls(&path)
}

#[tauri::command]
fn get_desktop_dir() -> Result<String, String> {
    desktop_dir().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn is_on_desktop(path: String) -> bool {
    path_is_on_desktop(Path::new(&path))
}

/// Deletes a file/shortcut only if it lives on the OS Desktop.
#[tauri::command]
fn delete_desktop_item(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !path_is_on_desktop(p) {
        return Err("Solo se pueden borrar archivos del Escritorio del sistema".into());
    }
    if !p.exists() {
        return Err("El archivo ya no existe".into());
    }
    if p.is_dir() {
        return Err("Por seguridad no se borran carpetas del Escritorio".into());
    }
    fs::remove_file(p).map_err(|e| format!("No se pudo borrar: {e}"))
}

fn library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver app data: {e}"))?
        .join("library");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear library: {e}"))?;
    Ok(dir)
}

fn unique_library_dest(dir: &Path, src: &Path) -> PathBuf {
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("item");
    let dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("item");
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    dir.join(format!("{stem}-{stamp}{ext}"))
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("No se pudo crear carpeta: {e}"))?;
    let entries = fs::read_dir(src).map_err(|e| format!("No se pudo leer carpeta: {e}"))?;
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let from = entry.path();
        let to = dest.join(entry.file_name());

        // Skip symlinks / junctions to avoid loops and crashes
        let meta = match fs::symlink_metadata(&from) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }

        if meta.is_dir() {
            // Don't copy destination into itself
            if let (Ok(a), Ok(b)) = (from.canonicalize(), dest.canonicalize()) {
                if b.starts_with(&a) {
                    continue;
                }
            }
            copy_dir_recursive(&from, &to)?;
        } else if meta.is_file() {
            // Skip locked/unreadable files instead of aborting the whole folder
            let _ = fs::copy(&from, &to);
        }
    }
    Ok(())
}

fn copy_path_to_library(app: &tauri::AppHandle, path: &str) -> Result<String, String> {
    let src = Path::new(path);
    if !src.exists() {
        return Err("La ruta no existe".into());
    }
    let dir = library_dir(app)?;

    let src_canon = src.canonicalize().unwrap_or_else(|_| src.to_path_buf());
    let dir_canon = dir.canonicalize().unwrap_or_else(|_| dir.clone());
    if src_canon.starts_with(&dir_canon) {
        return Ok(src_canon.to_string_lossy().into_owned());
    }

    // Refuse copying the library root or a parent of it
    if dir_canon.starts_with(&src_canon) {
        return Err("No se puede copiar una carpeta que contiene la librería".into());
    }

    let dest = unique_library_dest(&dir, src);

    if src.is_dir() {
        copy_dir_recursive(src, &dest)?;
    } else {
        fs::copy(src, &dest).map_err(|e| format!("No se pudo copiar a library: {e}"))?;
    }

    Ok(dest.to_string_lossy().into_owned())
}

/// Copies a file, shortcut or folder into DeskAll's library.
/// Runs off the UI thread to avoid freezing / crashing on large folders.
#[tauri::command]
async fn copy_to_library(app: tauri::AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || copy_path_to_library(&app, &path))
        .await
        .map_err(|e| format!("Copia interrumpida: {e}"))?
}

/// Ensure path lives in library (copy if needed), then delete Desktop original if requested.
/// Desktop folders are never deleted automatically (only files/shortcuts).
#[tauri::command]
async fn import_to_library(
    app: tauri::AppHandle,
    path: String,
    delete_desktop_original: bool,
) -> Result<String, String> {
    let src_path = path.clone();
    let on_desk = path_is_on_desktop(Path::new(&path));
    let is_dir = Path::new(&path).is_dir();

    let library_path = {
        let app2 = app.clone();
        let path2 = path.clone();
        tauri::async_runtime::spawn_blocking(move || copy_path_to_library(&app2, &path2))
            .await
            .map_err(|e| format!("Copia interrumpida: {e}"))??
    };

    if delete_desktop_original && on_desk && !is_dir {
        let lib = Path::new(&library_path);
        let src = Path::new(&src_path);
        let same = lib
            .canonicalize()
            .ok()
            .zip(src.canonicalize().ok())
            .map(|(a, b)| a == b)
            .unwrap_or(false);
        if !same {
            let _ = delete_desktop_item(src_path);
        }
    }
    Ok(library_path)
}

#[tauri::command]
async fn move_desktop_to_library(app: tauri::AppHandle, path: String) -> Result<String, String> {
    if !path_is_on_desktop(Path::new(&path)) {
        return Err("Solo se puede mover desde el Escritorio del sistema".into());
    }
    import_to_library(app, path, true).await
}

#[tauri::command]
fn get_library_dir(app: tauri::AppHandle) -> Result<String, String> {
    library_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified_ms: Option<u64>,
    extension: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct KnownFolder {
    id: String,
    label: String,
    path: String,
}

/// Quick-access folders for the Archivos explorer.
#[tauri::command]
fn list_known_folders(app: tauri::AppHandle) -> Vec<KnownFolder> {
    let mut out = Vec::new();
    let push = |out: &mut Vec<KnownFolder>, id: &str, label: &str, path: Option<PathBuf>| {
        if let Some(p) = path {
            if p.is_dir() {
                out.push(KnownFolder {
                    id: id.into(),
                    label: label.into(),
                    path: p.to_string_lossy().into_owned(),
                });
            }
        }
    };
    push(&mut out, "home", "Inicio", dirs::home_dir());
    push(&mut out, "desktop", "Escritorio", dirs::desktop_dir());
    push(&mut out, "documents", "Documentos", dirs::document_dir());
    push(&mut out, "downloads", "Descargas", dirs::download_dir());
    push(&mut out, "pictures", "Imágenes", dirs::picture_dir());
    push(&mut out, "music", "Música", dirs::audio_dir());
    push(&mut out, "videos", "Vídeos", dirs::video_dir());
    if let Ok(lib) = library_dir(&app) {
        out.push(KnownFolder {
            id: "library".into(),
            label: "Librería DeskAll".into(),
            path: lib.to_string_lossy().into_owned(),
        });
    }
    out
}

/// List files and folders in a directory (explorer-style).
#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err("La ruta no es una carpeta".into());
    }
    let mut entries = Vec::new();
    let rd = fs::read_dir(dir).map_err(|e| format!("No se pudo leer la carpeta: {e}"))?;
    for entry in rd.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        // Skip hidden / system noise on Windows
        if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
            continue;
        }
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(p.is_dir());
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ms = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        let extension = if is_dir {
            None
        } else {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
        };
        entries.push(DirEntryInfo {
            name,
            path: p.to_string_lossy().into_owned(),
            is_dir,
            size,
            modified_ms,
            extension,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

fn open_with_shell(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let to_wide = |s: &str| -> Vec<u16> {
            OsStr::new(s)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        };

        let path = Path::new(target);
        // Folders: prefer explorer (more reliable than PowerShell Start-Process)
        if path.is_dir() {
            let status = std::process::Command::new("explorer")
                .arg(path.as_os_str())
                .spawn()
                .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))?;
            let _ = status;
            return Ok(());
        }

        let file = to_wide(target);
        let verb = to_wide("open");
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // Values > 32 mean success (legacy HINSTANCE semantics)
        if (result.0 as isize) > 32 {
            return Ok(());
        }

        // Fallback: cmd start (handles .lnk / associations)
        let status = std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|e| format!("No se pudo abrir: {e}"))?;
        let _ = status;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        open::that(target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn launch_item(target: String) -> Result<(), String> {
    if target.starts_with("http://") || target.starts_with("https://") {
        return open::that(&target).map_err(|e| format!("No se pudo abrir URL: {e}"));
    }
    let p = Path::new(&target);
    if !p.exists() && !target.starts_with("http") {
        return Err("La ruta ya no existe".into());
    }
    open_with_shell(&target)
}

#[tauri::command]
fn get_clipboard_store_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver app data: {e}"))?;
    Ok(dir.join("deskall.json").to_string_lossy().into_owned())
}

fn clipboard_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver app data: {e}"))?
        .join("clipboard");
    Ok(dir)
}

fn clipboard_kind_dir(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    let sub = match kind {
        "image" | "images" => "images",
        _ => "text",
    };
    let dir = clipboard_root(app)?.join(sub);
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear carpeta: {e}"))?;
    Ok(dir)
}

#[tauri::command]
fn get_clipboard_kind_dir(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    clipboard_kind_dir(&app, &kind).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_clipboard_text(app: tauri::AppHandle, id: String, text: String) -> Result<String, String> {
    let dir = clipboard_kind_dir(&app, "text")?;
    let path = dir.join(format!("{id}.txt"));
    fs::write(&path, text.as_bytes()).map_err(|e| format!("No se pudo guardar texto: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_clipboard_image(
    app: tauri::AppHandle,
    id: String,
    data_url: String,
) -> Result<String, String> {
    use base64::Engine;
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .or_else(|| data_url.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| data_url.strip_prefix("data:image/webp;base64,"))
        .unwrap_or(data_url.as_str());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Base64 inválido: {e}"))?;
    let dir = clipboard_kind_dir(&app, "image")?;
    let ext = if data_url.contains("image/jpeg") {
        "jpg"
    } else if data_url.contains("image/webp") {
        "webp"
    } else {
        "png"
    };
    let path = dir.join(format!("{id}.{ext}"));
    fs::write(&path, bytes).map_err(|e| format!("No se pudo guardar imagen: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_clipboard_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_file() {
        fs::remove_file(p).map_err(|e| format!("No se pudo borrar: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn reveal_item(path: String) -> Result<(), String> {
    let p = Path::new(&path);

    #[cfg(windows)]
    {
        if p.exists() && p.is_file() {
            // explorer /select often returns non-zero even on success
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", p.to_string_lossy()))
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    {
        if p.exists() {
            let status = std::process::Command::new("open")
                .args(["-R", &p.to_string_lossy()])
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                return Ok(());
            }
        }
    }

    if p.is_dir() {
        open::that(p).map_err(|e| e.to_string())
    } else if let Some(parent) = p.parent() {
        // Ensure the data folder exists even if the store file is missing yet
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        open::that(parent).map_err(|e| e.to_string())
    } else {
        Err("No se pudo revelar la ruta".into())
    }
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear carpeta: {e}"))?;
    }
    fs::write(&path, contents).map_err(|e| format!("No se pudo guardar: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("No se pudo leer: {e}"))
}

#[tauri::command]
async fn list_installed_apps() -> Result<Vec<installed::InstalledApp>, String> {
    tauri::async_runtime::spawn_blocking(installed::list_installed_apps)
        .await
        .map_err(|e| format!("Escaneo interrumpido: {e}"))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
enum InstalledScanEvent {
    Batch(Vec<installed::InstalledApp>),
    Done { total: usize },
}

/// Streams installed apps in small batches so the UI can render progressively.
#[tauri::command]
fn scan_installed_apps(on_event: tauri::ipc::Channel<InstalledScanEvent>) {
    std::thread::spawn(move || {
        let total = installed::scan_installed_apps_batched(|batch| {
            let _ = on_event.send(InstalledScanEvent::Batch(batch));
        });
        let _ = on_event.send(InstalledScanEvent::Done { total });
    });
}

/// Returns which of the given shortcut paths currently have a running process.
#[tauri::command]
fn which_are_running(paths: Vec<String>) -> Vec<String> {
    process::which_are_running(paths)
}

/// Snapshot of hostname, OS, CPU, RAM and disks.
#[tauri::command]
fn get_system_info() -> system_info::SystemInfo {
    system_info::collect()
}

/// Wikipedia cover art for games/apps (works for Epic-only titles like Rocket League).
#[tauri::command]
fn search_game_covers(query: String, limit: Option<u32>, prefer_game: Option<bool>) -> Vec<game_covers::GameCover> {
    game_covers::search_covers(
        &query,
        limit.unwrap_or(12) as usize,
        prefer_game.unwrap_or(true),
    )
}

/// Download a remote image as a square PNG data URL (avoids browser CORS).
#[tauri::command]
fn fetch_remote_image_png(url: String, size: Option<u32>) -> Result<String, String> {
    game_covers::fetch_image_png_data_url(&url, size.unwrap_or(192))
}

#[tauri::command]
fn set_launch_at_startup(enabled: bool, minimized: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        autostart::set_launch_at_startup(enabled, minimized)
    }
    #[cfg(not(windows))]
    {
        let _ = (enabled, minimized);
        Err("Inicio automático solo disponible en Windows".into())
    }
}

#[tauri::command]
fn is_launch_at_startup() -> Result<bool, String> {
    #[cfg(windows)]
    {
        autostart::is_launch_at_startup()
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_minimized = std::env::args().any(|a| a == "--minimized");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            if let Some(win) = app.get_webview_window("main") {
                if start_minimized {
                    let _ = win.minimize();
                } else {
                    let _ = win.maximize();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_path_info,
            extract_file_icon,
            list_file_icons,
            get_desktop_dir,
            is_on_desktop,
            delete_desktop_item,
            copy_to_library,
            move_desktop_to_library,
            import_to_library,
            get_library_dir,
            list_known_folders,
            list_directory,
            list_installed_apps,
            scan_installed_apps,
            write_text_file,
            read_text_file,
            launch_item,
            which_are_running,
            get_system_info,
            search_game_covers,
            fetch_remote_image_png,
            reveal_item,
            get_clipboard_store_path,
            get_clipboard_kind_dir,
            save_clipboard_text,
            save_clipboard_image,
            delete_clipboard_file,
            set_launch_at_startup,
            is_launch_at_startup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
