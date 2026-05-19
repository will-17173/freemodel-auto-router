use std::env;
use std::path::{Path, PathBuf};
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
    pub cc: AppInstallInfo,
    pub codex: AppInstallInfo,
    pub hermes: AppInstallInfo,
    pub openclaw: AppInstallInfo,
}

fn home_config_dir(name: &str) -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(name)
}

fn command_version(command_path: &Path) -> Option<String> {
    let output = Command::new(command_path).arg("--version").output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        None
    } else {
        Some(stderr)
    }
}

fn path_entries() -> Vec<PathBuf> {
    let mut entries: Vec<PathBuf> = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect())
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        entries.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
            PathBuf::from("/usr/sbin"),
            PathBuf::from("/sbin"),
        ]);

        if let Some(home) = dirs::home_dir() {
            entries.extend([
                home.join(".local/bin"),
                home.join(".npm-global/bin"),
                home.join(".bun/bin"),
                home.join(".cargo/bin"),
            ]);
        }
    }

    entries
}

fn command_in_paths(command: &str, paths: &[PathBuf]) -> Option<PathBuf> {
    let command_path = Path::new(command);
    if command_path.components().count() > 1 && is_executable_file(command_path) {
        return Some(command_path.to_path_buf());
    }

    paths
        .iter()
        .map(|entry| entry.join(command))
        .find(|candidate| is_executable_file(candidate))
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }

    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
fn command_from_login_shell(command: &str) -> Option<PathBuf> {
    let shell = env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("/bin/zsh"));

    let output = Command::new(shell)
        .args(["-lc", &format!("command -v {}", shell_escape(command))])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = PathBuf::from(stdout.lines().next()?.trim());
    if is_executable_file(&path) {
        Some(path)
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn command_from_login_shell(_command: &str) -> Option<PathBuf> {
    None
}

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn resolve_command(command: &str) -> Option<PathBuf> {
    command_in_paths(command, &path_entries()).or_else(|| command_from_login_shell(command))
}

fn detect_cli_app(command: &str, config_dir: &str) -> AppInstallInfo {
    let command_path = resolve_command(command);
    let version = command_path.as_deref().and_then(command_version);
    let command_found = command_path.is_some();
    let config_found = home_config_dir(config_dir).exists();

    AppInstallInfo {
        installed: command_found, // 只依赖命令是否存在
        command_found,
        config_found,
        version,
    }
}

pub fn detect_installations() -> AppInstallations {
    AppInstallations {
        cc: detect_cli_app("claude", ".claude"),
        codex: detect_cli_app("codex", ".codex"),
        hermes: detect_cli_app("hermes", ".hermes"),
        openclaw: detect_cli_app("openclaw", ".openclaw"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        env::temp_dir().join(format!("freemodel-app-detection-{name}-{millis}"))
    }

    #[test]
    fn command_in_paths_finds_cli_outside_process_path() {
        let bin_dir = temp_dir("bin");
        fs::create_dir_all(&bin_dir).unwrap();
        let cli = bin_dir.join("claude");
        fs::write(&cli, "#!/bin/sh\n").unwrap();
        make_executable(&cli);

        let found = command_in_paths("claude", &[bin_dir.clone()]);

        assert_eq!(found, Some(cli));
        fs::remove_dir_all(bin_dir).unwrap();
    }

    #[test]
    fn shell_escape_quotes_single_quotes() {
        assert_eq!(shell_escape("abc'def"), "'abc'\\''def'");
    }

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }

    #[cfg(not(unix))]
    fn make_executable(_path: &Path) {}
}
