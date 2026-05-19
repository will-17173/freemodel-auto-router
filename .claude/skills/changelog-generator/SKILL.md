---
name: changelog-generator
description: 自动生成和更新 CHANGELOG.md，同时更新项目版本号。当用户提到 changelog、发布说明、release notes、版本更新、准备发布、tag 发布、版本变更时触发此技能。接受版本号参数，根据 git commit history 自动生成符合 Keep a Changelog 格式的变更日志，并更新 Cargo.toml、package.json 和 Tauri 配置中的版本号。
---

# Changelog Generator

自动根据 git commit history 生成符合 [Keep a Changelog](https://keepachangelog.com/) 格式的 CHANGELOG.md 文件，并更新项目版本号。

## 参数

接受版本号参数，格式为 `X.Y.Z`（语义化版本）：

```
/changelog-generator 0.2.0
```

或直接指定：```
生成 v0.2.0 的 changelog
```

## 工作流程

### 1. 更新项目版本号

在生成 changelog 前，先更新项目中的版本号文件：

**需要更新的文件**：
- `src-tauri/Cargo.toml` 第 3 行：`version = "X.Y.Z"`
- `package.json` 第 4 行：`"version": "X.Y.Z"`
- `src-tauri/tauri.conf.json` 第 4 行：`"version": "X.Y.Z"`

**更新方法**：
1. 使用 Edit 工具修改 Cargo.toml 的 version 行
2. 使用 Edit 工具修改 package.json 的 version 行
3. 使用 Edit 工具修改 tauri.conf.json 的 version 行
4. 确保三个文件的版本号保持一致

### 2. 确定版本范围

获取当前版本信息：

```bash
# 获取当前最新 tag
git describe --tags --abbrev=0

# 获取所有 tags（按时间排序）
git tag --sort=-creatordate
```

**场景处理**：
- **用户指定版本号**: 使用用户指定的版本号
- **用户未指定版本号**: 询问用户版本号，或根据 commit 类型建议
  - 有 breaking change → major bump
  - 有 feat → minor bump
  - 只有 fix/chore → patch bump

### 3. 获取 Commit 历史

获取版本范围内的所有 commits：

```bash
# 从上一个 tag 到当前 HEAD
git log <previous-tag>..HEAD --pretty=format:"%s" --no-merges

# 如果没有上一个 tag，从第一个 commit 开始
git log --pretty=format:"%s" --no-merges
```

### 4. 分析和分类 Commits

按照 [Conventional Commits](https://www.conventionalcommits.org/) 规范分析 commit message：

| 类型 | 前缀 | Changelog 分类 |
|------|------|----------------|
| feat | `feat:` / `feat(scope):` | Added |
| fix | `fix:` / `fix(scope):` | Fixed |
| refactor | `refactor:` | Changed |
| docs | `docs:` | Changed |
| style | `style:` | Changed |
| test | `test:` | Changed |
| chore | `chore:` | Changed |
| perf | `perf:` | Changed |
| breaking | `!` 后缀或 `BREAKING CHANGE:` | Breaking Changes |

### 5. 生成 Changelog 内容

使用 Keep a Changelog 格式：

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Breaking Changes
- 描述 breaking changes（如有）

### Added
- 描述新功能

### Fixed
- 描述 bug 修复

### Changed
- 描述其他变更
```

### 6. 更新 CHANGELOG.md

在现有文件顶部插入新版本条目（保持历史版本在下方）。

## 执行步骤

**按顺序执行**：

1. **确认版本号**: 如果用户提供了版本号参数，直接使用；否则询问用户

2. **更新版本号文件**: 
   - 编辑 `src-tauri/Cargo.toml` 更新 version 字段
   - 编辑 `package.json` 更新 version 字段
   - 编辑 `src-tauri/tauri.conf.json` 更新 version 字段

3. **获取 commits**: 执行 git log 命令获取变更历史

4. **分类处理**: 按类型分组 commit messages

5. **生成 changelog**: 按格式生成 changelog 条目

6. **更新 CHANGELOG.md**: 在文件顶部插入新内容

7. **展示结果**: 向用户展示变更摘要，确认无误

## 示例

**用户输入**: `/changelog-generator 0.2.0`

**执行过程**：
1. 更新 `src-tauri/Cargo.toml`: `version = "0.2.0"`
2. 更新 `package.json`: `"version": "0.2.0"`
3. 更新 `src-tauri/tauri.conf.json`: `"version": "0.2.0"`
4. 获取 v0.1.0 到 HEAD 的 commits
5. 分类 commits 并生成 changelog
6. 更新 CHANGELOG.md

**输出摘要**：
```
已更新版本号到 0.2.0:
- src-tauri/Cargo.toml
- package.json
- src-tauri/tauri.conf.json

CHANGELOG.md 已更新:
## [0.2.0] - 2024-01-20
### Added
- 检查更新功能
- GitHub Actions CI
### Fixed
- ...
```

## 注意事项

- 三个版本号文件必须保持一致：`src-tauri/Cargo.toml`、`package.json`、`src-tauri/tauri.conf.json`
- Tauri Release 产物文件名使用 `src-tauri/tauri.conf.json` 的 `version`，不能漏改
- Cargo.lock 会在编译时自动更新，无需手动修改
- 忽略 merge commits（`--no-merges`）
- Breaking changes 需特别标注
- 日期使用当前日期（发布日期）
