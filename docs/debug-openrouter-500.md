# 排查记录：接入 Claude Code 后路由到 OpenRouter 全部返回 500

> 日期：2026-05-11
> 状态：**未解决，待续**
> 现象：在前端打开"接入 CC"开关后，settings.json 写入正确（`ANTHROPIC_BASE_URL=http://localhost:7860`），代理服务确实在监听 7860，请求也成功转发到 OpenRouter，但每次都收到 `HTTP 500 Internal Server Error`（裸文本），Claude Code 因此拿不到回复。

## 已确认的事实

### ✅ key 与端点本身没问题
- 用同一把 key + `baidu/cobuddy:free` 模型直连 OpenRouter（不经过代理）能正常拿到 Claude Code 回复（用户截图证实）。
- `GET https://openrouter.ai/api/v1/auth/key` 返回 200，账号信息正常。
- `GET https://openrouter.ai/api/v1/credits` 显示 `total_credits: 10, total_usage: 0.099`，余额充足。

### ✅ 代理转发链路通
加了 `eprintln!` 日志后看到完整链路：
```
[proxy] inbound POST /v1/messages?beta=true | has_auth=true has_xkey=false ct=Some("application/json")
[proxy] outbound -> https://openrouter.ai/api/v1/messages?beta=true | provider=OpenRouter model=inclusionai/ring-2.6-1t protocol=OpenAI
[proxy] upstream 500 from https://openrouter.ai/api/v1/messages?beta=true body[0..21]: Internal Server Error
```

`Authorization` 由 Claude Code 带入（`has_auth=true`），代理透传。

### ❌ 协议错配（部分根因）
- Claude Code 永远发 Anthropic 格式：`POST /v1/messages?beta=true`，body 是 Anthropic 结构。
- 但 config 里 OpenRouter 的 `protocol` 是 `"openAI"`，所以 `proxy.rs` 给上游加的是 `Authorization: Bearer ...`，**没加 `anthropic-version` 头**。
- OpenRouter `/v1/messages` 端点要求 `anthropic-version`。

### ❌ 但只补 `anthropic-version` 不够
直接用 curl 复现，仍然 500：
```bash
# 都返回 HTTP 500 Internal Server Error
curl -X POST "https://openrouter.ai/api/v1/messages?beta=true" \
  -H "Authorization: Bearer <KEY>" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"baidu/cobuddy:free","max_tokens":50,"messages":[{"role":"user","content":"ping"}]}'

# 用 x-api-key 也一样 500
# 去掉 ?beta=true 也一样 500
# model 用 baidu/cobuddy（无 :free）也一样 500
# model 用 inclusionai/ring-2.6-1t（不存在的模型）也一样 500
```

`Internal Server Error` 是裸文本，不是 OpenRouter 的标准 JSON 错误，说明**触发了 next.js 边缘层的 fallback**，请求根本没进入 OpenRouter 的 anthropic-compat 业务逻辑。

### ❌ Claude Code 直连为什么能成功？
用户截图证实直连可行，但我的所有 curl 复现都 500。差别只能在某些**头/字段**上 —— Claude Code 实际发出去的请求里很可能包含某个我们 curl 没构造的关键字段（例如 `metadata.user_id`、特定 `system` 结构、流式 `stream: true` 的具体 SSE 协商头等）。

## 已经做的改动

### `src-tauri/src/claude_settings.rs`（保留）
- `inject_proxy(port, auth_token, model)` 写入三个 env：`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`
- `update_active(auth_token, model)` 队列首项变更时只刷 token + model
- `restore_backup()` / `has_backup()` / `is_injected(port)` 状态查询与还原
- 备份机制：原 env 三键 + 顶层 `apiBaseUrl` 均备份到 `_fm_backup`，只在第一次注入时记录

### `src-tauri/src/lib.rs`（保留）
注册新的 Tauri commands：`update_active_cmd`、`restore_backup_cmd`、`has_backup_cmd`、`is_injected_cmd`

### `src/api.ts` / `src/App.tsx`（保留）
- 启动时 `isInjected()` + `hasBackup()` 同步开关与按钮显隐
- toggle 注入要传 `(api_key, model_id)`
- `useEffect` 监听 `proxyEnabled` + 队首三元组（provider_id/model_id/api_key）变化，自动调 `updateActive`
- 顶部加「恢复」按钮，仅在 `backupAvailable` 时出现

### `src-tauri/src/proxy.rs`（**临时调试代码，需要决定保留与否**）
- 在 handler 入口 `eprintln!` 打印入站方法/路径/有无 authorization/有无 x-api-key/content-type
- 在转发前 `eprintln!` 打印出站 URL/provider/model/protocol
- **响应非 2xx 时改为 buffer 整个 body**（`resp.bytes().await`），打前 500 字节日志再透传 —— 破坏了错误路径的流式，但便于排查

## 待办

- [ ] **找出 OpenRouter `/v1/messages` 500 的真因**。建议方法：
  - 用 mitmproxy / Charles 抓 Claude Code 直连 OpenRouter 的请求，对比代理转发出去的请求差在哪。
  - 怀疑点：`accept-encoding`（gzip 是否被 reqwest 自动处理坏）、`stream: true` 字段、Claude Code 特有 header（`anthropic-beta`、`x-stainless-*`）。
- [ ] **修复 protocol 选择逻辑**。当前 `proxy.rs` 根据 config 里 provider 的 `protocol` 字段决定鉴权头格式，但 Claude Code 入站路径恒为 `/v1/messages`。两条思路：
  - A. config 里 OpenRouter 改成 `"anthropic"`，让代理加 `anthropic-version` + `x-api-key`（或 Bearer）。前端 UI 也对应调整。
  - B. 代理改为按入站路径决定出站头：`/v1/messages` → 永远 anthropic 头；`/v1/chat/completions` → openai 头。与 provider config 解耦。
- [ ] **决定调试代码去留**。建议保留 `eprintln!` 日志（量不大），但把"非 2xx buffer 响应"那段恢复成原来的流式透传 —— 排查完就回滚到 `bytes_stream`。
- [ ] **独立 bug 1：RouterState 不随 config 同步**。前端 `save_config_cmd` 写文件后不刷 RouterState，运行时仍用启动快照。修法：`save_config_cmd` 后调 `RouterState::from_config` 重建（注意要在写锁保护下做）。
- [ ] **独立 bug 2：`is_retryable_error` 太窄**。当前只重试 429/503，但上游 500/502/504 也应触发"切下一队列项"，否则 Claude Code 直接看到 500 就放弃。
- [ ] **独立 bug 3：`#[serde(rename_all = "camelCase")]` 对 `OpenAI` 变体的实际序列化结果**未验证。config 里写的是 `"openAI"`，但 serde camelCase 规则可能把 `OpenAI` 序列化成 `openAi`（连续大写当一个词的处理），需要 `#[serde(alias = "openAI")]` 兜底。

## 复现路径

1. `~/.config/freemodel/config.json` 队首是 `{provider_id: "openrouter", model_id: "inclusionai/ring-2.6-1t"}`（或任意 OpenRouter 模型）。
2. 启动 `pnpm tauri dev`。
3. 前端打开"接入 CC"开关。
4. 在另一个终端开 Claude Code，发任意 prompt。
5. 观察 Tauri dev 终端 stderr，看到 `[proxy] upstream 500 from https://openrouter.ai/api/v1/messages?beta=true`。
6. Claude Code 端无回复 / 报错。
