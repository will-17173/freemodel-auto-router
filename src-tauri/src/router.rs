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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureAction {
    RetryCurrent,
    SwitchProvider,
    Exhausted,
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

    pub fn replace_config(&mut self, cfg: &AppConfig) {
        *self = Self::from_config(cfg);
    }

    /// 返回当前队列项对应的 (provider, model_id)
    pub fn active_entry(&self) -> Option<(&Provider, &str)> {
        let item = self.queue.get(self.active_idx)?;
        let provider = self.providers.iter().find(|p| p.id == item.provider_id)?;
        Some((provider, &item.model_id))
    }

    /// 记录一次失败，返回路由器接下来应该重试、切换，还是结束重试。
    pub fn record_failure(&mut self) -> FailureAction {
        if self.queue.is_empty() {
            return FailureAction::Exhausted;
        }
        let idx = self.active_idx;
        if idx < self.fail_counts.len() {
            self.fail_counts[idx] += 1;
            if self.fail_counts[idx] > self.retry.max_retries {
                self.fail_counts[idx] = 0;
                let next = idx + 1;
                if next < self.queue.len() {
                    self.active_idx = next;
                    return FailureAction::SwitchProvider;
                }
                return FailureAction::Exhausted;
            }
        }
        FailureAction::RetryCurrent
    }
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Model, Protocol};

    fn provider(id: &str, model_id: &str) -> Provider {
        Provider {
            id: id.to_owned(),
            name: id.to_owned(),
            base_url: "https://example.com/api".to_owned(),
            protocol: Protocol::Anthropic,
            auth_scheme: None,
            api_key: "token".to_owned(),
            models: vec![Model {
                id: model_id.to_owned(),
                name: model_id.to_owned(),
                enabled: true,
            }],
            enabled: true,
            priority: 100,
        }
    }

    #[test]
    fn replace_config_resets_runtime_queue_and_fail_counts() {
        let first = AppConfig {
            providers: vec![provider("first", "model-a")],
            retry: RetryConfig {
                max_retries: 1,
                retry_delay_secs: 1,
            },
            queue: vec![QueueItem {
                provider_id: "first".to_owned(),
                model_id: "model-a".to_owned(),
            }],
        };
        let second = AppConfig {
            providers: vec![provider("second", "model-b"), provider("third", "model-c")],
            retry: RetryConfig {
                max_retries: 3,
                retry_delay_secs: 2,
            },
            queue: vec![
                QueueItem {
                    provider_id: "second".to_owned(),
                    model_id: "model-b".to_owned(),
                },
                QueueItem {
                    provider_id: "third".to_owned(),
                    model_id: "model-c".to_owned(),
                },
            ],
        };

        let mut router = RouterState::from_config(&first);
        router.fail_counts[0] = 1;
        router.replace_config(&second);

        let (active_provider, active_model) = router.active_entry().unwrap();
        assert_eq!(active_provider.id, "second");
        assert_eq!(active_model, "model-b");
        assert_eq!(router.retry.max_retries, 3);
        assert_eq!(router.fail_counts, vec![0, 0]);
    }

    #[test]
    fn record_failure_exhausts_when_no_next_provider_exists() {
        let cfg = AppConfig {
            providers: vec![provider("first", "model-a")],
            retry: RetryConfig {
                max_retries: 1,
                retry_delay_secs: 1,
            },
            queue: vec![QueueItem {
                provider_id: "first".to_owned(),
                model_id: "model-a".to_owned(),
            }],
        };
        let mut router = RouterState::from_config(&cfg);

        assert_eq!(router.record_failure(), FailureAction::RetryCurrent);
        assert_eq!(router.record_failure(), FailureAction::Exhausted);
        assert_eq!(router.active_idx, 0);
    }
}
