use crate::config::{AppConfig, Provider, RetryConfig};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct RouterState {
    pub active_idx: usize,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub fail_counts: Vec<u32>,
}

impl RouterState {
    pub fn from_config(cfg: &AppConfig) -> Self {
        let mut providers = cfg.providers.clone();
        providers.sort_by_key(|p| p.priority);
        let n = providers.len();
        Self {
            active_idx: 0,
            providers,
            retry: cfg.retry.clone(),
            fail_counts: vec![0; n],
        }
    }

    pub fn active_provider(&self) -> Option<&Provider> {
        self.providers
            .iter()
            .skip(self.active_idx)
            .find(|p| p.enabled)
    }

    /// 记录一次失败，返回是否应该切换到下一供应商
    pub fn record_failure(&mut self) -> bool {
        if let Some(idx) = self.enabled_idx_from(self.active_idx) {
            self.fail_counts[idx] += 1;
            if self.fail_counts[idx] > self.retry.max_retries {
                self.fail_counts[idx] = 0;
                // 找下一个 enabled 供应商
                if let Some(next) = self.enabled_idx_from(idx + 1) {
                    self.active_idx = next;
                    return true;
                }
            }
        }
        false
    }

    fn enabled_idx_from(&self, from: usize) -> Option<usize> {
        self.providers
            .iter()
            .enumerate()
            .skip(from)
            .find(|(_, p)| p.enabled)
            .map(|(i, _)| i)
    }
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}
