use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;
use ureq::Agent;

const WIKI_API: &str = "https://en.wikipedia.org/w/api.php";
const UA: &str = "DeskAll/0.1 (desktop launcher; icon search)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCover {
    pub id: String,
    pub label: String,
    pub preview_url: String,
    pub fetch_url: String,
    pub source: String,
}

#[derive(Deserialize)]
struct WikiQueryResponse {
    query: Option<WikiQuery>,
}

#[derive(Deserialize)]
struct WikiQuery {
    pages: Option<std::collections::HashMap<String, WikiPage>>,
}

#[derive(Deserialize)]
struct WikiPage {
    pageid: u64,
    title: String,
    index: Option<i32>,
    thumbnail: Option<WikiThumb>,
}

#[derive(Deserialize)]
struct WikiThumb {
    source: String,
}

fn http_agent(timeout_secs: u64) -> Agent {
    Agent::new_with_config(
        Agent::config_builder()
            .user_agent(UA)
            .timeout_global(Some(Duration::from_secs(timeout_secs)))
            .build(),
    )
}

fn strip_utm(url: &str) -> String {
    let mut out = url.to_string();
    for key in ["utm_source", "utm_campaign", "utm_content"] {
        if let Some(key_pos) = out.find(key) {
            let start = if key_pos > 0
                && (out.as_bytes()[key_pos - 1] == b'&' || out.as_bytes()[key_pos - 1] == b'?')
            {
                key_pos - 1
            } else {
                key_pos
            };
            let after_key = &out[key_pos + key.len()..];
            // skip =value
            let value_part = after_key.strip_prefix('=').unwrap_or(after_key);
            let value_len = value_part.find('&').unwrap_or(value_part.len());
            let end = key_pos + key.len() + (after_key.len() - value_part.len()) + value_len;
            let sep = out.as_bytes().get(start).copied();
            let mut next = String::new();
            next.push_str(&out[..start]);
            if sep == Some(b'?') {
                if end < out.len() && out.as_bytes()[end] == b'&' {
                    next.push('?');
                    next.push_str(&out[end + 1..]);
                } else if end < out.len() {
                    next.push_str(&out[end..]);
                }
            } else if end < out.len() {
                next.push_str(&out[end..]);
            }
            out = next.replace("?&", "?").trim_end_matches(['?', '&']).to_string();
        }
    }
    out
}

fn upscale_thumb(url: &str, px: u32) -> String {
    let clean = strip_utm(url);
    if let Some(idx) = clean.find("px-") {
        let before = &clean[..idx];
        if let Some(slash) = before.rfind('/') {
            return format!("{}{}{}", &clean[..slash + 1], px, &clean[idx..]);
        }
    }
    clean
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn wiki_get(params: &[(&str, &str)]) -> Result<WikiQueryResponse, String> {
    let mut url = format!("{WIKI_API}?");
    for (i, (k, v)) in params.iter().enumerate() {
        if i > 0 {
            url.push('&');
        }
        url.push_str(k);
        url.push('=');
        url.push_str(&urlencoding_encode(v));
    }
    let agent = http_agent(12);
    let mut res = agent
        .get(&url)
        .header("Accept", "application/json")
        .call()
        .map_err(|e| e.to_string())?;
    let body = res
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

/// Search Wikipedia for game (or app) cover art. Works for Epic-only titles.
pub fn search_covers(query: &str, limit: usize, prefer_game: bool) -> Vec<GameCover> {
    let q = query.trim();
    if q.len() < 2 || limit == 0 {
        return Vec::new();
    }

    let terms: Vec<String> = if prefer_game {
        vec![
            format!("{q} (video game)"),
            format!("{q} video game"),
            q.to_string(),
        ]
    } else {
        vec![
            format!("{q} software"),
            format!("{q} (software)"),
            q.to_string(),
        ]
    };

    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for term in terms {
        if out.len() >= limit {
            break;
        }
        let lim = ((limit + 4).min(12)).to_string();
        let data = match wiki_get(&[
            ("action", "query"),
            ("generator", "search"),
            ("gsrsearch", &term),
            ("gsrlimit", &lim),
            ("prop", "pageimages"),
            ("piprop", "thumbnail"),
            ("pithumbsize", "400"),
            ("format", "json"),
            ("origin", "*"),
        ]) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let mut pages: Vec<WikiPage> = data
            .query
            .and_then(|q| q.pages)
            .map(|m| m.into_values().collect())
            .unwrap_or_default();
        pages.sort_by_key(|p| p.index.unwrap_or(999));

        for p in pages {
            let Some(thumb) = p.thumbnail else {
                continue;
            };
            if !seen.insert(p.pageid) {
                continue;
            }
            let preview = strip_utm(&thumb.source);
            let fetch = upscale_thumb(&preview, 640);
            let label = p
                .title
                .split(" (")
                .next()
                .unwrap_or(&p.title)
                .trim()
                .to_string();
            out.push(GameCover {
                id: format!("wiki:{}", p.pageid),
                label,
                preview_url: preview,
                fetch_url: fetch,
                source: "wiki".into(),
            });
            if out.len() >= limit {
                break;
            }
        }
    }

    out
}

/// Download a remote image and return a square PNG data URL.
pub fn fetch_image_png_data_url(url: &str, size: u32) -> Result<String, String> {
    let agent = http_agent(20);
    let mut res = agent
        .get(url)
        .header("Accept", "image/*,*/*")
        .call()
        .map_err(|e| e.to_string())?;

    let mut bytes = Vec::new();
    res.body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;

    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.into_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let edge = size.max(64);

    let scale = (edge as f32 / w as f32).max(edge as f32 / h as f32);
    let nw = (w as f32 * scale).round().max(1.0) as u32;
    let nh = (h as f32 * scale).round().max(1.0) as u32;
    let resized = image::imageops::resize(&rgba, nw, nh, image::imageops::FilterType::Lanczos3);
    let x0 = nw.saturating_sub(edge) / 2;
    let y0 = nh.saturating_sub(edge) / 2;
    let cropped = image::imageops::crop_imm(&resized, x0, y0, edge, edge).to_image();

    let mut png = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png);
        let enc = image::codecs::png::PngEncoder::new(&mut cursor);
        use image::ImageEncoder;
        enc.write_image(
            cropped.as_raw(),
            edge,
            edge,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
    }
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
}
