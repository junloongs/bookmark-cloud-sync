# Edge Add-ons 商店上架文案

> 适用：Microsoft Edge Add-ons
> 准备字数限制（参考）：名称 ≤50、简短描述 ≤132、详细描述无限制
> 上架地址：https://partner.microsoft.com/dashboard/microsoftedge

---

## 名称（Name）

```
书签云同步（WebDAV）
```

英文备用名：

```
Bookmark Cloud Sync (WebDAV)
```

## 简短描述（Short description，≤132 字符）

```
通过 WebDAV（坚果云等）在多浏览器间自动同步。双向合并、定时同步、零知识存储。
```

字符数：43（含标点）

## 详细描述（Detailed description）

### 标题段

**多浏览器书签同步，无需注册、不上传第三方**——通过你现有的坚果云 / Nextcloud / 自建 WebDAV，在 Chrome、Edge、Firefox、360 极速 X 之间无缝同步书签。

### 你能立刻用到

```
✅ 跨浏览器无缝同步     Chrome、Edge、Firefox、360 极速 X 任意搭配
✅ 双向合并（LWW）       两个浏览器各改各的，不会互相覆盖
✅ 首次自动配对          不会重复导入，相同 URL 自动识别为同一条
✅ 定时自动同步          设置 15-60 分钟间隔；本地改动 15 秒内自动同步
✅ 删除可恢复            误删 30 天内还能从另一台浏览器合并回去
✅ 零知识                密码只存你本机，不上传任何第三方
```

### 它能做什么

- 🔄 **双向 LWW 合并**：每个书签独立按时间戳仲裁，最安全的是同步。不会互相覆盖。
- 🤝 **首次同步自动配对**：按 URL + 标题 + 目录层级启发式匹配，本地有 500 条书签 + 服务器有 500 条，**不会变成 1000 条**。
- ☁️ **定时 + 自动同步**：可设间隔；本地改一个书签 → 15 秒内悄悄上传。
- 🛡️ **冲突安全**：两个浏览器同时改同一节点 → ETag 乐观锁 + 412 自动重试，**绝不丢数据**。
- 🗑️ **删除可恢复 30 天**：A 浏览器删除的书签，B 浏览器 30 天内合并能恢复。
- 🌐 **多浏览器支持**：Chrome、Edge、Firefox、360 极速 X、夸克、Opera 全兼容。
- 🔐 **零知识存储**：密码只存本机浏览器扩展，不上传任何第三方；通过 WebDAV Basic 直传。
- 🪶 **零依赖**：无 npm 包、无构建工具、单文件 < 35KB。

### 谁该用

- 📚 **多浏览器用户**：家里 Chrome + 公司 Edge，手机一样（**日常**），想要书签到处都一致
- 🌍 **注重隐私**：不想把书签交给 Google / Mozilla / 微软
- 💼 **WebDAV 用户**：已有坚果云 / Nextcloud / 自建服务，免费利用
- 🔧 **极客**：自建 WebDAV（MinIO / S3 / ownCloud）做最私密的备份

### 它**不**做什么

- ❌ 不上传你的书签到任何第三方服务器（只到你配置的 WebDAV）
- ❌ 不收集任何使用统计或遥测
- ❌ 不需要注册账号
- ❌ 不需要付费
- ❌ 不在页面注入任何内容、不读你的浏览历史

### 30 秒上手

```
1. 工具栏点扩展图标 → ⚙ 设置
2. 服务器地址填 https://dav.jianguoyun.com/dav/
3. 用户名填注册邮箱
4. 密码填「应用密码」（不是登录密码）
   → 坚果云网页版 → 头像 → 账号信息 → 安全选项 → 应用密码管理
5. 点「测试连接」→ 显示「✔ 连接成功」
6. 点「保存设置」→ 弹授权框点「允许」
7. 点「⇅ 合并同步」→ 搞定
```

### 技术细节（给极客）

- 同步数据格式：JSON 快照（schema v1）
- 算法：双向 LWW + 30 天墓碑 + ETag 乐观锁 + 412 重试
- 浏览器 API：MV3 `chrome.bookmarks` / `chrome.storage` / `chrome.alarms`
- WebDAV：标准 Basic Auth over HTTPS，路径：`MKCOL` / `GET` / `PUT` / `DELETE` / `If-Match`
- 兼容 WebDAV 服务：坚果云、Nextcloud、ownCloud、Synology、MinIO（S3 Gateway）、CloudDrive 等

### 隐私

零知识。完整声明见 [隐私政策](https://github.com/junloongs/bookmark-cloud-sync/blob/main/docs/privacy-policy.md)。

### 开源

[GitHub: junloongs/bookmark-cloud-sync](https://github.com/junloongs/bookmark-cloud-sync)
MIT 许可证。Issue / PR 欢迎。

### 反馈

- 🐛 [报告 bug](https://github.com/junloongs/bookmark-cloud-sync/issues/new?template=bug.yml)
- 💡 [提建议](https://github.com/junloongs/bookmark-cloud-sync/issues/new?template=feature_request.yml)

## 类别（Category）

```
生产力 / 工具
```

## 商店截图要求（5 张，1280×800 或 640×400 PNG/JPG）

| # | 主题 | 文件名占位 | 内容说明 |
|---|---|---|---|
| 1 | 设置页（已连接状态） | `01-settings.png` | 显示「✔ 连接成功」、账号已填、配置已保存 |
| 2 | 合并同步完成 | `02-merge-done.png` | 显示「同步完成 ✔（新建 X，更新 X，移动 X，删除 X）」 |
| 3 | 自动同步设置 | `03-auto-sync.png` | 显示「开启自动同步」+ 间隔 30 分钟 |
| 4 | 跨浏览器首次同步 | `04-first-sync.png` | 说明两个浏览器已自动配对，不会重复 |
| 5 | 错误提示友好性 | `05-error-hint.png` | 显示「✘ 认证失败（HTTP 401）」+ 引导用户去坚果云生成应用密码 |

截图存放：`store-listing/screenshots/`

## 图标

- 128×128 PNG：靛蓝→紫罗兰渐变 + 白色书签 + 琥珀色同步箭头（已有）
- 48×48、16×16：同上

## 隐私政策 URL

```
https://github.com/junloongs/bookmark-cloud-sync/blob/main/docs/privacy-policy.md
```

或：

```
https://junloongs.github.io/bookmark-cloud-sync/privacy-policy.html
```

## 邮箱（开发者联系）

```
shijunlong1031@qq.com
```

## 提交清单

- [ ] ZIP 包（`bookmark-cloud-sync-v1.0.0.zip`）
- [ ] 5 张截图（1280×800 PNG）
- [ ] 128×128 图标
- [ ] 隐私政策 URL
- [ ] 开发者邮箱
- [ ] 类别（生产力 / 工具）
- [ ] 定价：免费