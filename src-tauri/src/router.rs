use crate::config::{AppConfig, Provider, QueueItem, RetryConfig};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct RouterState {
    pub active_idx: usize,
    pub queue: Vec<QueueItem>,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub fail_counts: Vec<u32>,
}

impl RouterState {
    pub fn from_config(cfg: &AppConfig) -> Self {
        let n = cfg.queue.len();
        Self {
            active_idx: 0,
            queue: cfg.queue.clone(),
            providers: cfg.providers.clone(),
            retry: cfg.retry.clone(),
            fail_counts: vec![0; n],
        }
    }

    /// 返回当前队列项对应的 (provider, model_id)
    pub fn active_entry(&self) -> Option<(&Provider, &str)> {
        let item = self.queue.get(self.active_idx)?;
        let provider = self.providers.iter().find(|p| p.id == item.provider_id)?;
        Some((provider, &item.model_id))
    }

    /// 记录一次失败，返回是否切换到了下一个队列项
    pub fn record_failure(&mut self) -> bool {
        if self.queue.is_empty() {
            return false;
        }
        let idx = self.active_idx;
        if idx < self.fail_counts.len() {
            self.fail_counts[idx] += 1;
            if self.fail_counts[idx] > self.retry.max_retries {
                self.fail_counts[idx] = 0;
                let next = idx + 1;
                if next < self.queue.len() {
                    self.active_idx = next;
                    return true;
                }
            }
        }
        false
    }
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}
