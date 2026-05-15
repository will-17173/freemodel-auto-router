use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::config::config_dir;

// 32 字节硬编码密钥。注意：反编译二进制可还原，仅作"防止其他进程随手读"
// 与"防备份/同步明文泄漏"的混淆层使用。
const ENC_KEY: [u8; 32] = [
    0x7a, 0x29, 0xf4, 0xb1, 0x6c, 0x05, 0x8e, 0xd3, 0x12, 0x9a, 0x47, 0x83, 0x6b, 0xe0, 0x55, 0x21,
    0xc8, 0x3d, 0x76, 0x4f, 0xa2, 0x18, 0x9c, 0x60, 0x37, 0xeb, 0x44, 0x90, 0xb5, 0x71, 0x2c, 0x88,
];

const VERSION: u8 = 1;

#[derive(Serialize, Deserialize)]
struct Encrypted {
    v: u8,
    data: String,
}

fn auth_path() -> PathBuf {
    config_dir().join("auth.json")
}

fn encrypt_bytes(plain: &[u8]) -> Result<String> {
    let cipher = Aes256Gcm::new(&ENC_KEY.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plain)
        .map_err(|e| anyhow!("encrypt failed: {e}"))?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

fn decrypt_b64(b64: &str) -> Result<Vec<u8>> {
    let buf = B64.decode(b64).map_err(|e| anyhow!("base64 decode: {e}"))?;
    if buf.len() < 12 {
        return Err(anyhow!("ciphertext too short"));
    }
    let (nonce_bytes, ct) = buf.split_at(12);
    let cipher = Aes256Gcm::new(&ENC_KEY.into());
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ct)
        .map_err(|e| anyhow!("decrypt failed: {e}"))
}

pub fn load_auth() -> HashMap<String, String> {
    let path = auth_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return HashMap::new();
    };

    // v1 加密格式
    if let Ok(enc) = serde_json::from_str::<Encrypted>(&raw) {
        if enc.v == VERSION {
            return decrypt_b64(&enc.data)
                .ok()
                .and_then(|p| serde_json::from_slice::<HashMap<String, String>>(&p).ok())
                .unwrap_or_default();
        }
    }

    // 兼容旧明文格式：解析后立即加密回写完成迁移
    if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&raw) {
        if let Err(e) = save_auth(&map) {
            log::warn!("[auth] migrate plaintext -> encrypted failed: {e}");
        } else {
            log::info!("[auth] migrated plaintext auth.json to encrypted format");
        }
        return map;
    }

    HashMap::new()
}

pub fn save_auth(auth: &HashMap<String, String>) -> Result<()> {
    let path = auth_path();
    if auth.is_empty() {
        if path.exists() {
            fs::remove_file(&path)?;
        }
        return Ok(());
    }
    let plain = serde_json::to_vec(auth)?;
    let data = encrypt_bytes(&plain)?;
    let wrapped = Encrypted { v: VERSION, data };
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&wrapped)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn get_api_key(provider_id: &str) -> Option<String> {
    load_auth().get(provider_id).cloned()
}

pub fn save_api_key(provider_id: &str, api_key: &str) -> Result<()> {
    let mut auth = load_auth();
    auth.insert(provider_id.to_string(), api_key.to_string());
    save_auth(&auth)
}

pub fn delete_api_key(provider_id: &str) -> Result<()> {
    let mut auth = load_auth();
    auth.remove(provider_id);
    save_auth(&auth)
}

/// 返回所有 provider_id 及是否有 key（不返回实际值）
pub fn has_auth_map() -> HashMap<String, bool> {
    load_auth()
        .into_iter()
        .map(|(k, v)| (k, v.trim().len() > 0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_home(name: &str) -> String {
        let home = format!("/tmp/freemodel_test_{name}");
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(format!("{home}/.config/freemodel")).unwrap();
        std::env::set_var("HOME", &home);
        home
    }

    #[test]
    fn migrates_plaintext_to_encrypted() {
        let home = fresh_home("migrate");
        let path = format!("{home}/.config/freemodel/auth.json");

        let mut original = HashMap::new();
        original.insert("openrouter".into(), "sk-or-test-12345".into());
        original.insert("longcat".into(), "lc-key-abcdef".into());
        fs::write(&path, serde_json::to_string_pretty(&original).unwrap()).unwrap();

        let loaded = load_auth();
        assert_eq!(loaded, original);

        let on_disk = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(parsed["v"], 1);
        assert!(parsed["data"].is_string());
        assert!(!on_disk.contains("sk-or-test-12345"));
        assert!(!on_disk.contains("lc-key-abcdef"));
    }

    #[test]
    fn round_trip_encrypted() {
        fresh_home("roundtrip");

        let mut m = HashMap::new();
        m.insert("a".into(), "key-a".into());
        m.insert("b".into(), "key-b".into());

        save_auth(&m).unwrap();
        let back = load_auth();
        assert_eq!(back, m);
    }

    #[test]
    fn tampered_ciphertext_returns_empty() {
        let home = fresh_home("tamper");
        let path = format!("{home}/.config/freemodel/auth.json");

        let mut m = HashMap::new();
        m.insert("p".into(), "key".into());
        save_auth(&m).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let bad = raw.replace("\"data\": \"", "\"data\": \"X");
        fs::write(&path, bad).unwrap();

        assert!(load_auth().is_empty());
    }

    #[test]
    fn empty_map_removes_file() {
        let home = fresh_home("empty");
        let path = format!("{home}/.config/freemodel/auth.json");

        let mut m = HashMap::new();
        m.insert("x".into(), "y".into());
        save_auth(&m).unwrap();
        assert!(std::path::Path::new(&path).exists());

        save_auth(&HashMap::new()).unwrap();
        assert!(!std::path::Path::new(&path).exists());
    }

    #[test]
    fn nonce_is_random_each_save() {
        fresh_home("nonce");
        let mut m = HashMap::new();
        m.insert("k".into(), "v".into());

        save_auth(&m).unwrap();
        let raw1 = fs::read_to_string(auth_path()).unwrap();

        save_auth(&m).unwrap();
        let raw2 = fs::read_to_string(auth_path()).unwrap();

        assert_ne!(raw1, raw2, "同样明文两次保存应产生不同密文（nonce 随机）");
    }
}
