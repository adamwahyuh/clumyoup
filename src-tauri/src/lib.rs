use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const STATE_FILE: &str = ".clumyoup.json";
const VIDEO_EXTS: [&str; 7] = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv"];

#[derive(Serialize)]
struct Video {
    name: String,
    path: String,
    /// File creation time (falls back to modified time) in ms, used for the default order.
    created: u64,
}

/// Folder passed on the command line (`clumyoup .`), resolved to an absolute path.
#[tauri::command]
fn start_dir() -> Option<String> {
    let arg = std::env::args().nth(1)?;
    let dir = fs::canonicalize(arg).ok()?;
    dir.is_dir().then(|| dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn scan_folder(app: AppHandle, dir: String) -> Result<Vec<Video>, String> {
    let dir = PathBuf::from(dir);
    // Only the opened folder is readable by the <video> previews.
    app.asset_protocol_scope()
        .allow_directory(&dir, false)
        .map_err(|e| e.to_string())?;

    let mut videos = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let is_video = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| VIDEO_EXTS.contains(&e.to_lowercase().as_str()));
        if !is_video || !path.is_file() {
            continue;
        }
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let created = meta
            .created()
            .or_else(|_| meta.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        videos.push(Video {
            name: path.file_name().unwrap().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            created,
        });
    }
    Ok(videos)
}

#[tauri::command]
fn load_state(dir: String) -> Option<String> {
    fs::read_to_string(Path::new(&dir).join(STATE_FILE)).ok()
}

#[tauri::command]
fn save_state(dir: String, json: String) -> Result<(), String> {
    // Write to a temp file then rename, so a crash mid-write never leaves a half-written state file.
    let target = Path::new(&dir).join(STATE_FILE);
    let tmp = Path::new(&dir).join(format!("{STATE_FILE}.tmp"));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![start_dir, scan_folder, load_state, save_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
