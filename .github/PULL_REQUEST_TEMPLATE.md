## 描述（Description）

请简要描述你的 PR 改了什么、为什么改、解决了哪个 issue（用 `Closes #123` 关联）。

## 改动类型（Type of change）

- [ ] 🐛 Bug 修复（不影响现有功能的错误修复）
- [ ] ✨ 新功能（不破坏现有功能的新增）
- [ ] 💥 破坏性变更（会导致现有功能异常的修复或功能）
- [ ] 📝 文档更新（文档 / 注释 / README）
- [ ] 🎨 UI/样式（视觉调整）
- [ ] ♻️ 重构（无功能变更的代码整理）

## 测试（Testing）

- [ ] 我已在 Chrome 102+ 加载并测试
- [ ] 我已在 Edge 102+ 加载并测试
- [ ] 我已在 Firefox 109+ 加载并测试（如适用）
- [ ] 我已跑过 `python scripts/pack_extension.py` 验证打包成功
- [ ] 我已跑过 Node.js 语法检查 `lib.js` 没有报错

## 检查清单（Checklist）

- [ ] 我的代码遵循本项目代码风格（无构建工具、保持轻量）
- [ ] 我已在涉及 `bookmarks.getTree()` 的 walk 函数加了 null 防御
- [ ] 我没有提交任何 WebDAV 账号、密码、URL、邮箱等敏感信息
- [ ] 我更新了相关文档（README / CHANGELOG / 注释）
- [ ] 我的改动通过了 `node -e "require('vm')..."` 语法检查

## 截图（如果有 UI 改动）

<!-- 粘贴截图或说明 -->

## 关联 Issue

<!-- Closes #123 / Fixes #456 -->