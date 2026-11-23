//! Google sign-in (OAuth for desktop apps, loopback redirect + PKCE) and YouTube resumable uploads.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, ErrorKind, Read, Seek, SeekFrom, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, ipc::Channel};
use tauri_plugin_opener::OpenerExt;
use ureq::http::Response;

const SCOPE: &str = "https://www.googleapis.com/auth/youtube.upload";
const UPLOAD_URL: &str =
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
/// Resumable chunks must be a multiple of 256 KiB.
const CHUNK: usize = 8 * 1024 * 1024;
const MAX_RETRIES: u64 = 3;

/// Access token kept in memory only; the refresh token lives in `token.json`.
#[derive(Default)]
pub struct Session(Mutex<Option<(String, Instant)>>);

#[derive(Deserialize)]
struct ClientFile {
    installed: Client,
}

#[derive(Deserialize)]
struct Client {
    client_id: String,
    client_secret: String,
    auth_uri: String,
    token_uri: String,
}

#[derive(Serialize)]
pub struct Status {
    has_client: bool,
    connected: bool,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("token.json"))
}

fn read_client(app: &AppHandle) -> Result<Client, String> {
    let text = fs::read_to_string(data_dir(app)?.join("client_secret.json"))
        .map_err(|_| "Add your client_secret.json first.".to_string())?;
    parse_client(&text)
}

fn parse_client(text: &str) -> Result<Client, String> {
    serde_json::from_str::<ClientFile>(text)
        .map(|f| f.installed)
        .map_err(|_| "This is not a Desktop app OAuth client file from Google Cloud.".into())
}

/// Secrets are readable by the current user only.
fn write_private(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        // YouTube answers unfinished chunks with 308, which is not a redirect here.
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(300)))
        .build()
        .into()
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Turns a failed Google response into a readable message. Quota errors start with "QUOTA:".
fn api_error(mut res: Response<ureq::Body>) -> String {
    let status = res.status();
    let body = res.body_mut().read_to_string().unwrap_or_default();
    if body.contains("quotaExceeded") || body.contains("uploadLimitExceeded") {
        return "QUOTA: YouTube's daily upload limit is reached. Open this folder again tomorrow to continue.".into();
    }
    let v: Value = serde_json::from_str(&body).unwrap_or_default();
    let msg = v["error"]["message"]
        .as_str()
        .or(v["error_description"].as_str())
        .map(String::from)
        .unwrap_or_else(|| body.chars().take(300).collect());
    format!("{status}: {msg}")
}

fn read_ok(mut res: Response<ureq::Body>) -> Result<Value, String> {
    if !res.status().is_success() {
        return Err(api_error(res));
    }
    res.body_mut().read_json().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn youtube_status(app: AppHandle) -> Status {
    Status {
        has_client: read_client(&app).is_ok(),
        connected: token_path(&app).is_ok_and(|p| p.exists()),
    }
}

#[tauri::command]
pub fn set_client_secret(app: AppHandle, path: String) -> Result<(), String> {
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    parse_client(&text)?;
    write_private(&data_dir(&app)?.join("client_secret.json"), &text)
}

#[tauri::command]
pub fn disconnect(app: AppHandle) -> Result<(), String> {
    *app.state::<Session>().0.lock().unwrap() = None;
    match fs::remove_file(token_path(&app)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn connect(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || authorize(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn authorize(app: &AppHandle) -> Result<(), String> {
    let client = read_client(app)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let verifier = random_token()?;
    let state = random_token()?;

    let mut url = url::Url::parse(&client.auth_uri).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", &client.client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", &URL_SAFE_NO_PAD.encode(Sha256::digest(&verifier)))
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| e.to_string())?;

    let code = wait_for_code(&listener, &state)?;
    let res = agent()
        .post(&client.token_uri)
        .send_form([
            ("code", code.as_str()),
            ("client_id", &client.client_id),
            ("client_secret", &client.client_secret),
            ("redirect_uri", &redirect),
            ("grant_type", "authorization_code"),
            ("code_verifier", &verifier),
        ])
        .map_err(|e| e.to_string())?;
    let body = read_ok(res)?;
    let refresh = body["refresh_token"]
        .as_str()
        .ok_or("Google did not return a refresh token. Try connecting again.")?;
    write_private(&token_path(app)?, &json!({ "refresh_token": refresh }).to_string())?;
    cache_access(app, &body);
    Ok(())
}

/// Waits (up to 5 minutes) for the browser to come back to the loopback address with `?code=`.
fn wait_for_code(listener: &TcpListener, state: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        let mut stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Google sign-in timed out. Try again.".into());
                }
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        stream.set_nonblocking(false).map_err(|e| e.to_string())?;
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line).map_err(|e| e.to_string())?;
        let path = line.split_whitespace().nth(1).unwrap_or("/");
        let url = url::Url::parse(&format!("http://localhost{path}")).map_err(|e| e.to_string())?;
        let get = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());

        let (result, page) = match (get("code"), get("error")) {
            (Some(code), _) if get("state").as_deref() == Some(state) => {
                (Some(Ok(code)), "Clumyoup is connected to YouTube. You can close this tab.")
            }
            (_, Some(err)) => (Some(Err(format!("Google sign-in was cancelled ({err})."))), "Sign-in was cancelled. You can close this tab."),
            // favicon and other stray requests
            _ => (None, ""),
        };
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
             <!doctype html><body style=\"font:16px system-ui;padding:3rem\">{page}</body>"
        );
        if let Some(r) = result {
            return r;
        }
    }
}

fn cache_access(app: &AppHandle, body: &Value) {
    if let Some(token) = body["access_token"].as_str() {
        let ttl = body["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60);
        *app.state::<Session>().0.lock().unwrap() =
            Some((token.to_string(), Instant::now() + Duration::from_secs(ttl)));
    }
}

fn access_token(app: &AppHandle) -> Result<String, String> {
    if let Some((token, until)) = app.state::<Session>().0.lock().unwrap().clone() {
        if Instant::now() < until {
            return Ok(token);
        }
    }
    let client = read_client(app)?;
    let saved: Value = fs::read_to_string(token_path(app)?)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .ok_or("Connect YouTube first.")?;
    let refresh = saved["refresh_token"].as_str().ok_or("Connect YouTube first.")?;
    let res = agent()
        .post(&client.token_uri)
        .send_form([
            ("client_id", client.client_id.as_str()),
            ("client_secret", &client.client_secret),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
        ])
        .map_err(|e| e.to_string())?;
    if res.status() == 400 || res.status() == 401 {
        // Revoked or expired (apps in "Testing" mode get tokens that expire after 7 days).
        let _ = fs::remove_file(token_path(app)?);
        return Err("Your YouTube sign-in expired. Connect YouTube again.".into());
    }
    let body = read_ok(res)?;
    cache_access(app, &body);
    body["access_token"].as_str().map(String::from).ok_or("No access token from Google.".into())
}

#[tauri::command]
pub async fn upload_video(
    app: AppHandle,
    path: String,
    title: String,
    description: String,
    publish_at: String,
    on_progress: Channel<f64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        upload(&app, &path, &title, &description, &publish_at, &on_progress)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn upload(
    app: &AppHandle,
    path: &str,
    title: &str,
    description: &str,
    publish_at: &str,
    on_progress: &Channel<f64>,
) -> Result<String, String> {
    let token = access_token(app)?;
    let auth = format!("Bearer {token}");
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let total = file.metadata().map_err(|e| e.to_string())?.len();
    if total == 0 {
        return Err("The video file is empty.".into());
    }

    let meta = json!({
        "snippet": { "title": title, "description": description },
        "status": {
            "privacyStatus": "private",
            "publishAt": publish_at,
            "selfDeclaredMadeForKids": false,
        },
    });
    let res = agent()
        .post(UPLOAD_URL)
        .header("Authorization", &auth)
        .header("X-Upload-Content-Length", total.to_string())
        .header("X-Upload-Content-Type", "video/*")
        .send_json(&meta)
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(api_error(res));
    }
    let session_url = res
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or("YouTube did not return an upload address.")?
        .to_string();

    let put = |range: String, data: &[u8]| {
        agent()
            .put(&session_url)
            .header("Authorization", &auth)
            .header("Content-Range", range)
            .send(data)
    };
    let mut buf = vec![0u8; CHUNK];
    let mut sent = 0u64;
    let mut retries = 0;
    loop {
        file.seek(SeekFrom::Start(sent)).map_err(|e| e.to_string())?;
        let n = read_full(&mut file, &mut buf).map_err(|e| e.to_string())?;
        let res = match put(format!("bytes {sent}-{}/{total}", sent + n as u64 - 1), &buf[..n]) {
            Ok(r) if r.status().as_u16() < 500 => r,
            failed => {
                retries += 1;
                if retries > MAX_RETRIES {
                    return Err(match failed {
                        Ok(r) => api_error(r),
                        Err(e) => format!("Connection lost during upload: {e}"),
                    });
                }
                std::thread::sleep(Duration::from_secs(2 * retries));
                // Ask how much YouTube already has, then continue from there.
                match put(format!("bytes */{total}"), &[]) {
                    Ok(r) => r,
                    Err(_) => continue,
                }
            }
        };
        match res.status().as_u16() {
            200 | 201 => {
                let body = read_ok(res)?;
                on_progress.send(1.0).ok();
                return body["id"].as_str().map(String::from).ok_or("YouTube did not return a video ID.".into());
            }
            308 => {
                retries = 0;
                // "Range: bytes=0-1234" is what YouTube has stored; no header means nothing yet.
                sent = res
                    .headers()
                    .get("range")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|r| r.rsplit('-').next()?.parse::<u64>().ok())
                    .map_or(0, |last| last + 1);
                on_progress.send(sent as f64 / total as f64).ok();
            }
            _ => return Err(api_error(res)),
        }
    }
}

fn read_full(file: &mut File, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match file.read(&mut buf[n..])? {
            0 => break,
            k => n += k,
        }
    }
    Ok(n)
}
