use crate::config::{AppConfig, AppMapping, Provider, QueueItem, RetryConfig};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureAction {
    RetryCurrent,
    SwitchProvider,
    Exhausted,
}

#[derive(Debug, Clone)]
pub struct QueueState {
    pub active_idx: usize,
    pub items: Vec<QueueItem>,
    pub fail_counts: Vec<u32>,
    pub exhausted_indices: Vec<usize>,
}

impl QueueState {
    pub fn from_items(items: Vec<QueueItem>) -> Self {
        let n = items.len();
        Self {
            active_idx: 0,
            items,
            fail_counts: vec![0; n],
            exhausted_indices: vec![],
        }
    }

    pub fn is_exhausted(&self) -> bool {
        self.exhausted_indices.len() >= self.items.len()
    }

    pub fn get_active_entry(&self) -> Option<(usize, &QueueItem)> {
        if self.items.is_empty() || self.is_exhausted() {
            return None;
        }
        for i in self.active_idx..self.items.len() {
            if !self.exhausted_indices.contains(&i) {
                return Some((i, &self.items[i]));
            }
        }
        for i in 0..self.active_idx {
            if !self.exhausted_indices.contains(&i) {
                return Some((i, &self.items[i]));
            }
        }
        None
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueueStateInfo {
    pub active_idx: usize,
    pub exhausted_indices: Vec<usize>,
    pub items: Vec<QueueItem>,
}

#[derive(Debug, Clone)]
pub struct RouterState {
    pub queues: HashMap<String, QueueState>,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub auth_map: HashMap<String, String>,
    pub app_mapping: Vec<AppMapping>,
    pub default_queue_id: String,
}

impl RouterState {
    #[allow(dead_code)]
    pub fn from_config(cfg: &AppConfig) -> Self {
        let queues: HashMap<String, QueueState> = cfg
            .queues
            .iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        Self {
            queues,
            providers: vec![],
            retry: cfg.retry.clone(),
            auth_map: HashMap::new(),
            app_mapping: cfg.app_mapping.clone(),
            default_queue_id: cfg.default_queue_id.clone(),
        }
    }

    pub fn from_config_with_auth(cfg: &AppConfig, auth: HashMap<String, String>) -> Self {
        let queues: HashMap<String, QueueState> = cfg
            .queues
            .iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        Self {
            queues,
            providers: vec![],
            retry: cfg.retry.clone(),
            auth_map: auth,
            app_mapping: cfg.app_mapping.clone(),
            default_queue_id: cfg.default_queue_id.clone(),
        }
    }

    pub fn from_config_with_providers(
        cfg: &AppConfig,
        providers: Vec<Provider>,
        auth: HashMap<String, String>,
    ) -> Self {
        let queues: HashMap<String, QueueState> = cfg
            .queues
            .iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        Self {
            queues,
            providers,
            retry: cfg.retry.clone(),
            auth_map: auth,
            app_mapping: cfg.app_mapping.clone(),
            default_queue_id: cfg.default_queue_id.clone(),
        }
    }

    pub fn replace_config(&mut self, cfg: &AppConfig) {
        self.queues = cfg
            .queues
            .iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        // providers managed separately, not updated here
        self.retry = cfg.retry.clone();
        self.app_mapping = cfg.app_mapping.clone();
        self.default_queue_id = cfg.default_queue_id.clone();
        // auth_map stays unchanged
    }

    pub fn replace_config_and_providers(&mut self, cfg: &AppConfig, providers: Vec<Provider>) {
        self.queues = cfg
            .queues
            .iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        self.providers = providers;
        self.retry = cfg.retry.clone();
        self.app_mapping = cfg.app_mapping.clone();
        self.default_queue_id = cfg.default_queue_id.clone();
    }

    pub fn update_auth(&mut self, auth: HashMap<String, String>) {
        self.auth_map = auth;
    }

    pub fn get_api_key(&self, provider_id: &str) -> Option<&str> {
        self.auth_map.get(provider_id).map(|s| s.as_str())
    }

    /// Identify which queue to use based on request headers and path
    pub fn identify_queue(&self, headers: &axum::http::HeaderMap, path: &str) -> String {
        // 1. Check custom header: x-app-id
        if let Some(app_id_val) = headers.get("x-app-id") {
            if let Ok(app_id) = app_id_val.to_str() {
                if let Some(mapping) = self.app_mapping.iter().find(|m| m.app_id == app_id) {
                    return mapping.queue_id.clone();
                }
            }
        }

        // 2. Check match rules (User-Agent, headers, path)
        let ua = headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        for mapping in &self.app_mapping {
            for rule in &mapping.match_rules {
                if rule.matches(ua, headers, path) {
                    return mapping.queue_id.clone();
                }
            }
        }

        // 3. Fall back to default queue
        self.default_queue_id.clone()
    }

    /// Get the active (Provider, model_id) for a given queue
    pub fn active_entry_for_queue<'a>(
        &'a self,
        queue_id: &str,
    ) -> Option<(&'a Provider, &'a str)> {
        let queue_state = self.queues.get(queue_id)?;
        let (_, item) = queue_state.get_active_entry()?;
        let provider = self.providers.iter().find(|p| p.id == item.provider_id)?;
        Some((provider, &item.model_id))
    }

    /// Record a failure for the given queue, returns what action to take
    pub fn record_failure_for_queue(&mut self, queue_id: &str) -> FailureAction {
        let queue_state = match self.queues.get_mut(queue_id) {
            Some(qs) => qs,
            None => return FailureAction::Exhausted,
        };

        if queue_state.items.is_empty() {
            return FailureAction::Exhausted;
        }

        let active_idx = queue_state.active_idx;
        if active_idx < queue_state.fail_counts.len() {
            queue_state.fail_counts[active_idx] += 1;
            if queue_state.fail_counts[active_idx] > self.retry.max_retries {
                queue_state.fail_counts[active_idx] = 0;
                if !queue_state.exhausted_indices.contains(&active_idx) {
                    queue_state.exhausted_indices.push(active_idx);
                }

                let items_len = queue_state.items.len();
                let exhausted = queue_state.exhausted_indices.clone();

                if exhausted.len() >= items_len {
                    return FailureAction::Exhausted;
                }

                for i in (active_idx + 1)..items_len {
                    if !exhausted.contains(&i) {
                        queue_state.active_idx = i;
                        return FailureAction::SwitchProvider;
                    }
                }
                for i in 0..active_idx {
                    if !exhausted.contains(&i) {
                        queue_state.active_idx = i;
                        return FailureAction::SwitchProvider;
                    }
                }
                return FailureAction::Exhausted;
            }
        }
        FailureAction::RetryCurrent
    }

    /// Reset exhausted state for a specific queue
    pub fn reset_queue_exhausted(&mut self, queue_id: &str) {
        if let Some(queue_state) = self.queues.get_mut(queue_id) {
            queue_state.exhausted_indices.clear();
            queue_state.fail_counts = vec![0; queue_state.items.len()];
            queue_state.active_idx = 0;
        }
    }

    /// Get state info for all queues
    pub fn get_all_queue_states(&self) -> HashMap<String, QueueStateInfo> {
        self.queues
            .iter()
            .map(|(id, q)| {
                (
                    id.clone(),
                    QueueStateInfo {
                        active_idx: q.active_idx,
                        exhausted_indices: q.exhausted_indices.clone(),
                        items: q.items.clone(),
                    },
                )
            })
            .collect()
    }

    // ── Backward-compatible shims (delegate to the default queue) ──────────

    /// Returns (Provider, model_id) for the default queue's active entry.
    #[allow(dead_code)]
    pub fn active_entry(&self) -> Option<(&Provider, &str)> {
        self.active_entry_for_queue(&self.default_queue_id)
    }

    /// Records a failure against the default queue.
    #[allow(dead_code)]
    pub fn record_failure(&mut self) -> FailureAction {
        let queue_id = self.default_queue_id.clone();
        self.record_failure_for_queue(&queue_id)
    }

    /// Resets exhausted state for the default queue.
    #[allow(dead_code)]
    pub fn reset_exhausted(&mut self) {
        let queue_id = self.default_queue_id.clone();
        self.reset_queue_exhausted(&queue_id);
    }

    /// Returns the exhausted indices for the default queue.
    #[allow(dead_code)]
    pub fn get_exhausted_indices(&self) -> Vec<usize> {
        self.queues
            .get(&self.default_queue_id)
            .map(|q| q.exhausted_indices.clone())
            .unwrap_or_default()
    }

    /// Returns the active_idx for the default queue.
    #[allow(dead_code)]
    pub fn get_active_idx(&self) -> usize {
        self.queues
            .get(&self.default_queue_id)
            .map(|q| q.active_idx)
            .unwrap_or(0)
    }
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

#[allow(dead_code)]
pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}

pub fn new_router_with_auth(cfg: &AppConfig, auth: HashMap<String, String>) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config_with_auth(cfg, auth)))
}

pub fn new_router_with_providers(
    cfg: &AppConfig,
    providers: Vec<Provider>,
    auth: HashMap<String, String>,
) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config_with_providers(cfg, providers, auth)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AppMapping, MatchRule, MatchRuleType, Model, Protocol, Queue};

    fn make_provider(id: &str, model_id: &str) -> Provider {
        Provider {
            id: id.to_owned(),
            name: id.to_owned(),
            anthropic_url: "https://example.com/api".to_owned(),
            openai_url: "https://example.com/api".to_owned(),
            dual_protocol: false,
            protocol: Protocol::Anthropic,
            auth_scheme: None,
            models: vec![Model {
                id: model_id.to_owned(),
                name: model_id.to_owned(),
                is_custom: false,
            }],
            priority: 100,
            is_custom: false,
            link: None,
            description: None,
        }
    }

    fn make_config(
        queues: HashMap<String, Queue>,
        app_mapping: Vec<AppMapping>,
    ) -> AppConfig {
        AppConfig {
            retry: RetryConfig::default(),
            queues,
            app_mapping,
            default_queue_id: "default".to_string(),
            queue: vec![],
            port: 7860,
        }
    }

    #[test]
    fn test_queue_state_from_items() {
        let items = vec![
            QueueItem { provider_id: "p1".to_owned(), model_id: "m1".to_owned() },
            QueueItem { provider_id: "p2".to_owned(), model_id: "m2".to_owned() },
        ];
        let state = QueueState::from_items(items);
        assert_eq!(state.active_idx, 0);
        assert_eq!(state.fail_counts.len(), 2);
        assert!(state.exhausted_indices.is_empty());
    }

    #[test]
    fn test_multi_queue_router_state() {
        let mut queues = HashMap::new();
        queues.insert(
            "default".to_string(),
            Queue {
                id: "default".to_string(),
                name: "默认".to_string(),
                items: vec![QueueItem { provider_id: "p1".to_owned(), model_id: "m1".to_owned() }],
            },
        );
        queues.insert(
            "queue-2".to_string(),
            Queue {
                id: "queue-2".to_string(),
                name: "队列2".to_string(),
                items: vec![QueueItem { provider_id: "p2".to_owned(), model_id: "m2".to_owned() }],
            },
        );

        let providers = vec![make_provider("p1", "m1"), make_provider("p2", "m2")];
        let cfg = make_config(queues, vec![]);

        let router = RouterState::from_config_with_providers(&cfg, providers, HashMap::new());
        assert_eq!(router.queues.len(), 2);

        let (p, m) = router.active_entry_for_queue("default").unwrap();
        assert_eq!(p.id, "p1");
        assert_eq!(m, "m1");
    }

    #[test]
    fn test_identify_queue_with_user_agent() {
        let mut queues = HashMap::new();
        queues.insert(
            "default".to_string(),
            Queue { id: "default".to_string(), name: "默认".to_string(), items: vec![] },
        );
        queues.insert(
            "queue-claude".to_string(),
            Queue { id: "queue-claude".to_string(), name: "Claude".to_string(), items: vec![] },
        );

        let cfg = make_config(
            queues,
            vec![AppMapping {
                app_id: "claude-code".to_string(),
                display_name: "Claude Code".to_string(),
                match_rules: vec![MatchRule {
                    rule_type: MatchRuleType::UserAgentContains,
                    pattern: "claude-code".to_string(),
                    header_name: None,
                }],
                queue_id: "queue-claude".to_string(),
            }],
        );

        let router = RouterState::from_config_with_providers(&cfg, vec![], HashMap::new());

        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            "user-agent",
            axum::http::HeaderValue::from_static("claude-code/1.0"),
        );
        assert_eq!(router.identify_queue(&headers, "/v1/messages"), "queue-claude");

        let mut headers2 = axum::http::HeaderMap::new();
        headers2.insert(
            "user-agent",
            axum::http::HeaderValue::from_static("other-app/1.0"),
        );
        assert_eq!(router.identify_queue(&headers2, "/v1/messages"), "default");
    }

    #[test]
    fn test_record_failure_switches_provider() {
        let mut queues = HashMap::new();
        queues.insert(
            "default".to_string(),
            Queue {
                id: "default".to_string(),
                name: "默认".to_string(),
                items: vec![
                    QueueItem { provider_id: "p1".to_owned(), model_id: "m1".to_owned() },
                    QueueItem { provider_id: "p2".to_owned(), model_id: "m2".to_owned() },
                ],
            },
        );

        let providers = vec![make_provider("p1", "m1"), make_provider("p2", "m2")];
        let mut cfg = make_config(queues, vec![]);
        cfg.retry = RetryConfig { max_retries: 1, retry_delay_secs: 0 };

        let mut router = RouterState::from_config_with_providers(&cfg, providers, HashMap::new());

        // First failure: retry
        assert_eq!(router.record_failure_for_queue("default"), FailureAction::RetryCurrent);
        // Second failure: switch (exceeds max_retries=1)
        assert_eq!(router.record_failure_for_queue("default"), FailureAction::SwitchProvider);
        // Now active is p2
        let (p, _) = router.active_entry_for_queue("default").unwrap();
        assert_eq!(p.id, "p2");
    }
}
