# 更新日志

[English](CHANGELOG.md) · 简体中文

Heliolune 遵循语义化版本。`0.4.0` 为当前 Git 仓库之前的原型历史，`0.5.0-alpha.1` 是当前仓库保留的第一个提交版本。

## [0.5.2] - 2026-08-02

### 新增

- 当 Codex host 提供 progress token 时，发送标准 MCP `notifications/progress`。
- 增加 `start_task` 与独立的 `luna-await.await_task` server，使 Sol 只阻塞等待一次，同时状态读取不会被同一 MCP server 串行卡住。
- 对不支持 MCP Apps 的 Windows host 增加现代 WPF 悬浮窗：五个 lane、逐 worker 进度、Luna 自然语言 reasoning summary、历史 benchmark 校准的 Sol-only 费用与节省预测、中英文自动识别、实际渲染握手与限时自动关闭。
- 对声明 `io.modelcontextprotocol/ui` 的 host 提供同一五 lane 状态契约的内联 MCP App，并自动禁止原生悬浮窗。
- 兼容 host 仍可使用标准限频 progress，覆盖路由、活动、缓存、finalization、verification、Leader 压缩与终态。
- 提供英文/简体中文 README、架构、benchmark、贡献、安全和发布检查文档切换。
- 更新日志向前补齐到 pre-Git `0.4.0`。

### 兼容性

- MCP progress 是可选能力。Codex CLI 0.146.0 的模型 MCP 调用不携带 `_meta.progressToken`，也没有声明 MCP Apps，因此 Windows 自动使用原生悬浮窗。
- Codex 清理后的 MCP 环境缺少 `windir`，旧版 WPF 字体初始化要求绝对 Windows Fonts URI；面板进程仅在自身范围内从 `SystemRoot` 恢复该变量。
- Codex 清理 Node 区域设置变量时从 Windows 用户注册表读取语言，使 Luna 自然语言说明与面板语言保持一致。
- 更新插件后需要新建 Codex 任务。
- 安装后的 Heliolune MCP 工具默认使用 `approve`，避免 Desktop 或非交互 host 在进入阻塞调用前重复确认；Codex sandbox 与用户配置覆盖仍然有效。

## [0.5.1] - 2026-08-02

### 新增

- 将共享 supervisor 提升为 Luna/high Operations Leader，负责存活判断、跨 lane digest 跟踪和结果压缩。
- 新增 `reporting=auto|leader|direct`、阈值、effort、timeout 和 raw audit 选项。
- 小任务不唤醒 Leader，只保存有上限的 lifecycle backlog；下一次 Leader turn 批量接收。

### 边界

- Leader 不得读仓库、规划、分配任务、决定架构/安全/API/迁移、超越 verifier 判断正确性或最终验收。

## [0.5.0-alpha.2] - 2026-08-02

- 在原硬截止内预留结构化收尾窗口。
- 使用 app-server `turn/steer` 让活跃 Luna/max 原位停止工具并返回 schema。
- 只有 completed-but-invalid JSON 才启用一次 no-tools fallback turn。
- 合并中断工作和 fallback usage，增加 finalization 统计与真实回归。

## [0.5.0-alpha.1] - 2026-08-02

- 首个阻塞式 Codex MCP adapter。
- 四个隐藏 Luna/max lane、条件 verifier、Sol 保留决策边界。
- timeout 分类、Luna/high liveness supervisor、精确 usage、价格表和 cost dashboard。
- PowerShell 5.1/7 发布脚本、GitHub Actions、插件/Skill 校验和可复现 ZIP。

## [0.4.0] - Pre-Git 原型

### 新增

- 基于 prompt/Skill 的 Sol controller 与四个功能型 Luna worker 角色。
- 稳定角色 prompt、session 复用与缓存命中规则。
- Sol 独占架构、安全、公共 API、不可逆迁移、审查与验收。
- 早期 Sol-only / Sol+Luna benchmark 与价格加权 token 统计。

### 暴露的问题

- Luna 无法稳定作为原生 subagent 模型启动，因此后续改用本地 MCP/app-server。
- Sol 轮询和 transcript 回传可能让 controller 输入大于被委派工作。
- 宽 scope Luna/max 可能持续活跃 90–180 秒仍不输出结构化终态。
- session 生命周期、Desktop 可见性、timeout 诊断、打包和 marketplace 尚未工程化。

本节根据保留的 benchmark 和迁移记录重建；pre-Git 源码没有伪造提交历史。
