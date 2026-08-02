# Heliolune

[English](README.md) · 简体中文

**高智力监督，低成本执行。**

Heliolune 是一个处于 0.x 阶段的模型编排项目：高能力 controller 负责理解、规划、架构、风险、审查与验收，低成本 worker 在紧凑、阻塞式 MCP 边界后完成有明确 scope 的工程任务。第一个可用适配器面向 Codex，由 GPT-5.6 Sol 管理持久 token-first Luna/max lane，或带 detached-worktree 写隔离的 4/8 路 speed-first worker。

> 当前发布版本：**`0.6.0`**。1.0 之前公共接口仍可能调整。

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
- token-first 使用一个持久功能型 owner；speed-first 使用默认 4 路、实验 8 路的 Luna/max burst worker。
- worker 使用 Luna/max；共享 Operations Leader 默认使用 Luna/high，可选 xhigh。
- session 使用 `ephemeral=true`，通常不会出现在 Codex Desktop 普通任务列表中。
- 同一功能持续复用固定 lane，提高 prompt/cache 命中率。
- 一次异步启动加一次阻塞等待替代 Sol 轮询；终态返回前 Sol 停止生成。
- owner/verifier 使用受限 JSON schema，返回 evidence、changes、checks、risks 与 `needsSol`。
- 60 秒以上任务默认在原硬截止内预留 40–90 秒；活跃 turn 通过 app-server `turn/steer` 原位停止探索并输出结构化结果。
- 自动报告路由：小型低风险结果直接返回；大结果、verifier、高风险、保留边界或 `needsSol` 才唤醒 Leader 压缩。
- 未唤醒 Leader 的小任务只追加有上限的 lifecycle digest；Leader 下次运行时批量接收 backlog。
- Windows 只使用一个原生 WPF 悬浮窗，动态显示所有持久或 4/8 路 burst lane、Luna 自然语言 reasoning summary，以及历史 benchmark 校准的 Sol-only 费用与节省预测，不产生额外 Sol token。
- speed-first 长任务到达各自 90 秒规模检查点时，由一个共享 Luna/high Leader session 合并管理当前活跃 worker；后续排队批次仍复用该 warm session，终态也由它压缩。90 秒不是硬上限。
- 并行实现和修复使用 fresh Luna session 与 detached Git worktree；只有 clean HEAD、全部完成、scope、路径重叠和 Git apply gate 全部通过，patch 才进入主工作树。
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
| `initialize_pool` | 校验本地 app-server，初始化所选 token-first / speed-first lane 与共享 Leader；真实付费健康 turn 可选。 |
| `start_task` | 启动一个有界 token-first 任务并显示原生状态。 |
| `start_batch` | 用 4 或 8 个 Luna/max worker 启动 2–8 个独立分析、实现或修复 workstream；写入由 worktree 隔离。 |
| `await_task`（`luna-await`） | 对已启动任务阻塞等待一次，返回紧凑终态结果。 |
| `pool_status` | 不调用模型，返回 lane、prompt 版本、复用次数与最近 usage。 |
| `cost_dashboard` | 不调用模型，返回累计成本、历史校准的 Sol-only 预测、缓存与分 lane 统计。 |

## Codex 中可见的工作状态

Codex Desktop 使用 `start_task` 或 `start_batch` 后立即调用一次 `luna-await.await_task`，Sol 在该调用上停止生成；模型不得轮询 `pool_status` 或读取本地 job 文件。独立等待服务器让原生窗口在阻塞期间持续读取状态，不会创建新的模型 session 或 controller turn。

Heliolune 在 Windows 自动启动一个 WPF 悬浮窗，不再同时提供内联 task 面板。窗口根据系统用户语言自动切换英语/简体中文，动态显示 token-first 或 4/8 路 burst worker 与共享 Leader；终态 token 用量到达后，还会显示 Luna 实际估算费用、历史 profile 预计的 Sol-only 费用和预估节省，并在完成 15 秒后关闭。`HELIOLUNE_STATUS_WINDOW=off` 可关闭，`on` 可强制启用。

自然语言工作说明来自活动 Luna turn 已经生成的官方 `reasoning/summaryTextDelta`，不会为“解说”额外唤醒模型。Heliolune 不显示 raw reasoning、命令输出或完整 worker transcript。Host 若提供 progress token，start 调用仍可发送标准 `notifications/progress`。

## 环境要求

- 当前完整测试：Windows 10/11。
- 支持 plugin 与 MCP 的 Codex。
- `PATH` 上存在独立官方 Codex CLI，并支持 `app-server` 与 `gpt-5.6-luna`。
- Node.js 20+；CI 使用 Node.js 22。
- Git（发布打包使用）。
- 发布脚本兼容 Windows PowerShell 5.1 与 PowerShell 7。

## 从 checkout 安装

```powershell
codex plugin marketplace add "C:\path\to\heliolune"
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

对于可以拆开的工作，让 Sol 选择 speed-first：

```text
使用 $luna-pool-orchestrator 的 speed-first 档位。
由 Sol 定义互相独立的 workstream，默认使用 4 个 Luna/max worker，
由共享 Leader 管理长任务，只 await 一次，最后由 Sol 审查。
优先将每个 workstream 缩到 90 秒内，但不要把 90 秒当作硬上限。
```

并行写入要求干净 Git 根目录与精确非重叠 scope：

```text
使用 $luna-pool-orchestrator 的 speed-first 档位。
由 Sol 定义两个文件 scope 不重叠的独立实现 workstream。
默认使用 4 个 Luna/max worker、detached worktree 隔离和确定性安全集成。
await 一次后，由 Sol 检查 integration.applied、审查主工作树 diff、运行聚焦测试并最终验收。
```

优质任务应有明确 outcome、1–8 条可测试 acceptance、尽可能窄的文件/目录 scope，以及合理的文件/命令预算。不要把完整源码、旧 transcript 或通用项目背景粘贴给 worker；Luna 会直接读取仓库。

## 路由与收尾

- `core`：核心生产代码。
- `tests`：测试、fixture、回归和失败诊断。
- `integration`：构建、依赖、配置、CLI 与跨组件集成。
- `verifier`：独立只读验证，不作为实现 owner。
- `supervisor`：兼容 lane 名；实际职责为 Operations Leader。

公开接口保留 `verification=auto`，finalization 与报告路由则由 0.6 内部自动管理。活跃 worker 超过工作预算时，MCP 在同一 turn 内发送 `FINALIZE_NOW`，不延长硬截止；worker 可以诚实返回 `partial`。若已完成 turn 只是不符合 JSON，才启用同一 warm thread 的一次 no-tools fallback turn。

dirty 仓库、scope 重叠或有依赖的修改，以及小任务继续使用 token-first。Sol 能定义至少两个独立 workstream 时，条件默认 4 路 speed-first：本地只读冷等价费用与串行相当，平均墙钟约加速 3.8 倍。8 路因长尾方差较大，必须显式选择。

并行 workstream 优先缩到 90 秒内，但独立硬截止允许最长 600 秒。到各自检查点时，共享 Luna/high Leader session 会合并同时发生的请求，读取当前活跃 session 的紧凑 snapshot，并可建议 continue/interrupt；后续排队波次可在同一 warm session 上再进行一次有界检查，不做轮询。Leader 不得规划、重分配 scope 或验收 batch。单个长尾或失败不会丢弃已完成的兄弟 workstream。

mutating batch 要求 `cwd` 是干净 Git 根目录；scope 必须是窄、仓库相对、非重叠且不含 glob/父目录跳转的路径。每个写 worker 在已验证 `HEAD` 的 fresh detached worktree 中启动。Heliolune 捕获 tracked、删除、rename、binary 与 untracked 变更，校验实际路径，全部 gate 通过后统一应用 patch、保持 index 未 staged，并清理临时 worktree。若 gate 失败，主 checkout 不变，结果返回本地 patch artifact 给 Sol；不得盲目应用。

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

安装后新建 Codex 任务。`start_task` 与 `start_batch` 应返回 `display.mode=native-window`；窗口只有实际渲染后才写入本地 `*.window.json` ready 标记。若未显示，可查看相邻的 `*.window-error.log`。`HELIOLUNE_STATUS_WINDOW=off` 会关闭悬浮窗。

### worker 出现在 Desktop 任务列表

确认当前版本使用 `ephemeral=true`。MCP 重启会创建新的隐藏 pool。

### benchmark 没有节省

确认两个 arm 使用相同 repo state、scope、acceptance、schema 与匹配 warmup。不要为 Luna 结果创建新的冷 Sol 验收 session。自动报告路由应让小任务跳过 Leader model turn。

## 文档

- [架构](docs/ARCHITECTURE.zh-CN.md)
- [0.6 Token / 并行工程报告](docs/0.6-RESEARCH.zh-CN.md)
- [Heliolune 与 Codex subagent 对比](docs/HELIOLUNE-VS-CODEX-SUBAGENTS.zh-CN.md)
- [Benchmark 方法与结果](docs/BENCHMARKS.zh-CN.md)
- [更新日志](CHANGELOG.zh-CN.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)
- [安全策略](SECURITY.zh-CN.md)
- [发布检查单](RELEASE_CHECKLIST.zh-CN.md)

## 路线图

- 抽取 provider-neutral controller/worker adapter 接口。
- 允许配置 controller 与 worker 身份。
- 稳定声明式 token-first / speed-first 路由 profile。
- 为隔离写 worktree 增加可选、确定性的依赖 setup hook。
- 支持更多 agent host 与 MCP 模型后端。
- 增加跨仓库、可复现的 benchmark fixture。
- 在 1.0 前稳定 MCP contract。

## 许可证

MIT © 2026 Sicheng Gu。参见 [LICENSE](LICENSE)。
