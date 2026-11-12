use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// Resultado do login aguardado pelo app: a sessão recebida ou o motivo da falha.
struct SignIn(Mutex<Option<Receiver<Result<String, String>>>>);

/// Lê o caminho da requisição (`/cb?session=...`) e devolve a sessão ou o erro informado.
fn parse_callback(target: &str) -> Option<Result<String, String>> {
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != "/cb" {
        return None;
    }
    let mut session = None;
    let mut error = None;
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            match key {
                "session" if !value.is_empty() => session = Some(value.to_string()),
                "error" => error = Some(value.to_string()),
                _ => {}
            }
        }
    }
    Some(match session {
        Some(value) => Ok(value),
        None => Err(error.unwrap_or_else(|| "falhou".to_string())),
    })
}

/// Abre um servidor só no próprio computador, numa porta livre, e devolve a porta.
/// Espera uma única requisição `/cb` por até 5 minutos.
#[tauri::command]
fn begin_sign_in(state: tauri::State<'_, SignIn>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let (sender, receiver) = channel();
    thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(300);
        let outcome = loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buffer = [0u8; 4096];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                    let target = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("/")
                        .to_string();
                    match parse_callback(&target) {
                        Some(result) => {
                            let body = "<!doctype html><html><meta charset=utf-8><body style='font-family:sans-serif'><h3>Pronto. Pode voltar ao Grupo Jadson.</h3></body></html>";
                            let _ = write!(
                                stream,
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                                body.len(),
                                body
                            );
                            break result;
                        }
                        None => {
                            let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() > deadline {
                        break Err("tempo esgotado".to_string());
                    }
                    thread::sleep(Duration::from_millis(200));
                }
                Err(error) => break Err(error.to_string()),
            }
        };
        let _ = sender.send(outcome);
    });
    *state.0.lock().map_err(|_| "estado indisponível".to_string())? = Some(receiver);
    Ok(port)
}

/// Espera a sessão do login iniciado por `begin_sign_in`.
#[tauri::command]
async fn await_sign_in(state: tauri::State<'_, SignIn>) -> Result<String, String> {
    let receiver = state
        .0
        .lock()
        .map_err(|_| "estado indisponível".to_string())?
        .take()
        .ok_or_else(|| "nenhum login em andamento".to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(320)))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|_| "tempo esgotado".to_string())?
}

/// Abre um endereço http(s) no navegador padrão do Windows, sem passar por um shell.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("endereço não permitido".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SignIn(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![begin_sign_in, await_sign_in, open_external])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo Grupo Jadson");
}
