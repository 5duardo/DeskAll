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

/// All icon resources embedded in the file (exe/dll/ico), as data URLs.
pub fn list_icon_data_urls(path: &str) -> Vec<String> {
    let p = Path::new(path);
    if !p.exists() {
        return Vec::new();
    }

    #[cfg(windows)]
    {
        return list_windows_icons(path);
    }

    #[cfg(not(windows))]
    {
        extract_icon_data_url(path).into_iter().collect()
    }
}

#[cfg(windows)]
fn extract_windows(path: &str) -> Option<String> {
    let is_lnk = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("lnk"))
        .unwrap_or(false);

    // 1) For .lnk: Shell on the shortcut itself (uses IconLocation, matches Explorer).
    //    ExtractIconEx on the target often yields 32px → pixelated tiles, or the wrong
    //    resource (e.g. Discord Update.exe → generic document glyph).
    if is_lnk {
        if let Some(png) = extract_via_shell_item(path, 256) {
            return Some(encode_data_url(&png));
        }
        if let Some((icon_file, index)) = shortcut_icon_location(path) {
            if let Some(png) = extract_private_icons(&icon_file, index, 256) {
                return Some(encode_data_url(&png));
            }
            if let Some(png) = extract_via_shell_item(&icon_file, 256) {
                return Some(encode_data_url(&png));
            }
            if let Some(png) = extract_icon_index(&icon_file, index, 0) {
                return Some(encode_data_url(&png));
            }
        }
    }

    let source = resolve_shortcut_target(path).unwrap_or_else(|| path.to_string());

    // 2) Best quality: IShellItemImageFactory @ 256
    if let Some(png) = extract_via_shell_item(&source, 256) {
        return Some(encode_data_url(&png));
    }

    // 3) PrivateExtractIconsW requesting 256 (picks largest matching resource)
    if let Some(png) = extract_private_icons(&source, 0, 256) {
        return Some(encode_data_url(&png));
    }

    // 4) Jumbo system image list (256)
    if let Some(png) = extract_via_image_list(&source, windows::Win32::UI::Shell::SHIL_JUMBO, 0) {
        return Some(encode_data_url(&png));
    }

    // 5) Extra-large (48) — Lanczos upscale after trim
    if let Some(png) =
        extract_via_image_list(&source, windows::Win32::UI::Shell::SHIL_EXTRALARGE, 0)
    {
        return Some(encode_data_url(&png));
    }

    // 6) ExtractIconEx at native size (last resort — often only 32px)
    if let Some(png) = extract_icon_index(&source, 0, 0) {
        return Some(encode_data_url(&png));
    }

    // 7) Legacy crate fallback
    let b64 = windows_icons::get_icon_base64_by_path(&source).ok()?;
    let clean = b64
        .strip_prefix("data:image/png;base64,")
        .or_else(|| b64.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(b64.as_str());
    let raw = STANDARD.decode(clean).ok()?;
    let png = normalize_icon_png(&raw).unwrap_or(raw);
    Some(encode_data_url(&png))
}

#[cfg(windows)]
fn list_windows_icons(path: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let push = |url: String, out: &mut Vec<String>, seen: &mut std::collections::HashSet<String>| {
        let key = url.len().to_string() + &url[url.len().saturating_sub(48)..];
        if seen.insert(key) {
            out.push(url);
        }
    };

    // Default shell extraction first (best match for what Explorer shows)
    if let Some(def) = extract_windows(path) {
        push(def, &mut out, &mut seen);
    }

    let icon_source = shortcut_icon_location(path)
        .map(|(p, _)| p)
        .or_else(|| resolve_shortcut_target(path))
        .unwrap_or_else(|| path.to_string());

    let count = icon_count(&icon_source).unwrap_or(0).min(48);
    for i in 0..count {
        if let Some(png) = extract_private_icons(&icon_source, i as i32, 256)
            .or_else(|| extract_icon_index(&icon_source, i as i32, 0))
        {
            push(encode_data_url(&png), &mut out, &mut seen);
        }
    }

    if out.is_empty() {
        if let Some(one) = extract_icon_data_url(path) {
            out.push(one);
        }
    }
    out
}

#[cfg(windows)]
fn icon_count(path: &str) -> Option<u32> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ExtractIconExW;

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let n = ExtractIconExW(PCWSTR(wide.as_ptr()), -1, None, None, 0);
        if n == 0 {
            None
        } else {
            Some(n)
        }
    }
}

/// `size_hint` 0 = draw at the HICON's native bitmap size (no GDI stretch).
#[cfg(windows)]
fn extract_icon_index(path: &str, index: i32, size_hint: i32) -> Option<Vec<u8>> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut large = HICON::default();
        let got = ExtractIconExW(
            PCWSTR(wide.as_ptr()),
            index,
            Some(&mut large as *mut HICON),
            None,
            1,
        );
        if got == 0 || large.is_invalid() {
            return None;
        }
        let rgba = hicon_to_rgba(large, size_hint);
        let _ = DestroyIcon(large);
        let (pixels, w, h) = rgba?;
        finalize_rgba(pixels, w, h)
    }
}

/// Request a specific pixel size from the PE/ICO resource table.
#[cfg(windows)]
fn extract_private_icons(path: &str, index: i32, size: i32) -> Option<Vec<u8>> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};

    #[link(name = "user32")]
    unsafe extern "system" {
        fn PrivateExtractIconsW(
            sz_file_name: *const u16,
            n_icon_index: i32,
            cx_icon: i32,
            cy_icon: i32,
            phicon: *mut HICON,
            piconid: *mut u32,
            n_icons: u32,
            flags: u32,
        ) -> u32;
    }

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hicon = HICON::default();
        let mut icon_id = 0u32;
        let got = PrivateExtractIconsW(
            wide.as_ptr(),
            index,
            size,
            size,
            &mut hicon,
            &mut icon_id,
            1,
            0,
        );
        if got == 0 || hicon.is_invalid() {
            return None;
        }
        // Draw at requested size — PrivateExtractIcons already selected the best resource
        let rgba = hicon_to_rgba(hicon, size);
        let _ = DestroyIcon(hicon);
        let (pixels, w, h) = rgba?;
        // Reject tiny / failed extracts that would look pixelated after upscale
        if w.max(h) < 48 && size >= 128 {
            return None;
        }
        finalize_rgba(pixels, w, h)
    }
}

#[cfg(windows)]
fn encode_data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(png))
}

/// Trim padding and ensure the icon is large enough for the UI tiles.
#[cfg(windows)]
fn finalize_rgba(pixels: Vec<u8>, width: u32, height: u32) -> Option<Vec<u8>> {
    let trimmed = trim_icon_padding(&pixels, width, height);
    let scaled = upscale_if_small(&trimmed.0, trimmed.1, trimmed.2, 192);
    rgba_to_png(&scaled.0, scaled.1, scaled.2)
}

#[cfg(windows)]
fn normalize_icon_png(png: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(png).ok()?.into_rgba8();
    let (w, h) = (img.width(), img.height());
    finalize_rgba(img.into_raw(), w, h)
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
        SIIGBF_RESIZETOFIT,
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
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK | SIIGBF_RESIZETOFIT,
            )
            .ok()?;

        let rgba = hbitmap_to_rgba(hbmp)?;
        let _ = DeleteObject(hbmp.into());
        finalize_rgba(rgba.0, rgba.1, rgba.2)
    }
}

/// `size_hint` 0 = native HICON size (preferred — avoids GDI stretch of 32→256).
#[cfg(windows)]
fn extract_via_image_list(path: &str, shil: u32, size_hint: i32) -> Option<Vec<u8>> {
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

        let rgba = hicon_to_rgba(hicon, size_hint);
        let _ = DestroyIcon(hicon);
        let (pixels, w, h) = rgba?;
        finalize_rgba(pixels, w, h)
    }
}

/// Convert HICON → RGBA. If `size_hint` is 0, use the icon's native bitmap size
/// so we don't GDI-stretch a 32px glyph into a blurry/pixelated 256 canvas.
#[cfg(windows)]
fn hicon_to_rgba(
    hicon: windows::Win32::UI::WindowsAndMessaging::HICON,
    size_hint: i32,
) -> Option<(Vec<u8>, u32, u32)> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetObjectW,
        PatBlt, ReleaseDC, SelectObject, BITMAP, BLACKNESS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, GetIconInfo, ICONINFO, DI_NORMAL};

    unsafe {
        let mut info = ICONINFO::default();
        GetIconInfo(hicon, &mut info).ok()?;

        let size = if size_hint > 0 {
            size_hint
        } else {
            let mut bmp = BITMAP::default();
            let hb = if !info.hbmColor.is_invalid() {
                info.hbmColor
            } else {
                info.hbmMask
            };
            if GetObjectW(
                hb.into(),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut _),
            ) == 0
            {
                let _ = DeleteObject(info.hbmColor.into());
                let _ = DeleteObject(info.hbmMask.into());
                return None;
            }
            // Mask-only icons store AND+XOR stacked → height is 2×
            let h = if info.hbmColor.is_invalid() {
                bmp.bmHeight.abs() / 2
            } else {
                bmp.bmHeight.abs()
            };
            bmp.bmWidth.max(h).max(16)
        };

        let hdc_screen = GetDC(Some(HWND::default()));
        if hdc_screen.is_invalid() {
            if !info.hbmColor.is_invalid() {
                let _ = DeleteObject(info.hbmColor.into());
            }
            if !info.hbmMask.is_invalid() {
                let _ = DeleteObject(info.hbmMask.into());
            }
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

/// Crop empty padding. Handles:
/// - transparent / near-transparent pixels
/// - opaque black padding from GDI (connected to the image edge only,
///   so real black artwork inside the icon is preserved)
#[cfg(windows)]
fn trim_icon_padding(pixels: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    if width == 0 || height == 0 {
        return (pixels.to_vec(), width, height);
    }

    let len = (width * height) as usize;
    let mut is_pad = vec![false; len];

    for i in 0..len {
        let o = i * 4;
        let (r, g, b, a) = (pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]);
        // Transparent OR near-black (GDI/shell often leaves black padding)
        is_pad[i] = a < 16 || (r < 14 && g < 14 && b < 14);
    }

    // Flood-fill padding from the borders so interior black art stays
    let mut keep_pad = vec![false; len];
    let mut stack: Vec<(u32, u32)> = Vec::new();
    let push_edge = |x: u32, y: u32, stack: &mut Vec<(u32, u32)>, keep: &mut [bool], pad: &[bool]| {
        let i = (y * width + x) as usize;
        if pad[i] && !keep[i] {
            keep[i] = true;
            stack.push((x, y));
        }
    };

    for x in 0..width {
        push_edge(x, 0, &mut stack, &mut keep_pad, &is_pad);
        push_edge(x, height - 1, &mut stack, &mut keep_pad, &is_pad);
    }
    for y in 0..height {
        push_edge(0, y, &mut stack, &mut keep_pad, &is_pad);
        push_edge(width - 1, y, &mut stack, &mut keep_pad, &is_pad);
    }

    while let Some((x, y)) = stack.pop() {
        for (nx, ny) in [
            (x.wrapping_sub(1), y),
            (x + 1, y),
            (x, y.wrapping_sub(1)),
            (x, y + 1),
        ] {
            if nx >= width || ny >= height {
                continue;
            }
            let i = (ny * width + nx) as usize;
            if is_pad[i] && !keep_pad[i] {
                keep_pad[i] = true;
                stack.push((nx, ny));
            }
        }
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            // Content = not edge-connected padding
            if !keep_pad[i] {
                let o = i * 4;
                // Also skip fully transparent leftovers
                if pixels[o + 3] < 16 {
                    continue;
                }
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

    let content_w = max_x - min_x + 1;
    let content_h = max_y - min_y + 1;
    // Only skip trim when the glyph already fills the canvas
    if content_w as f32 / width as f32 > 0.92 && content_h as f32 / height as f32 > 0.92 {
        return (pixels.to_vec(), width, height);
    }

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
            // Clear edge padding pixels so object-contain stays clean
            let si = ((y0 + y) * width + (x0 + x)) as usize;
            if keep_pad[si] {
                out[dst + 3] = 0;
            }
        }
    }
    (out, out_w, out_h)
}

/// Upscale tiny icons (16/32/48) so tiles don't show a speck.
/// Uses Lanczos3 — much cleaner than GDI DrawIconEx stretch.
#[cfg(windows)]
fn upscale_if_small(
    pixels: &[u8],
    width: u32,
    height: u32,
    min_edge: u32,
) -> (Vec<u8>, u32, u32) {
    let edge = width.max(height);
    if edge == 0 || edge >= min_edge {
        return (pixels.to_vec(), width, height);
    }

    let scale = min_edge as f32 / edge as f32;
    let nw = ((width as f32) * scale).round().max(1.0) as u32;
    let nh = ((height as f32) * scale).round().max(1.0) as u32;

    let Some(img) = image::RgbaImage::from_raw(width, height, pixels.to_vec()) else {
        return (pixels.to_vec(), width, height);
    };
    let resized = image::imageops::resize(&img, nw, nh, image::imageops::FilterType::Lanczos3);
    (resized.into_raw(), nw, nh)
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

/// Icon file + index from a .lnk (often different from the launch target).
#[cfg(windows)]
fn shortcut_icon_location(path: &str) -> Option<(String, i32)> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        IPersistFile,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

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
        let mut icon_index = 0i32;
        link.GetIconLocation(&mut buf, &mut icon_index).ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let icon_path = String::from_utf16_lossy(&buf[..len]);
        if icon_path.is_empty() {
            return None;
        }
        // Expand env vars like %SystemRoot%\...
        let expanded = expand_env_path(&icon_path);
        if Path::new(&expanded).exists() {
            Some((expanded, icon_index))
        } else if Path::new(&icon_path).exists() {
            Some((icon_path, icon_index))
        } else {
            None
        }
    }
}

#[cfg(windows)]
fn expand_env_path(path: &str) -> String {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows::core::PCWSTR;
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let needed = ExpandEnvironmentStringsW(PCWSTR(wide.as_ptr()), None);
        if needed == 0 {
            return path.to_string();
        }
        let mut out = vec![0u16; needed as usize];
        let written = ExpandEnvironmentStringsW(PCWSTR(wide.as_ptr()), Some(&mut out));
        if written == 0 {
            return path.to_string();
        }
        let len = out.iter().position(|&c| c == 0).unwrap_or((written as usize).saturating_sub(1));
        std::ffi::OsString::from_wide(&out[..len])
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(windows)]
pub(crate) fn resolve_shortcut_target(path: &str) -> Option<String> {
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
