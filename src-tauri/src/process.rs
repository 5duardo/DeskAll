//! Detect which shortcut targets are currently running as OS processes.

use std::collections::HashSet;
use std::path::Path;

fn normalize_path(path: &str) -> String {
    path.replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn file_name_lower(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_lowercase())
}

/// Launchers that many game shortcuts share — matching them would mark every
/// Steam/Epic title as "running" whenever the store is open.
fn is_shared_launcher(exe_name: &str) -> bool {
    matches!(
        exe_name,
        "steam.exe"
            | "steamwebhelper.exe"
            | "epicgameslauncher.exe"
            | "galaxyclient.exe"
            | "battle.net.exe"
            | "origin.exe"
            | "eadesktop.exe"
            | "riotclientservices.exe"
            | "upc.exe"
            | "ubisoftconnect.exe"
            | "legacygameslauncher.exe"
            | "gog galaxy.exe"
    )
}

#[cfg(windows)]
fn resolve_launch_target(path: &str) -> Option<(String, String)> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        IPersistFile,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink, SLGP_UNCPRIORITY};

    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    if ext.as_deref() != Some("lnk") {
        return None;
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist: IPersistFile = link.cast().ok()?;
        let wide: Vec<u16> = std::ffi::OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        persist.Load(PCWSTR(wide.as_ptr()), Default::default()).ok()?;

        let mut buf = vec![0u16; 260];
        link.GetPath(&mut buf, std::ptr::null_mut(), SLGP_UNCPRIORITY.0 as u32)
            .ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let target = String::from_utf16_lossy(&buf[..len]);
        if target.is_empty() {
            return None;
        }

        let mut args_buf = vec![0u16; 1024];
        let _ = link.GetArguments(&mut args_buf);
        let args_len = args_buf.iter().position(|&c| c == 0).unwrap_or(0);
        let args = String::from_utf16_lossy(&args_buf[..args_len]).to_lowercase();

        Some((target, args))
    }
}

fn resolve_target(path: &str) -> (String, String) {
    #[cfg(windows)]
    {
        if let Some((target, args)) = resolve_launch_target(path) {
            return (target, args);
        }
    }
    (path.to_string(), String::new())
}

#[cfg(windows)]
fn collect_running_exes() -> (HashSet<String>, HashSet<String>) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut paths = HashSet::new();
    let mut names = HashSet::new();

    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return (paths, names);
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut ok = Process32FirstW(snap, &mut entry).is_ok();
        while ok {
            let pid = entry.th32ProcessID;
            if pid > 0 {
                if let Ok(handle) =
                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                {
                    let mut buf = [0u16; 1024];
                    let mut size = buf.len() as u32;
                    if QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        windows::core::PWSTR(buf.as_mut_ptr()),
                        &mut size,
                    )
                    .is_ok()
                        && size > 0
                    {
                        let path = String::from_utf16_lossy(&buf[..size as usize]);
                        let norm = normalize_path(&path);
                        if let Some(name) = file_name_lower(&norm) {
                            names.insert(name);
                        }
                        paths.insert(norm);
                    }
                    let _ = CloseHandle(handle);
                }
            }
            ok = Process32NextW(snap, &mut entry).is_ok();
        }

        let _ = CloseHandle(snap);
    }

    (paths, names)
}

#[cfg(not(windows))]
fn collect_running_exes() -> (HashSet<String>, HashSet<String>) {
    (HashSet::new(), HashSet::new())
}

fn looks_like_game_via_launcher(args: &str) -> bool {
    args.contains("-applaunch")
        || args.contains("com.epicgames.launcher")
        || args.contains("uplay://")
        || args.contains("battlenet://")
        || args.contains("origin2://")
        || args.contains("rungameid")
}

/// Returns the subset of `paths` whose resolved executable is currently running.
pub fn which_are_running(paths: Vec<String>) -> Vec<String> {
    let (running_paths, running_names) = collect_running_exes();
    if running_paths.is_empty() && running_names.is_empty() {
        return Vec::new();
    }

    paths
        .into_iter()
        .filter(|path| {
            if path.is_empty() || path.starts_with("http://") || path.starts_with("https://")
            {
                return false;
            }

            let (target, args) = resolve_target(path);
            let norm = normalize_path(&target);
            let Some(name) = file_name_lower(&norm) else {
                return false;
            };

            // Game shortcuts that only point at Steam/Epic/etc. with launch args —
            // we cannot know the real game process from the .lnk alone.
            if is_shared_launcher(&name) && looks_like_game_via_launcher(&args) {
                return false;
            }

            if running_paths.contains(&norm) {
                return true;
            }

            // Basename fallback (same exe installed elsewhere / relocated)
            if !name.ends_with(".exe")
                || is_shared_launcher(&name)
                || matches!(
                    name.as_str(),
                    "explorer.exe"
                        | "cmd.exe"
                        | "powershell.exe"
                        | "pwsh.exe"
                        | "openwith.exe"
                        | "rundll32.exe"
                )
            {
                return false;
            }

            running_names.contains(&name)
        })
        .collect()
}
