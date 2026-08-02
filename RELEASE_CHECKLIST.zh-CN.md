# 发布检查单

[English](RELEASE_CHECKLIST.md) · 简体中文

- [ ] manifest 与 runtime 常量版本一致。
- [ ] 审查公共 API、信任边界和迁移变化。
- [ ] 在 Windows PowerShell 5.1 与 PowerShell 7 运行 `scripts/validate-release.ps1`。
- [ ] 确认 marketplace 与 plugin manifest 未被 `.gitignore` 忽略。
- [ ] 运行 cold init、same-lane warm、timeout、verifier 与 Leader smoke。
- [ ] 覆盖 recent activity、stale、supervisor race、hard timeout。
- [ ] 覆盖 in-turn finalization 与 invalid-JSON fallback，确认不延长硬截止。
- [ ] 覆盖 progress token 有/无、单调/限频、activity、finalization、verification、Leader compression 与 terminal status。
- [ ] 覆盖 `start_task` 与独立 `luna-await.await_task`；确认 Luna 工作时 Sol 不轮询、不继续生成。
- [ ] 覆盖 `start_batch` 的 4 路和显式 8 路只读 workstream，记录长尾与共享 Leader 时间。
- [ ] 在 detached Git worktree 中运行 mutating batch；确认非重叠 patch 以 unstaged 方式应用，并且 dirty main、`HEAD` 变化、partial worker、scope 重叠和越界都能原子阻断。
- [ ] 确认原生状态界面列出持久 lane 与动态 burst lane，活动 worker 到达终态，并展示有界的 Luna 自然语言说明，不泄漏 raw reasoning 或 transcript。
- [ ] 确认不再暴露内联 MCP App resource 与 `job_status`，并验证 Windows 原生悬浮窗及 ready handshake。
- [ ] 在 Windows PowerShell 5.1 与 PowerShell 7 运行原生窗口 probe，并覆盖缺失 `windir` 的净化环境。
- [ ] 校验默认价格、dashboard 与 reasoning output 不重复计费。
- [ ] 确认可见节省使用带版本的 matched benchmark profile，而不是 same-token 重定价，并明确标为方向性预测。
- [ ] 路由变化时运行匹配 benchmark，单独排除 warmup overhead。
- [ ] 核对英文/简体中文链接与版本信息。
- [ ] 根据当前官方 Codex 文档复核 Heliolune 与 Codex subagent 中英文对比。
- [ ] 运行 `node .\scripts\measure-tool-schema.mjs` 并记录 schema 体积变化。
- [ ] 确认 Git clean，创建与 manifest 相同的 annotated tag。
- [ ] 运行 `scripts/package-release.ps1`，复核 ZIP SHA-256。
- [ ] 从发布 artifact 安装，并在新 Codex 任务中测试。
- [ ] 上传前确认无 secret、log、cache、临时 schema 或 benchmark workspace。
