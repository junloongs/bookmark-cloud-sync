# 📚 书签云同步（Bookmark Cloud Sync）

> 通过 WebDAV（坚果云、Nextcloud、自建服务等）在多个浏览器之间自动同步书签。
> 双向合并、定时同步、首次跨浏览器自动配对、30 天删除墓碑可恢复。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest Version](https://img.shields.io/badge/manifest-v3-green.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-102%2B-blue.svg)](https://www.google.com/chrome/)
[![Edge](https://img.shields.io/badge/Edge-102%2B-blue.svg)](https://www.microsoft.com/edge)
[![Firefox](https://img.shields.io/badge/Firefox-109%2B-orange.svg)](https://www.mozilla.org/firefox/)

[English](#english) | [中文](#中文)

---

## 中文

### ✨ 核心能力

| 能力 | 说明 |
|---|---|
| 🔄 **双向合并（LWW）** | 每个节点按最后修改时间仲裁，两台浏览器互不覆盖 |
| 🤝 **首次同步自动配对** | 按 URL / 标题 / 目录层级启发式匹配，**不会重复导入** |
| ☁️ **定时自动同步** | 可设间隔；本地书签变动后 15 秒内自动同步 |
| 🛡️ **冲突安全** | ETag 乐观锁 + 412 冲突自动重合并，多浏览器同时写入不会互相覆盖 |
| 🗑️ **删除可恢复** | 删除节点保留 30 天墓碑，过期自动清理 |
| 🌐 **跨浏览器兼容** | Chromium（Chrome / Edge / 360 极速 X / 夸克）+ Firefox |
| 🔐 **零知识存储** | 密码只存本机扩展，不上传任何第三方；通过 WebDAV Basic 直传 |
| 🪶 **轻量** | 无第三方依赖，单文件 < 35KB |

### 🚀 安装与配置

#### 1. 安装扩展（任选一种）

- **从商店**：发布后将公布在 [Microsoft Edge Add-ons](#-商店链接) 与 Chrome Web Store
- **开发者模式**：
  - 打开 `chrome://extensions`（Edge：`edge://extensions`，Firefox：`about:debugging#/runtime/this-firefox`）
  - 开启「开发者模式」
  - 点「加载已解压的扩展程序」→ 选本项目根目录
- **预打包 ZIP**：运行 `python scripts/pack_extension.py` 生成 `bookmark-cloud-sync-v1.0.0.zip`

#### 2. 准备 WebDAV 服务（以坚果云为例）

1. 注册 [坚果云](https://www.jianguoyun.com/) 账号
2. 登录网页版 → 右上角头像 → 账号信息 → 安全选项
3. 在「应用密码管理」**添加应用密码**（描述写「书签同步」即可）
4. 记下用户名（注册邮箱）与生成的应用密码

> ⚠️ 坚果云要求使用**应用密码**，不是登录密码。其他 WebDAV 服务参考各自文档。

#### 3. 填写扩展设置

1. 工具栏点扩展图标 → ⚙ 设置
2. 填入：
   - **服务器地址**：`https://dav.jianguoyun.com/dav/`（坚果云）
   - **用户名**：注册邮箱
   - **密码**：刚才生成的应用密码
   - **书签文件路径**：`bookmark-sync/bookmarks.json`（默认即可）
3. 点「**测试连接**」→ 显示「✔ 连接成功」即可
4. 点「**保存设置**」→ 第一次会弹授权框，点「允许」

#### 4. 同步

- **手动**：设置页点「⇅ 合并同步」
- **自动**：勾选「开启自动同步」+ 设间隔（建议 15-60 分钟）
- **跨浏览器首次同步**：在第二个浏览器装好后直接点「合并同步」，会自动按 URL/标题配对，**不会重复导入**

### 🧩 同步策略

```
                  ┌──────────────────────────┐
                  │   WebDAV 服务器 (快照)   │
                  │  bookmarks.json (JSON)   │
                  └────────────▲──┬───────────┘
                  ┌──────────────┴─┴────────────┐
              读 ↓                              ↓ 读
       ┌────────────────┐                ┌────────────────┐
       │  浏览器 A       │   ─────────►  │  浏览器 B       │
       │  (本地书签)     │   ◄─────────  │  (本地书签)     │
       └────────────────┘                └────────────────┘
        LWW 仲裁 + 墓碑（30 天）+ ETag 乐观锁
```

每个节点独立按「最后修改时间」仲裁：
- 本地时间 > 服务器时间 → 本地赢
- 本地时间 < 服务器时间 → 服务器赢
- 时间相同 → 服务器优先

### 🐛 故障排查

**点「测试连接」一直转圈**
- `edge://extensions` 找到本扩展 → 点「重新加载」
- 检查网络能访问 `https://dav.jianguoyun.com`

**收到 401 认证失败**
- 确认密码是「**应用密码**」而不是登录密码
- 生成路径：坚果云网页版 → 头像 → 账号信息 → 安全选项 → 应用密码管理

**夸克 / 360 极速 X 弹出 WebDAV 账号密码框**
- 这是**浏览器内置**的「网盘助手」触发，与本扩展无关
- 夸克：≡ → 设置 → 通用 → 密码管理箱 → 关闭「密码保存提示」
- 360 极速 X：右上角菜单 → 设置 → 高级设置 → 内置功能 → 关闭「网盘小工具」

更多见 [docs/privacy-policy.md](docs/privacy-policy.md) 与 [store-listing/](store-listing/)。

### 🤝 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。Issue / PR 欢迎。

### 📜 许可证

[MIT](LICENSE) © 2026 Long Junshi

---

## English

A browser extension that syncs your bookmarks across multiple browsers via WebDAV (Nutstore / Nextcloud / self-hosted).

**Features**: bi-directional LWW merge, automatic first-time pairing, scheduled auto-sync, 30-day tombstones for recoverable deletes, ETag optimistic locking, Chromium + Firefox compatible, zero-knowledge credential storage.

### Quick start

1. Install the extension from your browser's add-on store (or load unpacked in developer mode)
2. Get a WebDAV server (Nutstore, Nextcloud, etc.) and an **app-specific password**
3. Open the extension's settings page, fill in server URL / username / app-password / file path
4. Click 「Test connection」 → 「Save」 → first time you'll be prompted to grant host permission
5. Click 「Merge sync」 — that's it!

For detailed setup instructions for Nutstore (坚果云), Nextcloud, Synology, ownCloud, and generic WebDAV servers, see [docs/](docs/).

### Contributing

PRs / issues welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

### License

[MIT](LICENSE) © 2026 Long Junshi