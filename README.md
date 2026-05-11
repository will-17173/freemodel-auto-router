

# 项目需求

做一个类似 cc-switch 的ai 编程工具的路由切换工具。
暂时只要支持 claude code。
应用内会预设一些免费的大模型供应商，用户填入他们的 apikey， 就可以在应用内切换使用不同的模型供应商了。
当某个供应商的额度用完了，自动切换到下一个供应商。
用户可以设置优先级。
可以设置启用某些供应商， 以及某个供应商要启用哪个模型。
供应商和支持的模型都由应用内置。 
用户可以配置自己的供应商和模型等。 


## 举个例子：
OpenRouter 的预设：
供应商 url：
协议： openai / anthropic
模型：
- gpt-4o
- gpt-4o-2024-08-06

apikey：用户输入

## 附：cc-switch 配置切换机制分析

调用链
前端 useProviderActions.switchProvider()
  → switchProviderMutation (React Query)
  → invoke("switch_provider") [Tauri command]
  → ProviderService::switch()
  → write_live_with_common_config()
  → write_live_snapshot()
  → write_json_file(&path, &settings)  ← 写入磁盘


写入内容
每个供应商存储了一个 settingsConfig JSON 对象，切换时直接覆盖写入 ~/.claude/settings.json。写入前会清除两个内部字段：

apiFormat / api_format
openrouterCompatMode / openrouter_compat_mode

附加逻辑
公共配置（Common Config）：切换时会将用户配置的"公共配置片段"合并进供应商配置再写入
Claude 插件同步：若开启了 "应用到 Claude Code 插件" 设置，还会额外调用 apply_claude_plugin_config 修改 VSCode Copilot 插件的供应商设置
原子写入：所有写入通过 atomic_write（先写临时文件再重命名）保证数据安全