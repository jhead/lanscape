use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use axum::{
    extract::Query,
    http::StatusCode,
    response::Html,
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tokio::sync::Mutex;
use lanscape_agent::{Agent, Config};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OIDCCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

// Start OIDC callback server and wait for callback on localhost
#[tauri::command]
async fn start_oidc_callback_server(
    redirect_uri: String,
) -> Result<OIDCCallback, String> {
    // Parse the redirect URI to get the port and path
    let redirect_url = url::Url::parse(&redirect_uri)
        .map_err(|e| format!("Invalid redirect URI: {}", e))?;
    
    let port = redirect_url.port()
        .ok_or_else(|| "Redirect URI must include a port number".to_string())?;
    
    // Create a channel to receive the callback
    let (tx, mut rx) = tokio::sync::mpsc::channel::<OIDCCallback>(1);

    // Start a local HTTP server to listen for the callback
    let callback_path = redirect_url.path().to_string();
    let server_tx = tx.clone();
    
    let app = Router::new()
        .route(&callback_path, get(move |query: Query<std::collections::HashMap<String, String>>| async move {
            let params = query.0;
            
            let callback = OIDCCallback {
                code: params.get("code").cloned(),
                state: params.get("state").cloned(),
                error: params.get("error").cloned(),
                error_description: params.get("error_description").cloned(),
            };
            
            // Send the callback
            if let Err(e) = server_tx.send(callback.clone()).await {
                eprintln!("[OIDC] Failed to send callback: {:?}", e);
            }
            
            // Return a simple HTML page
            let html = if callback.error.is_some() {
                r#"
                <!DOCTYPE html>
                <html>
                <head><title>Authentication Error</title></head>
                <body>
                    <h1>Authentication Error</h1>
                    <p>Please close this window and try again.</p>
                </body>
                </html>
                "#
            } else {
                r#"
                <!DOCTYPE html>
                <html>
                <head><title>Authentication Successful</title></head>
                <body>
                    <h1>Authentication Successful</h1>
                    <p>You can close this window now.</p>
                </body>
                </html>
                "#
            };
            
            (StatusCode::OK, Html(html))
        }));

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    
    // Create a shutdown signal using Arc<Notify> (which can be cloned)
    let shutdown_notify = Arc::new(tokio::sync::Notify::new());
    let shutdown_notify_clone = shutdown_notify.clone();
    
    // Start the server in a background task
    let server_handle = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(&addr).await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
        
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                shutdown_notify_clone.notified().await;
            })
            .await
            .map_err(|e| format!("Server error: {}", e))?;
        
        Ok::<(), String>(())
    });
    
    // Spawn a task to shutdown after timeout
    let shutdown_notify_timeout = shutdown_notify.clone();
    tokio::spawn(async move {
        sleep(Duration::from_secs(300)).await;
        shutdown_notify_timeout.notify_one();
    });

    // Wait for the callback (with timeout)
    let result = tokio::time::timeout(Duration::from_secs(300), rx.recv()).await;
    
    // Shutdown the server
    shutdown_notify.notify_one();
    
    // Wait for server to shutdown (with timeout)
    let _ = tokio::time::timeout(Duration::from_secs(2), server_handle).await;

    match result {
        Ok(Some(callback)) => Ok(callback),
        Ok(None) => Err("OIDC callback channel closed".to_string()),
        Err(_) => Err("OIDC authentication timeout".to_string()),
    }
}

// Global agent state
use std::sync::OnceLock;
static AGENT: OnceLock<Arc<Mutex<Option<Arc<Mutex<Agent>>>>>> = OnceLock::new();

/// Start the lanscape agent
#[tauri::command]
async fn start_agent(
    websocket_addr: String,
    signaling_url: String,
    topic: String,
) -> Result<(), String> {
    let config = Config::new(websocket_addr, signaling_url, topic);
    let agent = Agent::new(config)
        .map_err(|e| format!("Failed to create agent: {}", e))?;
    
    let agent_arc = Arc::new(Mutex::new(agent));
    
    // Start the agent in a background task
    let agent_clone = agent_arc.clone();
    tokio::spawn(async move {
        if let Err(e) = agent_clone.lock().await.start().await {
            tracing::error!("Failed to start agent: {}", e);
        } else {
            tracing::info!("Agent started successfully");
        }
    });
    
    let agent_state = AGENT.get_or_init(|| Arc::new(Mutex::new(None)));
    *agent_state.lock().await = Some(agent_arc);
    Ok(())
}

/// Stop the lanscape agent
#[tauri::command]
async fn stop_agent() -> Result<(), String> {
    if let Some(agent_state) = AGENT.get() {
        let mut agent_guard = agent_state.lock().await;
        if let Some(agent) = agent_guard.take() {
            agent.lock().await.stop().await
                .map_err(|e| format!("Failed to stop agent: {}", e))?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_oidc_callback_server,
            start_agent,
            stop_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
