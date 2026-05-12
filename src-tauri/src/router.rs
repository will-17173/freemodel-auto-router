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
    pub exhausted_indices: Vec<usize>,
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
            exhausted_indices: vec![],
        }
    }

    pub fn replace_config(&mut self, cfg: &AppConfig) {
        *self = Self::from_config(cfg);
    }

    /// 检查某个索引是否已用尽
    pub fn is_exhausted(&self, idx: usize) -> bool {
        self.exhausted_indices.contains(&idx)
    }

    /// 找到下一个未用尽的队列索引
    fn find_next_available(&self, start_from: usize) -> Option<usize> {
        for i in start_from..self.queue.len() {
            if !self.is_exhausted(i) {
                return Some(i);
            }
        }
        None
    }

    /// 返回当前队列项对应的 (provider, model_id)
    pub fn active_entry(&self) -> Option<(&Provider, &str)> {
        let item = self.queue.get(self.active_idx)?;
        let provider = self.providers.iter().find(|p| p.id == item.provider_id)?;
        Some((provider, &item.model_id))
    }

    /// 记录一次失败，返回路由器接下来应该重试、切换，还是结束重试。
    /// 当达到 max_retries 时，将当前索引标记为已用尽，并切换到下一个可用索引。
    pub fn record_failure(&mut self) -> FailureAction {
        if self.queue.is_empty() {
            return FailureAction::Exhausted;
        }
        let idx = self.active_idx;
        if idx < self.fail_counts.len() {
            self.fail_counts[idx] += 1;
            if self.fail_counts[idx] > self.retry.max_retries {
                self.fail_counts[idx] = 0;
                // 将当前索引标记为已用尽，而不是改变队列顺序
                if !self.exhausted_indices.contains(&idx) {
                    self.exhausted_indices.push(idx);
                }
                // 查找下一个可用的索引
                let next = self.find_next_available(idx + 1);
                if let Some(next_idx) = next {
                    self.active_idx = next_idx;
                    return FailureAction::SwitchProvider;
                }
                // 如果没有下一个可用，尝试从开头查找
                let from_start = self.find_next_available(0);
                if let Some(start_idx) = from_start {
                    if start_idx != idx {
                        self.active_idx = start_idx;
                        return FailureAction::SwitchProvider;
                    }
                }
                return FailureAction::Exhausted;
            }
        }
        FailureAction::RetryCurrent
    }

    /// 重置所有用尽状态（例如用户手动重新激活）
    pub fn reset_exhausted(&mut self) {
        self.exhausted_indices.clear();
        self.fail_counts = vec![0; self.queue.len()];
        // 找到第一个可用索引作为活跃
        self.active_idx = self.find_next_available(0).unwrap_or(0);
    }

    /// 获取已用尽的索引列表（用于前端显示）
    pub fn get_exhausted_indices(&self) -> Vec<usize> {
        self.exhausted_indices.clone()
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
            anthropic_url: "https://example.com/api".to_owned(),
            openai_url: "https://example.com/api".to_owned(),
            dual_protocol: false,
            base_url: String::new(),
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
            port: 7860,
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
            port: 7860,
        };

        let mut router = RouterState::from_config(&first);
        router.fail_counts[0] = 1;
        router.exhausted_indices.push(0);
        router.replace_config(&second);

        let (active_provider, active_model) = router.active_entry().unwrap();
        assert_eq!(active_provider.id, "second");
        assert_eq!(active_model, "model-b");
        assert_eq!(router.retry.max_retries, 3);
        assert_eq!(router.fail_counts, vec![0, 0]);
        assert_eq!(router.exhausted_indices, Vec::<usize>::new());
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
            port: 7860,
        };
        let mut router = RouterState::from_config(&cfg);

        assert_eq!(router.record_failure(), FailureAction::RetryCurrent);
        assert_eq!(router.record_failure(), FailureAction::Exhausted);
        assert_eq!(router.active_idx, 0);
        // 第一个索引被标记为已用尽
        assert!(router.is_exhausted(0));
    }

    #[test]
    fn record_failure_marks_exhausted_and_moves_to_next() {
        let cfg = AppConfig {
            providers: vec![provider("first", "model-a"), provider("second", "model-b")],
            retry: RetryConfig {
                max_retries: 1,
                retry_delay_secs: 1,
            },
            queue: vec![
                QueueItem {
                    provider_id: "first".to_owned(),
                    model_id: "model-a".to_owned(),
                },
                QueueItem {
                    provider_id: "second".to_owned(),
                    model_id: "model-b".to_owned(),
                },
            ],
            port: 7860,
        };
        let mut router = RouterState::from_config(&cfg);

        // 第一项失败达到 max_retries
        assert_eq!(router.record_failure(), FailureAction::RetryCurrent);
        let action = router.record_failure();
        assert_eq!(action, FailureAction::SwitchProvider);
        // 第一项被标记为已用尽，但队列顺序不变
        assert!(router.is_exhausted(0));
        assert!(!router.is_exhausted(1));
        // active_idx 移动到下一项
        assert_eq!(router.active_idx, 1);
        // 队列顺序不变
        assert_eq!(router.queue.len(), 2);
    }

    #[test]
    fn reset_exhausted_clears_all_states() {
        let cfg = AppConfig {
            providers: vec![provider("first", "model-a"), provider("second", "model-b")],
            retry: RetryConfig {
                max_retries: 1,
                retry_delay_secs: 1,
            },
            queue: vec![
                QueueItem {
                    provider_id: "first".to_owned(),
                    model_id: "model-a".to_owned(),
                },
                QueueItem {
                    provider_id: "second".to_owned(),
                    model_id: "model-b".to_owned(),
                },
            ],
            port: 7860,
        };
        let mut router = RouterState::from_config(&cfg);

        // 模拟第一项用尽
        router.record_failure();
        router.record_failure();
        assert!(router.is_exhausted(0));
        assert_eq!(router.active_idx, 1);

        // 重置
        router.reset_exhausted();
        assert_eq!(router.exhausted_indices, Vec::<usize>::new());
        assert_eq!(router.fail_counts, vec![0, 0]);
        assert_eq!(router.active_idx, 0);
    }
}
