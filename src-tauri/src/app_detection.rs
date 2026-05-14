use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppInstallInfo {
    pub installed: bool,
    pub command_found: bool,
    pub config_found: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppInstallations {
    pub codex: AppInstallInfo,
}

fn home_config_dir(name: &str) -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(name)
}

fn command_version(command: &str) -> Option<String> {
    Command::new(command)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                None
            } else {
                Some(stdout)
            }
        })
}

fn command_exists(command: &str) -> bool {
    let checker = if cfg!(windows) { "where" } else { "which" };
    Command::new(checker)
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn detect_cli_app(command: &str, config_dir: &str) -> AppInstallInfo {
    let version = command_version(command);
    let command_found = command_exists(command) || version.is_some();
    let config_found = home_config_dir(config_dir).exists();

    AppInstallInfo {
        installed: command_found || config_found,
        command_found,
        config_found,
        version,
    }
}

pub fn detect_installations() -> AppInstallations {
    AppInstallations {
        codex: detect_cli_app("codex", ".codex"),
    }
}
