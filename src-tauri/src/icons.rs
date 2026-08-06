use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;

/// Returns a `data:image/png;base64,...` string for the file/app icon, if available.
pub fn extract_icon_data_url(path: &str) -> Option<String> {
    let p = Path::new(path);
    if !p.exists() {
        return None;
    }

    #[cfg(windows)]
    {
        return extract_windows(path);
    }

    #[cfg(target_os = "macos")]
    {
        return extract_macos(p);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = p;
        None
    }
}

#[cfg(windows)]
fn extract_windows(path: &str) -> Option<String> {
    // Prefer resolved target for .lnk so we don't get the overlay arrow,
    // and so we pull the real high-res icon resource.
    let source = resolve_shortcut_target(path).unwrap_or_else(|| path.to_string());

    // 1) Best quality: IShellItemImageFactory @ 256
    if let Some(png) = extract_via_shell_item(&source, 256) {
        return Some(encode_data_url(&png));
    }

    // 2) Jumbo system image list (256) without overlay
    if let Some(png) = extract_via_image_list(&source, windows::Win32::UI::Shell::SHIL_JUMBO, 256)
    {
        return Some(encode_data_url(&png));
    }

    // 3) Extra-large (48)
    if let Some(png) =
        extract_via_image_list(&source, windows::Win32::UI::Shell::SHIL_EXTRALARGE, 48)
    {
        return Some(encode_data_url(&png));
    }

    // 4) Legacy fallback
    let b64 = windows_icons::get_icon_base64_by_path(&source).ok()?;
    let clean = b64
        .strip_prefix("data:image/png;base64,")
        .or_else(|| b64.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(b64.as_str());
    Some(format!("data:image/png;base64,{clean}"))
}

#[cfg(windows)]
fn encode_data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(png))
}

#[cfg(windows)]
fn extract_via_shell_item(path: &str, size: i32) -> Option<Vec<u8>> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::DeleteObject;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        SHCreateItemFromParsingName, IShellItemImageFactory, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
    };

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let factory: IShellItemImageFactory =
            SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
        let hbmp = factory
            .GetImage(
                SIZE {
                    cx: size,
                    cy: size,
                },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )
            .ok()?;

        let rgba = hbitmap_to_rgba(hbmp)?;
        let _ = DeleteObject(hbmp.into());
        let trimmed = trim_transparent(&rgba.0, rgba.1, rgba.2);
        rgba_to_png(&trimmed.0, trimmed.1, trimmed.2)
    }
}

#[cfg(windows)]
fn extract_via_image_list(path: &str, shil: u32, size: i32) -> Option<Vec<u8>> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_SYSICONINDEX};
    use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut sfi = SHFILEINFOW::default();
        let himl_raw = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            Default::default(),
            Some(&mut sfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX,
        );
        if himl_raw == 0 {
            return None;
        }

        let list: IImageList = SHGetImageList(shil as i32).ok()?;
        let hicon = list.GetIcon(sfi.iIcon, ILD_TRANSPARENT.0).ok()?;
        if hicon.is_invalid() {
            return None;
        }

        let rgba = hicon_to_rgba(hicon, size);
        let _ = DestroyIcon(hicon);
        let (pixels, w, h) = rgba?;
        let trimmed = trim_transparent(&pixels, w, h);
        rgba_to_png(&trimmed.0, trimmed.1, trimmed.2)
    }
}

#[cfg(windows)]
fn hicon_to_rgba(
    hicon: windows::Win32::UI::WindowsAndMessaging::HICON,
    size: i32,
) -> Option<(Vec<u8>, u32, u32)> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, PatBlt,
        ReleaseDC, SelectObject, BLACKNESS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, GetIconInfo, ICONINFO, DI_NORMAL};

    unsafe {
        let mut info = ICONINFO::default();
        GetIconInfo(hicon, &mut info).ok()?;

        let hdc_screen = GetDC(Some(HWND::default()));
        if hdc_screen.is_invalid() {
            return None;
        }
        let hdc = CreateCompatibleDC(Some(hdc_screen));
        let hbmp = CreateCompatibleBitmap(hdc_screen, size, size);
        let old = SelectObject(hdc, hbmp.into());

        let _ = PatBlt(hdc, 0, 0, size, size, BLACKNESS);
        let _ = DrawIconEx(hdc, 0, 0, hicon, size, size, 0, None, DI_NORMAL);

        let result = hbitmap_to_rgba_from_dc(hdc, hbmp, size, size);

        SelectObject(hdc, old);
        let _ = DeleteObject(hbmp.into());
        let _ = DeleteDC(hdc);
        let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
        if !info.hbmColor.is_invalid() {
            let _ = DeleteObject(info.hbmColor.into());
        }
        if !info.hbmMask.is_invalid() {
            let _ = DeleteObject(info.hbmMask.into());
        }

        result
    }
}

#[cfg(windows)]
fn hbitmap_to_rgba(
    hbmp: windows::Win32::Graphics::Gdi::HBITMAP,
) -> Option<(Vec<u8>, u32, u32)> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, GetDC, GetObjectW, ReleaseDC, BITMAP,
    };

    unsafe {
        let mut bmp = BITMAP::default();
        if GetObjectW(
            hbmp.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut _ as *mut _),
        ) == 0
        {
            return None;
        }
        let w = bmp.bmWidth;
        let h = bmp.bmHeight.abs();
        let hdc_screen = GetDC(Some(HWND::default()));
        let hdc = CreateCompatibleDC(Some(hdc_screen));
        let result = hbitmap_to_rgba_from_dc(hdc, hbmp, w, h);
        let _ = DeleteDC(hdc);
        let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
        result
    }
}

#[cfg(windows)]
fn hbitmap_to_rgba_from_dc(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    hbmp: windows::Win32::Graphics::Gdi::HBITMAP,
    width: i32,
    height: i32,
) -> Option<(Vec<u8>, u32, u32)> {
    use windows::Win32::Graphics::Gdi::{
        GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };

    unsafe {
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let ok = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        if ok == 0 {
            return None;
        }

        for px in pixels.chunks_exact_mut(4) {
            let (b, g, r, a) = (px[0], px[1], px[2], px[3]);
            let alpha = if a == 0 {
                if b | g | r == 0 {
                    0
                } else {
                    255
                }
            } else {
                a
            };
            px[0] = r;
            px[1] = g;
            px[2] = b;
            px[3] = alpha;
        }

        Some((pixels, width as u32, height as u32))
    }
}

/// Crop empty transparent padding (common with SHIL_JUMBO upscaled icons).
#[cfg(windows)]
fn trim_transparent(pixels: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    if width == 0 || height == 0 {
        return (pixels.to_vec(), width, height);
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            if pixels[i + 3] > 8 {
                found = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if !found {
        return (pixels.to_vec(), width, height);
    }

    // If content already fills most of the canvas, keep as-is
    let content_w = max_x - min_x + 1;
    let content_h = max_y - min_y + 1;
    if content_w as f32 / width as f32 > 0.85 && content_h as f32 / height as f32 > 0.85 {
        return (pixels.to_vec(), width, height);
    }

    // Pad a little so we don't clip soft edges
    let pad = 2u32;
    let x0 = min_x.saturating_sub(pad);
    let y0 = min_y.saturating_sub(pad);
    let x1 = (max_x + pad).min(width - 1);
    let y1 = (max_y + pad).min(height - 1);
    let out_w = x1 - x0 + 1;
    let out_h = y1 - y0 + 1;

    let mut out = vec![0u8; (out_w * out_h * 4) as usize];
    for y in 0..out_h {
        for x in 0..out_w {
            let src = (((y0 + y) * width + (x0 + x)) * 4) as usize;
            let dst = ((y * out_w + x) * 4) as usize;
            out[dst..dst + 4].copy_from_slice(&pixels[src..src + 4]);
        }
    }
    (out, out_w, out_h)
}

#[cfg(windows)]
fn rgba_to_png(pixels: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
        use image::ImageEncoder;
        encoder
            .write_image(pixels, width, height, image::ExtendedColorType::Rgba8)
            .ok()?;
    }
    Some(png_bytes)
}

#[cfg(windows)]
fn resolve_shortcut_target(path: &str) -> Option<String> {
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
        if target.is_empty() || !Path::new(&target).exists() {
            None
        } else {
            Some(target)
        }
    }
}

#[cfg(target_os = "macos")]
fn extract_macos(path: &Path) -> Option<String> {
    let icns = find_icns(path)?;
    let tmp = std::env::temp_dir().join(format!(
        "deskall-icon-{}.png",
        std::process::id()
    ));
    // Prefer largest representation
    let status = std::process::Command::new("sips")
        .args(["-s", "format", "png", "-Z", "256"])
        .arg(&icns)
        .arg("--out")
        .arg(&tmp)
        .status()
        .ok()?;
    if !status.success() || !tmp.exists() {
        return None;
    }
    let bytes = std::fs::read(&tmp).ok()?;
    let _ = std::fs::remove_file(&tmp);
    let img = image::load_from_memory(&bytes).ok()?.into_rgba8();
    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
        use image::ImageEncoder;
        encoder
            .write_image(
                img.as_raw(),
                img.width(),
                img.height(),
                image::ExtendedColorType::Rgba8,
            )
            .ok()?;
    }
    Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png_bytes)
    ))
}

#[cfg(target_os = "macos")]
fn find_icns(path: &Path) -> Option<std::path::PathBuf> {
    if path.extension().and_then(|e| e.to_str()) == Some("icns") {
        return Some(path.to_path_buf());
    }

    let resources = if path.extension().and_then(|e| e.to_str()) == Some("app") {
        path.join("Contents").join("Resources")
    } else {
        return None;
    };

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(resources) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("icns") {
                candidates.push(p);
            }
        }
    }
    candidates.sort_by_key(|p| {
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if name.contains("appicon") {
            0
        } else if name.contains("icon") {
            1
        } else {
            2
        }
    });
    candidates.into_iter().next()
}
