# 安全策略

[English](SECURITY.md) · 简体中文

## 支持版本

Heliolune 为 1.0 前软件，仅最新版本接收安全修复。

## 报告漏洞

不要在公开 issue 中发布凭据、私有仓库内容、模型 transcript 或可直接利用的 exploit。请私下联系 maintainer，并提供受影响版本、影响、最小复现与建议缓解措施。

## 信任边界

当前 adapter 启动本地安装的 Codex CLI，worker 获得 host 与 task contract 允许的 scope。Heliolune 不提供强于 host 的文件系统/进程 sandbox；敏感仓库委派前应检查 scope、sandbox 和 approval policy。

安装后，本地 MCP 工具默认设为 `approve`，避免阻塞 worker 调用再等待第二次 host 确认；这不会绕过 Codex 的文件系统或网络 sandbox，用户仍可在 Codex 配置中覆盖该策略。

Operations Leader 接收 liveness、usage、timing、紧凑 objective 和结构化 owner/verifier 结果，但不得读仓库、规划、分配、决定保留边界或最终验收。实时状态界面可以显示 Luna 通过 `item/reasoning/summaryTextDelta` 产生的有长度上限的 Codex reasoning summary，但绝不显示 raw reasoning、命令输出、工具结果或完整 worker transcript。Summary 可能提到仓库路径或当前有界工作，因此应把原生悬浮窗视为本地仓库信息。

本地 registry 保存仓库路径、session id、有上限的 lifecycle digest、计数和 raw usage。start/await job 还会在 `%LOCALAPPDATA%\OpenAI\Codex\luna-pool-orchestrator\jobs` 保存有界状态 snapshot 与紧凑终态 bundle；窗口正常关闭时删除 ready 标记，仅当原生 UI 在渲染前失败时写诊断日志。文件不会上传。`cost_dashboard` 可能向调用 controller 显示路径和 usage。
