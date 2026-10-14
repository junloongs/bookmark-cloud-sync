# 变更日志（Changelog）

本项目的所有重要变更都会记录于此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.0.0] - 2026-10-13

### ✨ 新增
- 双向 LWW（Last-Write-Wins）合并
- 首次跨浏览器同步自动配对（按 URL/标题/目录层级启发式匹配）
- 删除墓碑保留 30 天，可恢复
- ETag 乐观锁 + 412 冲突自动重试
- 本地书签变动后 15 秒防抖自动同步
- 定时同步（alarms API）
- 上传覆盖 / 下载覆盖两种单向同步模式
- WebDAV 服务器连接测试 + 步骤追踪（建目录 / 上传 / 下载 / 删除）
- 多浏览器 host permission 管理（含 Edge site access 探测）
- 诊断面板：API 层权限 + site access 实际可访问性 + 期望权限对比
- 友好错误信息：401 / 403 / 404 / 507 / 超时 / 网络问题各针对性提示
- Chromium MV3 + Firefox MV3 双兼容（`shim.js`）
- 夸克浏览器超时弹窗预警（保存设置时检测 UA）

### 🐛 修复
- IIFE 缺末尾调用括号导致 `collect is not defined`（合并/下载路径）
- `forEach` 回调里误用 `continue`（lib.js 解析失败，导致整个扩展无法初始化）
- `bookmarks.getTree()` 在部分国产浏览器返回不规范节点（children 含 null/undefined）
- 跨域 fetch 缺超时导致「30 秒后台无响应」
- MV3 Service Worker 偶发不回调（options 页面 + 30s 超时兜底）
- Edge site access 总开关未开时 fetch 被拦截
- Host permission 申请在「第一个 await」之外被 Chrome 静默拒绝
- `manifest.json` 删除了多余的 `optional_permissions` 字段（与 `optional_host_permissions` 重复）

### 🎨 视觉
- 全新图标（靛蓝→紫罗兰渐变 + 白色书签 + 琥珀色同步箭头）

### 📚 文档
- README 中英文双语
- 隐私政策
- 商店上架文案（store-listing/）
- 截图占位说明（screenshots/）
- Issue / PR 模板

### ⚠️ 已知问题
- 夸克浏览器对 401 认证弹窗加了约 30 秒超时（夸克内置行为，无法修改）；首次填写账号密码后浏览器进程内会记住，后续不再弹
- Firefox 不支持 `chrome.declarativeNetRequest` 的部分高级功能，但本扩展未使用，不影响