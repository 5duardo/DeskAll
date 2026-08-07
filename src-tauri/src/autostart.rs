//! Windows Run-key autostart with optional --minimized.

use std::env;
use winreg::enums::*;
use winreg::RegKey;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "DeskAll";

fn exe_command(minimized: bool) -> Result<String, String> {
    let exe = env::current_exe().map_err(|e| format!("No se pudo resolver el ejecutable: {e}"))?;
    let path = exe.display();
    if minimized {
        Ok(format!("\"{path}\" --minimized"))
    } else {
        Ok(format!("\"{path}\""))
    }
}

pub fn set_launch_at_startup(enabled: bool, minimized: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(RUN_KEY)
        .map_err(|e| format!("No se pudo abrir la clave Run: {e}"))?;

    if !enabled {
        match key.delete_value(VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("No se pudo quitar el inicio automático: {e}")),
        }
    } else {
        let cmd = exe_command(minimized)?;
        key.set_value(VALUE_NAME, &cmd)
            .map_err(|e| format!("No se pudo registrar el inicio automático: {e}"))
    }
}

pub fn is_launch_at_startup() -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = match hkcu.open_subkey(RUN_KEY) {
        Ok(k) => k,
        Err(_) => return Ok(false),
    };
    match key.get_value::<String, _>(VALUE_NAME) {
        Ok(v) => Ok(!v.trim().is_empty()),
        Err(_) => Ok(false),
    }
}
