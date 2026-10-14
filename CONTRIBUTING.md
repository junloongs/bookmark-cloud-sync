# 贡献指南（Contributing）

欢迎为书签云同步贡献代码 / 文档 / 翻译 / 测试 / 反馈。本指南帮助你快速上手。

## 🎯 我能贡献什么？

| 类型 | 适合谁 |
|---|---|
| 🐛 [Issue 报告 bug](.github/ISSUE_TEMPLATE/bug.yml) | 任何遇到问题的用户 |
| 💡 [Issue 提功能建议](.github/ISSUE_TEMPLATE/feature_request.yml) | 任何有想法的用户 |
| 🌍 **翻译** | 任何语言（manifest_locale_*.json、README、商店文案） |
| 🎨 **新图标** | 设计师；建议提供 16/48/128 三档 |
| 💻 **代码贡献** | 任何 Web 前端开发者（无构建工具要求） |
| 📖 **文档改进** | 任何想帮忙的人 |
| ⭐ **Star / 推荐** | 任何用户 |

## 🚀 开发流程

### 1. 准备

- 安装 **Git**
- 安装 **Node.js 18+**（可选，用于 ESLint；如果只想测功能不强求）
- 安装 **Python 3.8+**（用于打包脚本 + 跑测试）
- **目标浏览器**：Chrome / Edge / Firefox 任意一个（任何 Chromium 内核都行）

### 2. 克隆与本地加载

```bash
git clone https://github.com/<your-fork>/bookmark-cloud-sync.git
cd bookmark-cloud-sync

# Chrome:  打开 chrome://extensions
# Edge:    打开 edge://extensions
# Firefox: 打开 about:debugging#/runtime/this-firefox
# → 加载已解压的扩展程序 → 选本项目根目录
```

无需 `npm install`——本项目**零运行时依赖**。

### 3. 修改代码

主要文件：

- `manifest.json` — 扩展元数据 + 权限
- `background.js` — Service Worker 入口、消息分发、定时/事件同步
- `lib.js` — 核心库（WebDAV 客户端 + 快照/合并/应用算法）
- `popup.*` — 工具栏弹窗 UI
- `options.*` — 设置页 UI
- `shim.js` — Chromium/Firefox 差异兼容层

**重要约定**：
- 不引入运行时依赖（保持轻量）
- 遵守 MV3（Service Worker，不要用 `window` / `document` 在 background 里）
- 所有 WebDAV 操作经过 `lib.js` 的 `davRequest` —— 超时、错误处理、友好提示统一管
- 涉及 `bookmarks.getTree()` 的 walk 函数必须做 null 防御（部分国产浏览器返回结构不规范）

### 4. 测试

```bash
# 仅语法检查（Node.js 自带）
node -e "require('vm').runInNewContext(require('fs').readFileSync('lib.js','utf-8'),{navigator:{userAgent:'Chrome'},crypto:require('crypto').webcrypto,btoa:b=>Buffer.from(b,'binary').toString('base64')})"

# 打包
python scripts/pack_extension.py
# 产出: bookmark-cloud-sync-v1.0.0.zip
```

手动测试清单：
- [ ] 在不同浏览器（Chrome / Edge / Firefox）加载扩展
- [ ] 测试连接 + 保存设置 + 测试连接成功
- [ ] 合并同步：双向增删改能正确合并
- [ ] 第一次合并：本地有数据 + 服务器有数据 → 不重复导入
- [ ] 删除：A 浏览器删除的书签 → 30 天内 B 浏览器合并能恢复
- [ ] 冲突：两个浏览器同时改同一节点 → 不互相覆盖（412 重试机制）
- [ ] 自动同步：本地改一个书签 → 15 秒内服务器更新
- [ ] 定时同步：alarms 触发正常

### 5. 提交 PR

```bash
git checkout -b feature/your-feature
git add .
git commit -m "feat: 简明描述你的改动"
git push origin feature/your-feature
# 在 GitHub 上发起 Pull Request
```

**Commit 信息规范**（参考 Conventional Commits）：
- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 仅文档改动
- `refactor:` 重构（不改功能）
- `test:` 测试相关
- `chore:` 杂项（构建、CI 等）

## 🔐 安全问题

**不要**在 issue / PR 中公开提交你的 WebDAV 账号密码。如果你发现本扩展有安全问题，请私下发邮件给维护者（见 [README](README.md)）。

## 📜 许可证

提交 PR 即表示你同意按 [MIT](LICENSE) 许可证发布你的贡献。