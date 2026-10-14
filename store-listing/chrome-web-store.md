# Chrome Web Store 商店上架文案

> 适用：Chrome Web Store
> 字数限制：名称 ≤75、简短描述 ≤132、详细描述无限制
> 上架地址：https://chrome.google.com/webstore/devconsole/

---

## 名称（Name）

```
Bookmark Cloud Sync (WebDAV) — Multi-Browser Sync
```

## 简短描述（≤132 字符）

```
Sync bookmarks across browsers via WebDAV (Nutstore / Nextcloud). Bi-directional merge, auto sync, zero-knowledge.
```

字符数：116

## 详细描述（Detailed description）

> 与 Edge 上架文案高度雷同，可直接复用。下面给一份**英文 + 中文混合版**，方便 Chrome Web Store 审核人员理解。

### Bookmark Cloud Sync (WebDAV)

**Multi-browser bookmark sync that respects your privacy.** Uses any WebDAV server you already own — Nutstore, Nextcloud, self-hosted, etc. — as the sync hub.

### Why you need this

You probably use multiple browsers (Chrome + Edge at work, Firefox at home, 360 Speed on grandma's computer...). Without sync, your bookmarks are scattered. Without a privacy-friendly sync, your bookmark data is exposed to third parties.

This extension syncs your bookmarks **directly between your browsers and your own WebDAV server**. No middleman, no account, no tracking.

### Features

```
✅ Cross-browser      Chrome, Edge, Firefox, 360 Speed, Opera, Quark
✅ Bi-directional LWW Every bookmark arbitrated by timestamp — no overwrites
✅ First-time pairing URL + title + folder hierarchy heuristic — no duplicates
✅ Vortex scheduling   Set 15-60 min interval; local changes auto-sync in 15s
✅ Recoverable deletes 30-day tombstones; merge from another browser restores them
✅ Conflict safe       ETag optimistic lock + 412 auto-retry — never loses data
✅ Zero-knowledge       Credentials stored only in browser-local extension storage
✅ Zero dependencies    No npm, no build tools, single file <35 KB
```

### 谁应该使用（Who should use this）

- 📚 **多浏览器用户**：Chrome / Edge / Firefox 任意搭配
- 🌍 **注重隐私**：不想把书签交给 Google / Mozilla / 微软
- 💼 **WebDAV 用户**：已有坚果云 / Nextcloud / 自建服务，免费利用
- 🔧 **极客**：自建 WebDAV（MinIO / S3 / ownCloud）做最私密的备份

### Setup (30 seconds)

```
1. Click extension icon → ⚙ Settings
2. Server URL:    https://dav.jianguoyun.com/dav/
3. Username:      your registered email
4. Password:      APP PASSWORD (not login password)
   → Nutstore web → avatar → Account info → Security → App Password Manager
5. Click "Test connection" → "✔ Connection successful"
6. Click "Save settings" → grant host permission when prompted
7. Click "⇅ Merge sync" → done!
```

### Supported WebDAV servers

- 坚果云 Nutstore (Nutstore China) — most popular in China
- Nextcloud
- ownCloud
- Synology NAS
- MinIO with S3 Gateway
- Any RFC 4918 compliant WebDAV server

### Privacy

**Zero telemetry. Zero tracking.** Credentials and sync state live only in your browser's extension storage (`chrome.storage.local`). Web requests go only to your configured WebDAV server.

Full privacy policy: [link to GitHub privacy-policy.md]

### Open source

[github.com/junloongs/bookmark-cloud-sync](https://github.com/junloongs/bookmark-cloud-sync)
MIT License. Issues and PRs welcome.

## 类别（Category）

```
Productivity
```

## 语言

```
中文 (简体) + English
```

## 隐私政策 URL

```
https://github.com/junloongs/bookmark-cloud-sync/blob/main/docs/privacy-policy.md
```

## 提交清单

- [ ] ZIP 包
- [ ] 5 张截图（1280×800 PNG）
- [ ] 128×128 图标
- [ ] 隐私政策 URL
- [ ] 类别
- [ ] 定价：免费