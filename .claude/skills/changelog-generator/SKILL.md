---
name: changelog-generator
description: 自动生成和更新 CHANGELOG.md。当用户提到 changelog、发布说明、release notes、版本更新、准备发布、tag 发布、版本变更时触发此技能。根据 git commit history 自动生成符合 Keep a Changelog 格式的变更日志。
---

# Changelog Generator

自动根据 git commit history 生成符合 [Keep a Changelog](https://keepachangelog.com/) 格式的 CHANGELOG.md 文件。

## 工作流程

### 1. 确定版本范围

首先获取当前版本信息：

```bash
# 获取当前最新 tag
git describe --tags --abbrev=0

# 获取所有 tags（按时间排序）
git tag --sort=-creatordate

# 如果没有 tag，从第一个 commit 开始
git rev-list --max-parents=0 HEAD
```

**场景处理**：
- **已有 tag 且用户指定新版本**: 使用用户指定的版本号
- **已有 tag 且未指定**: 建议用户确认版本号（根据 commit 类型判断是 major/minor/patch）
- **没有 tag**: 从第一个 commit 开始，版本号建议为 `0.1.0`

### 2. 获取 Commit 历史

获取版本范围内的所有 commits：

```bash
# 从上一个 tag 到当前 HEAD
git log <previous-tag>..HEAD --pretty=format:"%s" --no-merges

# 如果没有上一个 tag，从第一个 commit 开始
git log --pretty=format:"%s" --no-merges
```

### 3. 分析和分类 Commits

按照 [Conventional Commits](https://www.conventionalcommits.org/) 规范分析 commit message：

| 类型 | 前缀 | Changelog 分类 |
|------|------|----------------|
| feat | `feat:` / `feat(scope):` | Added / New features |
| fix | `fix:` / `fix(scope):` | Fixed / Bug fixes |
| refactor | `refactor:` | Changed / Code improvements |
| docs | `docs:` | Changed / Documentation |
| style | `style:` | Changed (可省略或合并到其他) |
| test | `test:` | Changed / Testing |
| chore | `chore:` | Changed / Maintenance |
| perf | `perf:` | Changed / Performance |
| breaking | `!` 后缀或 `BREAKING CHANGE:` | Breaking changes |

**解析规则**：
- 提取类型前缀（第一个 `:` 之前的内容）
- 提取 scope（括号内的内容，可选）
- 提取描述（`:` 之后的内容，去除前导空格）
- 检测 BREAKING CHANGE（`!` 后缀或 footer 中的 `BREAKING CHANGE:`）

### 4. 生成 Changelog 内容

使用 Keep a Changelog 格式：

```markdown
## [version] - YYYY-MM-DD

### Added
- 描述新功能

### Changed
- 描述变更

### Deprecated
- 描述即将移除的功能

### Removed
- 描述已移除的功能

### Fixed
- 描述 bug 修复

### Security
- 描述安全相关修复
```

**生成规则**：
- Breaking changes 放在最前面或单独 `### Breaking Changes` 部分
- 每个 commit 描述简洁明了，去除类型前缀
- 相似变更可合并描述
- 按重要性排序（breaking > added > fixed > changed）

### 5. 更新 CHANGELOG.md

**文件不存在**: 创建新文件，包含头部和首个版本条目

**文件已存在**: 在现有文件顶部插入新版本条目（保持历史版本在下方）

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-01-15

### Added
- Initial release
```

## 示例

**输入 Commits**:
```
feat(auth): add JWT authentication
fix(proxy): resolve 429 handling issue
refactor(router): simplify queue management
docs: update README with installation guide
chore: update dependencies
feat(ui)!: redesign settings page (BREAKING CHANGE: removes old config format)
```

**输出 Changelog**:
```markdown
## [1.2.0] - 2024-01-20

### Breaking Changes
- Redesign settings page - removes old config format

### Added
- JWT authentication support

### Fixed
- 429 handling issue in proxy

### Changed
- Simplify queue management in router
- Update README with installation guide
- Update dependencies
```

## 执行步骤

1. **询问版本号**: 如果用户未指定，根据 commit 类型建议版本号
   - 有 breaking change → major bump
   - 有 feat → minor bump
   - 只有 fix/chore → patch bump

2. **获取 commits**: 执行 git log 命令获取变更历史

3. **分类处理**: 按类型分组 commit messages

4. **生成内容**: 按格式生成 changelog 条目

5. **更新文件**: 读取现有 CHANGELOG.md（如存在），插入新内容

6. **确认结果**: 向用户展示生成的 changelog 内容，确认无误

## 注意事项

- 忽略 merge commits（`--no-merges`）
- 对于没有前缀的 commit，尝试根据内容推断类型
- 如果 commit 数量过多（>50），建议用户检查是否有遗漏的重要变更
- Breaking changes 需要特别标注并放在显眼位置
- 日期使用当前日期（发布日期）