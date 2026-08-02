# Heliolune

[English](README.md) · 简体中文

**高智力监督，低成本执行。**

Heliolune 是一个处于 0.x 阶段的模型编排项目：高能力 controller 负责理解、规划、架构、风险、审查与验收，低成本 worker 在紧凑、阻塞式 MCP 边界后完成有明确 scope 的工程任务。第一个可用适配器面向 Codex，由 GPT-5.6 Sol 管理四个隐藏的 GPT-5.6 Luna/max worker，并由一个共享 Luna/high Operations Leader 跟踪运行状态、压缩较大的结果。

> 当前版本：**`0.5.2`**。1.0 之前公共接口仍可能调整。

Heliolune 是 **Sicheng Gu** 的个人开源项目，与 OpenAI 无隶属或背书关系。

## 它解决什么问题

便宜 worker 并不天然省钱。如果昂贵的 controller 不断轮询、重复读取探索记录、启动冷验收 session，或者接收过大的 transcript，Sol 的输入成本会吞掉 Luna 的价格优势。Heliolune 将工作封装为“启动一次、等待一次”的 MCP 边界：

```text
Sol controller / governor
  |  objective + acceptance + narrow scope + budget
  v
Heliolune MCP（启动一次、等待一次，Sol 不轮询）
  |-- core / tests / integration owner
  |-- optional verifier
  |-- adaptive operations leader
  v
compact evidence + risks + checks + usage + cost
  |
  v
Sol review and final acceptance
```

## 当前能力

- `core`、`tests`、`integration` 三个 owner lane，以及独立只读 `verifier`。
- worker 使用 Luna/max；共享 Operations Leader 默认使用 Luna/high，可选 xhigh。
- session 使用 `ephemeral=true`，通常不会出现在 Codex Desktop 普通任务列表中。
- 同一功能持续复用固定 lane，提高 prompt/cache 命中率。
- 一次异步启动加一次阻塞等待替代 Sol 轮询；终态返回前 Sol 停止生成。
- owner/verifier 使用受限 JSON schema，返回 evidence、changes、checks、risks 与 `needsSol`。
- 60 秒以上任务默认在原硬截止内预留 40–90 秒；活跃 turn 通过 app-server `turn/steer` 原位停止探索并输出结构化结果。
- `reporting=auto`：小型低风险结果直接返回；大结果、verifier、高风险、保留边界或 `needsSol` 才唤醒 Leader 压缩。
- 未唤醒 Leader 的小任务只追加有上限的 lifecycle digest；Leader 下次运行时批量接收 backlog。
- Host 支持 MCP Apps 时使用内联面板，否则在 Windows 自动使用 WPF 悬浮窗；显示五个 lane、各自进度、Luna 提供的自然语言 reasoning summary，以及由历史 benchmark 校准的 Sol-only 费用与节省预测，且不产生额外 Sol token。
- 精确统计 Luna 输入、缓存输入、输出、推理输出、墙钟时间；提供费用估算与 `cost_dashboard`。
- 无第三方 npm 依赖，不复制 Codex 可执行文件，不上传 telemetry 或 worker transcript。

## 信任边界

只有 Sol 可以决定：

- 需求解释与任务拆分；
- 架构与跨组件权衡；
- 安全和信任边界；
- 公共 API 与兼容性；
- 不可逆数据/基础设施迁移；
- 残余风险接受；
- 最终审查、验收和面向用户的回复。

Luna worker 只能在已授权 scope 内选择局部实现细节。Leader 只能基于 MCP 提供的运行元数据和结构化 owner/verifier 结果进行跟踪、存活判断与压缩，不得读取仓库、规划、分配工作或最终验收。

## MCP 工具

| 工具 | 用途 |
|---|---|
| `initialize_pool` | 校验本地 app-server，初始化四个 worker lane 与共享 Leader；真实付费健康 turn 可选。 |
| `start_task` | 启动一个有界任务并选择内联或原生状态界面。 |
| `await_task`（`luna-await`） | 对已启动任务阻塞等待一次，返回紧凑终态结果。 |
| `run_task` | 为能提供标准 MCP progress token 的 host 保留的单调用兼容路径。 |
| `job_status` | 仅供 UI 使用的无 transcript 状态读取；对模型隐藏。 |
| `pool_status` | 不调用模型，返回 lane、prompt 版本、复用次数与最近 usage。 |
| `cost_dashboard` | 不调用模型，返回累计成本、历史校准的 Sol-only 预测、缓存与分 lane 统计。 |

## Codex 中可见的工作状态

Codex Desktop 使用 `start_task` 后立即调用一次 `luna-await.await_task`，Sol 在该调用上停止生成；模型不得轮询 `job_status` 或 `pool_status`。独立等待服务器让状态服务器在阻塞期间保持可读，不会创建新的模型 session 或 controller turn。

Codex CLI `0.146.0` 不会给模型发起的 MCP 调用附加 `_meta.progressToken`，也没有声明 MCP Apps UI 扩展，因此 0.5.2 在 Windows 自动启动 WPF 悬浮窗。窗口根据系统用户语言自动切换英语/简体中文，显示 `core`、`tests`、`integration`、`verifier`、`supervisor` 的状态和进度；终态 token 用量到达后，还会显示 Luna 实际估算费用、历史 profile 预计的 Sol-only 费用和预估节省，并在完成 15 秒后关闭。`HELIOLUNE_STATUS_WINDOW=off` 可关闭，`on` 可强制启用。未来 host 若声明 `io.modelcontextprotocol/ui`，只使用内联面板，不启动悬浮窗。

自然语言工作说明来自活动 Luna turn 已经生成的官方 `reasoning/summaryTextDelta`，不会为“解说”额外唤醒模型。Heliolune 不显示 raw reasoning、命令输出或完整 worker transcript。其他能提供 progress token 的 host 仍可使用单次阻塞 `run_task` 和标准 `notifications/progress`。

## 环境要求

- 当前完整测试：Windows 10/11。
- 支持 plugin 与 MCP 的 Codex。
- `PATH` 上存在独立官方 Codex CLI，并支持 `app-server` 与 `gpt-5.6-luna`。
- Node.js 20+；CI 使用 Node.js 22。
- Git（发布打包使用）。
- 发布脚本兼容 Windows PowerShell 5.1 与 PowerShell 7。

## 从 checkout 安装

```powershell
codex plugin marketplace add D:\code\heliolune
codex plugin add luna-pool-orchestrator@heliolune
```

如果 checkout 不在该路径，请替换为实际目录。安装/更新后必须新建一个 Codex 任务，才能加载新的 Skill 与 MCP 进程。

## 首次使用

先做不调用 Luna turn 的健康检查：

```text
Use $luna-pool-orchestrator for this repository.
Initialize the pool with healthTurn=false. Do not modify code.
```

然后提交有界任务：

```text
Use $luna-pool-orchestrator.
Have the appropriate Luna/max lane fix the failing parser tests.
Limit scope to src/parser and tests/parser, run focused tests,
and let Sol review and accept the final result.
```

优质任务应有明确 outcome、1–8 条可测试 acceptance、尽可能窄的文件/目录 scope，以及合理的文件/命令预算。不要把完整源码、旧 transcript 或通用项目背景粘贴给 worker；Luna 会直接读取仓库。

## 路由与收尾

- `core`：核心生产代码。
- `tests`：测试、fixture、回归和失败诊断。
- `integration`：构建、依赖、配置、CLI 与跨组件集成。
- `verifier`：独立只读验证，不作为实现 owner。
- `supervisor`：兼容 lane 名；实际职责为 Operations Leader。

默认使用 `verification=auto`、`finalization=auto`、`reporting=auto`。活跃 worker 超过工作预算时，MCP 在同一 turn 内发送 `FINALIZE_NOW`，不延长硬截止；worker 可以诚实返回 `partial`。若已完成 turn 只是不符合 JSON，才启用同一 warm thread 的一次 no-tools fallback turn。

## 费用

默认费率为用户提供的每百万 token 价格单位：

| 模型 | 普通输入 | 缓存输入 | 输出 |
|---|---:|---:|---:|
| GPT-5.6 Sol | 125 | 12.5 | 750 |
| GPT-5.6 Terra | 50 | 5 | 300 |
| GPT-5.6 Luna | 5 | 0.5 | 30 |
| GPT-5.5 | 125 | 12.5 | 750 |
| GPT-5.4 | 62.5 | 6.25 | 375 |
| GPT-5.4 Mini | 18.75 | 1.875 | 113 |
| GPT-5.3-Codex | 43.75 | 4.375 | 350 |

```text
uncached_input = input_tokens - cached_input_tokens
estimated_cost = uncached_input / 1M * input_rate
               + cached_input / 1M * cached_rate
               + output_tokens / 1M * output_rate
```

`reasoning_output_tokens` 已包含在输出 token 中，不重复计费。界面中的节省估算不会把同一批 Luna token 直接套用 Sol 单价，而是用保留的同质量 alpha 配对 benchmark（Sol-only `3,702`、Heliolune `902.32` 归一化单位）缩放当前 Luna worker 费用；当前对应 `4.102757x` 的 Sol-only 预测和 `75.63%` 的方向性节省。MCP 看不到当前 Sol controller 的 token，因此它不是账单或端到端实测。raw JSON 仍保留 same-token 字段，只用于价格敏感性分析。可通过 `HELIOLUNE_PRICING_JSON` 覆盖价格表。

## 开发与验证

Windows PowerShell 5.1：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-release.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

PowerShell 7：

```powershell
pwsh -NoProfile -File .\scripts\validate-release.ps1
pwsh -NoProfile -File .\scripts\package-release.ps1
```

打包脚本要求 clean `main`，使用 `git archive HEAD` 生成 `dist/heliolune-<version>.zip` 与 SHA-256 文件，未跟踪文件和本地缓存不会进入发布包。

## 常见问题

### Luna 不可用

确认 `CODEX_APP_SERVER_EXECUTABLE`、`CODEX_EXECUTABLE`、`CODEX_CLI_PATH` 或 `PATH` 指向支持 Luna 的独立官方 CLI。WindowsApps 中的 Desktop 二进制可能无法被子进程直接执行。

### Leader 进度不可见

安装 0.5.2 后新建 Codex 任务。Codex CLI 0.146.0 上，`start_task` 应返回 `display.mode=native-window`；窗口只有实际渲染后才写入本地 `*.window.json` ready 标记。若未显示，可查看相邻的 `*.window-error.log`。未来 host 声明 MCP Apps 后会改用内联面板，不再启动悬浮窗。

### worker 出现在 Desktop 任务列表

确认当前版本使用 `ephemeral=true`。MCP 重启会创建新的隐藏 pool。

### benchmark 没有节省

确认两个 arm 使用相同 repo state、scope、acceptance、schema 与匹配 warmup。不要为 Luna 结果创建新的冷 Sol 验收 session。小任务默认应由 `reporting=auto` 跳过 Leader model turn。

## 文档

- [架构](docs/ARCHITECTURE.zh-CN.md)
- [Benchmark 方法与结果](docs/BENCHMARKS.zh-CN.md)
- [更新日志](CHANGELOG.zh-CN.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)
- [安全策略](SECURITY.zh-CN.md)
- [发布检查单](RELEASE_CHECKLIST.zh-CN.md)

## 路线图

- 抽取 provider-neutral controller/worker adapter 接口。
- 允许配置 controller 与 worker 身份。
- 将固定 lane 转为声明式路由 profile。
- 支持更多 agent host 与 MCP 模型后端。
- 增加跨仓库、可复现的 benchmark fixture。
- 在 1.0 前稳定 MCP contract。

## 许可证

MIT © 2026 Sicheng Gu。参见 [LICENSE](LICENSE)。
