# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-19

### Added

- 加密存储 API Key，自动迁移明文 auth.json - 使用 AES-GCM 加密算法保护敏感数据
- 检查更新功能和 GitHub Actions CI - 自动化构建流程和版本检查
- 代理日志追踪和应用检测改进 - 更完善的请求追踪能力
- Provider metadata 和 onboarding 流程更新 - 改进新用户引导体验

### Fixed

- 队列删除行为修复 - 正确处理队列删除后的状态同步
- 配置文件路径标准化为 ~/.config/freemodel/ - 统一配置文件存储位置

### Changed

- 队列 UI badges 和 draft items 改进 - 优化队列项显示和草稿管理
- 文档和资源文件更新 - 同步 README 和清理过期文档

## [0.1.0] - 2026-05-15

### Added

#### 核心功能
- 配置数据模型
- Claude settings.json 代理注入/移除（env 三键 + 备份恢复机制）
- 优先队列和故障转移的供应商路由器
- 带流式传输和故障转移的 axum 代理服务器
- Tauri 主进程集成代理启动和系统托盘
- 供应商切换时的系统通知

#### 代理系统
- 可配置的代理端口（默认 7860），支持重启
- 支持 Anthropic 和 OpenAI 双协议端点（`/anthropic` 和 `/openai`）
- 路由前缀解析和 auth header 测试
- 代理日志系统（环形缓冲 200 条，自动过滤敏感字段）
- 429/503 自动故障转移机制

#### 供应商管理
- 供应商管理 - 添加自定义供应商弹窗、服务器状态显示
- 供应商连接测试按钮
- API Keys 从 config.json 分离到 auth.json
- 内置供应商配置（OpenRouter、LongCat 等）
- anthropic_url/openai_url/dual_protocol 字段支持双协议

#### 多队列系统
- Queue, MatchRule, AppMapping 数据结构
- 多队列 RouterState + QueueState 架构
- 队列管理命令
- 队列编辑面板（QueueEditPanel 和 QueueTabs 组件）

#### 应用集成
- Codex 配置注入（auth.json + config.toml）
- Hermes 配置注入（config.yaml 的 model 节点 + custom_providers）
- OpenClaw 配置注入（openclaw.json 的 models.providers）
- 应用检测、分析追踪和队列管理模块

#### 前端界面
- 前端类型和 Tauri API 层
- ProviderCard 组件（拖拽排序、状态显示、连接测试）
- 主 UI 供应商卡片网格和拖拽排序
- 供应商和模型管理功能
- shadcn/ui 基础组件（Button, Card, Badge, Switch, Input, Dialog, ScrollArea）
- Sidebar 和 TopBar 布局组件
- 页面组件（ProvidersPage, QueuePage, LogsPage, SettingsPage）
- 预设供应商配置系统与 Toast 提示组件

### Fixed

- TypeScript 严格空值检查
- OpenRouter 500 问题 - 保留 anthropic headers，Bearer auth，5xx 可重试
- 配置文件模型名固定为 freemodel-auto，路由切换时无需同步更新
- Hermes 开关状态同步
- codex remove() 正确删除 auth.json
- HeaderEquals 逻辑 bug 并持久化迁移
- 民意调查间隔重置和删除队列回退
- 使用 rectSortingStrategy 处理换行队列项拖拽
- 面板 top-12 避免 TopBar 重叠
- 保存失败时回滚孤立队列，添加保存保护，稳定的 DnD keys
- 智能 URL join 避免重复 /v1 前缀
- 配置文件路径改为 ~/.config/freemodel/

### Changed

#### 架构重构
- UI 迁移到 Figma 风格的亮色设计系统
- 单队列改为多队列架构
- 供应商配置从 AppConfig 分离到独立 providers.rs 模块
- Modal 组件迁移到 shadcn/ui Dialog
- App.tsx 重构为 sidebar + content 布局

#### 组件更新
- 删除 DraftQueuePanel.tsx，功能已迁移到 QueueEditPanel
- 删除 QueuePage.tsx，功能已合并到供应商页面
- 提取内置供应商到 JSON 文件
- 移除已弃用的 CreateQueueModal
- 移除路由队列菜单项，保留类型兼容

#### 样式
- 添加 shadcn/ui Airbnb 主题 CSS 变量
- 使用 MonuTitl 作为主等宽字体
- 更新应用图标和 UI 样式优化

#### 文档
- 添加多应用开关设计规范和实现计划
- 添加双 URL 协议支持设计规范和实现计划
- 添加多队列和应用映射设计规范和实现计划
- 添加 UI 重设计设计规范和 Airbnb 设计参考
- 添加配置文件在线更新功能设计文档和实现计划
- 添加队列编辑功能设计文档和实现计划
- 同步 CLAUDE.md/README.md 文档

#### 维护
- 添加代理依赖
- 添加 tailwind 和 dnd-kit
- 添加 shadcn/ui 依赖
- 添加 cn() 辅助函数并配置 @ 路径别名
- 清理已完成的 worktree