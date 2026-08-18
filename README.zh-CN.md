# Heliolune


[English](README.md) · 简体中文

**高智力监督，低成本执行。**

Heliolune 是一个处于 0.x 阶段的模型编排项目：高能力 controller 负责理解、架构、风险与验收，低成本 worker 完成有明确 scope 的工程任务。当前 Native V2 Codex 插件把一份有界 contract 交给可复用的 Luna/max 工程 owner，普通 terminal I/O 默认走零模型 HelioTerm，并强制由 Sol 独立验收。旧 MCP 适配器继续提供带 detached-worktree 写隔离的 1、2 或 4 路任务 DAG。

> 当前稳定版本：**`0.8.3`**。1.0 之前公共接口仍可能调整。
>
> 0.8.0 token-efficiency 发布说明：[English](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.md) · [简体中文](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.zh-CN.md)

当前发布身份是 Native V2 `heliolune` 插件。旧版 `luna-pool-orchestrator` 仍以 `0.7.0-alpha.2` 作为兼容适配器提供。

Heliolune 是 **Sicheng Gu** 的个人开源项目，与 OpenAI 无隶属或背书关系。

## 它解决什么问题

便宜 worker 并不天然省钱。如果昂贵的 controller 不断轮询、重复读取探索记录、启动冷验收 session，或者接收过大的 transcript，Sol 的输入成本会吞掉 Luna 的价格优势。Native V2 用有界 ownership 与 evidence 控制这部分开销：

```text
Sol controller / governor
  |  validated owner contract + context pack
  v
一个可复用的 Luna/max 工程 owner
  |-- 实现 + 有界修复/证据轮次
  |-- 普通命令默认零模型 HelioTerm
  v
结构化结果 + 实际路径 + 聚焦检查
  |
  v
Sol 独立检查并最终验收
```

## Native V2 当前能力

- 一个持久 Luna/max owner 处理经过验证的精确 scope contract，最多复用三轮：实现、聚焦修复、证据恢复。
- 紧凑 context pack 限制首次发现；公共 schema 对 scope、checks、evidence、残余风险和 objection 设定硬边界。
- 普通 HelioTerm 命令直接执行并保持 `model=0`；只有显式语义 terminal 工作才允许复用 Luna/high terminal leaf。
- 插件安装独立 Desktop agent profiles，并校验真实 model/effort 绑定。
- 持久化 rollout proof 验证真实 role、model、effort、Native V2 backend、父子状态、资源观测、诊断性工具调用数和结果 marker。V2 使用任务专属的显式字节/token lease；工具调用数不再作为 token 或成本代理。
- Sol 独立核对实际修改路径、运行保留检查，并只接受通过确定性 gate 的结果。

Alpha.3 证据见 [Luna 会话复用](docs/0.8.0-ALPHA.3-LUNA-SESSION-REUSE.zh-CN.md)、[HelioTerm direct 优化](docs/0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.zh-CN.md)与[三路径测量](docs/0.8.0-ALPHA.3-HELIOTERM-AB3.zh-CN.md)。

Alpha.4 的有界发现和历史 token audit 见 [alpha.4 token-efficiency 说明](docs/0.8.0-ALPHA.4-TOKEN-EFFICIENCY.zh-CN.md)。稳定版 0.8.0 进一步加入紧凑、去重的 Sol 验收，并以非计费口径记录 validator 与 HelioTerm 的输出节省。

## 旧 pool 兼容能力

- 一个紧凑 `start_task` 自动生成精确 scope owner，以及 contract、边界/测试、正确性风险三路审查。
- 不调用模型的 `runtime_info` 在付费工作前验证精确语义版本、构建 ID、prompt 身份、默认并行度、ephemeral worker、隐藏 app-server 与状态界面；同版本旧 MCP 也会失败关闭。
- `TASK_DAG_V1` 在调用模型前验证依赖、环、READY 状态、read/write lease，以及当前不安全的链式 writer。
- `start_task` 默认采用事件驱动的 adaptive `1→2→4` 扩宽；显式 `throughput` 从满宽开始，旧 `speed-first` 是兼容别名，自定义 1–8 node 图属于高级入口，token-first 保留为安全回退。
- 调度依据 critical depth、显式 priority、路径 affinity 与确定性 tie-break；required node 和显式 quorum 完成后，可取消尚未开始的 optional node。
- post-patch challenge 在不同 worker 槽检查 producer 的精确 candidate checkout，并把结果绑定到 base commit 与 SHA-256 candidate fingerprint；不转发 owner reasoning。
- 每次运行记录 DAG 感知的 `TASK_NODE_V1` 遥测，包括依赖、分配、扩宽、阻断/取消、lease、利用率与关键路径证据。
- worker 使用 Luna/max；共享 Operations Leader 默认使用 Luna/high，可选 xhigh。
- session 使用 `ephemeral=true`，通常不会出现在 Codex Desktop 普通任务列表中。
- standalone Codex app-server 强制隐藏；Windows 自动可见的 worker 界面只有 WPF Leader 悬浮窗。
- 同一功能持续复用固定 lane，提高 prompt/cache 命中率。
- 一次异步启动加一次阻塞等待替代 Sol 轮询；终态返回前 Sol 停止生成。
- owner/verifier 使用受限 JSON schema，返回 evidence、changes、checks、risks 与 `needsSol`。
- worker 使用可续租的存活机制：近期 app-server 活动会继续续租，不存在固定执行截止；持续静默会唤醒共享 Luna/high Leader，连续 4 次检查都无 app-server 活动则触发本地高置信度熔断，卡住的 worker 不能永久续租。
- 自动报告路由：小型低风险结果直接返回；大结果、verifier、高风险、保留边界或 `needsSol` 才唤醒 Leader 压缩。
- 未唤醒 Leader 的小任务只追加有上限的 lifecycle digest；Leader 下次运行时批量接收 backlog。
- Windows 只使用一个原生 WPF 悬浮窗，动态显示所有持久或 4/8 路 burst lane、Luna 自然语言 reasoning summary，以及历史 benchmark 校准的 Sol-only 费用与节省预测，不产生额外 Sol token。
- 90 秒只是拆分目标和首次存活检查点，不是硬上限；自定义 batch 中任一空闲 slot 会立刻领取队列里的下一项，而不等待较慢的兄弟 worker。
- 并行实现和修复使用 fresh Luna session 与 detached Git worktree；只有 clean HEAD、全部完成、scope、路径重叠和 Git apply gate 全部通过，patch 才进入主工作树。
- 精确统计 Luna 输入、缓存输入、输出、推理输出、墙钟时间；提供费用估算与 `cost_dashboard`。
- 通过 shell environment policy 优先使用 Codex bundled Python、Node 与 Git，避免失效虚拟环境 shim，同时保留 host PATH 回退。
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

## 旧 pool MCP 工具

| 工具 | 用途 |
|---|---|
| `runtime_info` | 不调用模型，预检语义/构建/prompt 身份、默认并行度、ephemeral worker、隐藏 app-server 和状态界面。 |
| `start_task` | 默认 adaptive 入口：在 1、2 或 4 个 Luna/max 槽上执行生成的 DAG；`profile=throughput`（或旧 `speed-first`）从四路开始，`profile=token-first` 选择安全回退。 |
| `start_batch` | 高级自定义 `TASK_DAG_V1` 入口：用 1、2、4 或 8 个 Luna/max 槽运行 1–8 个 Sol 定义的 node。 |
| `await_task`（`luna-await`） | 使用 start 返回的 job/build 身份阻塞等待一次，返回紧凑终态结果。 |
| `cost_dashboard` | 不调用模型，返回累计成本、历史校准的 Sol-only 预测、缓存与分 lane 统计。 |

默认 pool server 启用 `runtime_info`、`start_task`、`start_batch` 与 `cost_dashboard`；低频 `initialize_pool` 与 `pool_status` 仍保留但不注入模型工具面。`await_task` 由独立 blocking server 暴露，并要求 start 返回的 `buildId`，防止同版本旧 await server 静默接收新任务。Sol 先调用一次 `runtime_info`，启动一次任务，再且仅再调用一次无 Heliolune 截止时间的 await。Codex 仍要求 MCP transport 使用有限保护值，因此随附配置把单次 await 保护设为 24 小时；host 侧保护到达时不会取消后台 worker，也不构成 Heliolune 执行截止，后续任务仍可恢复终态 job record。

## Codex 中可见的工作状态

Codex Desktop 默认使用 `start_task`，随后立即调用一次 `luna-await.await_task`，Sol 在该调用上停止生成；模型不得轮询状态或读取本地 job 文件。独立等待服务器让原生窗口在阻塞期间持续读取状态，不会创建新的模型 session 或 controller turn。

Heliolune 在 Windows 自动启动一个 WPF 悬浮窗，不再同时提供内联 task 面板。窗口根据系统用户语言自动切换英语/简体中文，动态显示 token-first 或 4/8 路 burst worker 与共享 Leader；终态 token 用量到达后，还会显示 Luna 实际估算费用、历史 profile 预计的 Sol-only 费用和预估节省，并在完成或失败 15 秒后关闭。启动租约过期、owner 心跳陈旧、终态 snapshot 陈旧或 job record 消失也会进入关闭路径。`HELIOLUNE_STATUS_WINDOW=off` 可关闭，`on` 可强制启用。

自然语言工作说明来自活动 Luna turn 已经生成的官方 `reasoning/summaryTextDelta`，不会为“解说”额外唤醒模型。Heliolune 不显示 raw reasoning、命令输出或完整 worker transcript。Host 若提供 progress token，start 调用仍可发送标准 `notifications/progress`。

## 环境要求

- 支持 Native V2 custom agent 且可使用 `gpt-5.6-luna` 的 Codex Desktop。
- Node.js 20+；CI 使用 Node.js 22。
- Git（HelioTerm observation 与发布打包使用）。
- ripgrep（`rg`，HelioTerm search 使用）。
- 发布脚本兼容 Windows PowerShell 5.1 与 PowerShell 7。

旧 pool 适配器还要求 Windows 10/11（当前测试的原生状态界面）、Codex MCP 支持，以及 `PATH` 上支持 `app-server` 的独立官方 Codex CLI。

## 从 checkout 安装

从 checkout 运行安全 bootstrap。除非显式提供 `--write`，脚本只预览写入：

```powershell
node .\scripts\bootstrap-install.mjs --project C:\path\to\your-project --write
```

Bootstrap 会在当前 Codex profile 注册本地 marketplace、安装 `heliolune`、把 standalone profile 复制到目标项目的 `.codex\agents`，并运行紧凑 Native V2 preflight。`--codex-home <隔离目录>` 仅用于 CI 或一次性测试。安装后请启动**新的 Codex task**，让 Codex 加载新 Skill 与 MCP 进程。隔离 source smoke 可额外使用 `--skip-codex`，它仍会安装 profile 并运行 preflight。

直接从 Git marketplace 安装时请显式固定 release tag：

```powershell
codex plugin marketplace add gusc2013C/Heliolune --ref v0.8.3
codex plugin add heliolune@heliolune
```

Git 直装只安装插件，不能把 standalone Native V2 profile 复制到项目中；首次完整安装请使用上面的 checkout bootstrap。

## 首次使用

直接提交有界任务：

```text
使用 $heliolune 完成一个有界工程任务。
普通 terminal 工作保持 direct HelioTerm；由一个 Luna/max owner 实现并运行聚焦检查，
随后由 Sol 独立核对实际路径并运行保留检查。
```

### 旧 pool 兼容适配器

兼容适配器继续保留“启动一次、等待一次”的任务 DAG 路径：

```text
Use $luna-pool-orchestrator.
Use compact start_task to fix the failing parser tests.
Limit scope to src/parser and tests/parser, run focused tests, await once,
and let Sol review and accept the integrated result.
```

默认无需让 Sol 手工拆出四套提示词：

```text
使用 $luna-pool-orchestrator 的 fast start 默认 adaptive DAG 路由。
Sol 只发送一份紧凑 objective、acceptance 和精确 scope；由 MCP 自动生成并调度 owner
与所需的 post-owner challenge node，只 await 一次，最后由 Sol 审查。
优先将每个 workstream 缩到 90 秒内，但不要把 90 秒当作硬上限。
```

并行写入要求干净 Git 根目录与精确非重叠 scope：

```text
使用 $luna-pool-orchestrator 的 throughput 档位。
由 Sol 定义两个文件 scope 不重叠的独立实现 workstream。
默认使用 4 个 Luna/max worker、detached worktree 隔离和确定性安全集成。
await 一次后，由 Sol 检查 integration.applied、审查主工作树 diff、运行聚焦测试并最终验收。
```

优质任务应有明确 outcome、1–8 条可测试 acceptance、尽可能窄的文件/目录 scope，以及合理的文件/命令预算。不要把完整源码、旧 transcript 或通用项目背景粘贴给 worker；Luna 会直接读取仓库。

## 旧 pool 路由与收尾

- `core`：核心生产代码。
- `tests`：测试、fixture、回归和失败诊断。
- `integration`：构建、依赖、配置、CLI 与跨组件集成。
- `verifier`：独立只读验证，不作为实现 owner。
- `supervisor`：兼容 lane 名；实际职责为 Operations Leader。

verification、存活判断与报告路由由内部自动管理。活动 worker 不会因墙钟时间被 steer 或中止；持续静默且 Leader 给出高置信度卡死判断，或连续 4 次检查都没有 app-server 活动时才会 interrupt。完成 turn 若输出非法 JSON，可以在同一 warm thread 使用一次 no-tools schema repair。最后一次修改后仍必须重新取得决定性检查；无法完成时应诚实返回 `partial`。

默认使用 adaptive：低风险且最多两个精确文件的工作使用单 owner；中等有界工作使用 owner 加 post-owner 边界/测试 challenge；宽 scope、目录 scope、高风险或保留边界使用 owner/contract/post-owner 边界/post-owner 正确性图。显式 `throughput` 立即开放四槽，旧 `speed-first` 是其兼容别名；只有写隔离不安全时才回退 token-first。`start_batch` 继续提供显式 1–8 node 自定义图。

分类器和 DAG 调度器都是确定性的，并公开判断信号。启动 worker 前，Heliolune 会拒绝缺失依赖、环、自依赖、无序 read/write 冲突，以及后继无法安全继承未集成 patch 的链式 writer。只有全部 required predecessor 完成，node 才进入 READY。Adaptive 只在 READY 容量或 candidate thread 隔离需要时扩宽；throughput 立即开放请求宽度。终态 `TASK_NODE_V1` 遥测记录实际路由、node 状态、assignment score、宽度变化、排队、阻断/取消、关键路径、利用率与 Leader 占比；controller 与验收侧暂时看不到的指标明确标为 unavailable。

并行 workstream 应优先拆到约 90 秒规模，但 90 秒仅是首次存活检查点。近期 app-server 活动会无模型调用地持续续租；持续静默才由共享 Luna/high Leader 合并读取紧凑 snapshot。模糊判断、Leader 不可用或低/中置信度中止建议会继续续租一次，但连续 4 次检查都无 app-server 活动时本地卡死熔断会打开。调度器使用共享队列，空闲 slot 会立即领取下一项，不等待较慢 worker。Leader 不得规划、重分配 scope 或验收 batch。

mutating batch 要求 `cwd` 是干净 Git 根目录；scope 必须是窄、仓库相对、非重叠且不含 glob/父目录跳转的路径。每个写 worker 在已验证 `HEAD` 的 fresh detached worktree 中启动。Heliolune 捕获 tracked、删除、rename、binary 与 untracked 变更，校验实际路径，全部 gate 通过后统一应用 patch、保持 index 未 staged，并清理临时 worktree。若 gate 失败，主 checkout 不变，结果返回本地 patch artifact 给 Sol；不得盲目应用。

## 旧 pool 费用

0.6.2 确定性代码测试中，Sol-only 与 Heliolune 均达到隐藏测试 12/12；墙钟分别为 123.532 秒与 127.451 秒，Luna worker 实测费用 0.457633 单位。controller 费用边界与启动工具面数据见 [0.6.2 快速启动 benchmark](docs/0.6.2-FAST-START-BENCHMARK.zh-CN.md)。

更大的单臂前端应用测试以 0.450291 Luna worker 费用单位生成了可信的响应式仪表盘，但 writer 完成通知超时，需要确定性恢复补丁。[0.6.2 前端应用 benchmark](docs/0.6.2-FRONTEND-APPLICATION-BENCHMARK.zh-CN.md) 完整记录了视觉/交互验收、旧测试与 lint 失败及可靠性边界，没有把恢复后的结果包装成自动成功。

0.6.3 后端诊断复现了旧串行运行时，修复运行时身份与隐藏窗口 gate，并通过默认 4 路路由安全集成两个 Python 文件。最终运行用时 337.050 秒、Luna worker 费用 0.584154，公开测试 12/12、仓库外隐藏测试 8/8。详见 [0.6.3 运行时诊断](docs/0.6.3-RUNTIME-DIAGNOSTIC.zh-CN.md)；该结果说明费用优先的应用价值，不是与 Sol-only 的速度对照。

0.6.4 可续租存活回归使用 30 秒首次检查点完成了真实 5 workstream / 4 slot Luna 运行。两个 worker 在检查点后自然完成，第一个空闲 slot 在最慢 sibling 结束前领取第五项。详见 [0.6.4 可续租存活验证](docs/0.6.4-RENEWABLE-LIVENESS.zh-CN.md)。

0.7.0 alpha.2 完成了真实 owner→post-patch-challenge 写图：精确 candidate fingerprint、不同槽 clean-room 审查、安全未暂存集成、worktree 清理与 detached runner 退出均通过。四节点 adaptive/throughput 匹配运行观察到 adaptive 墙钟 -27.19%，但估算费用 +25.93%；两条路线都在 0ms 开放同样四槽，且每个 arm 只有一个样本，因此这只能说明模型/输出长尾方差，不能归因于 DAG 加速。详见 [alpha.2 DAG 评估](docs/0.7.0-ALPHA.2.zh-CN.md)、[alpha.1 路由评估](docs/0.7.0-ALPHA.zh-CN.md)与历史 [0.6.5 真实 demo 验证](docs/0.6.5-REAL-DEMO.zh-CN.md)。

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

- [0.7.0 alpha.2 DAG 评估](docs/0.7.0-ALPHA.2.zh-CN.md)
- [0.7.0 alpha.1 路由评估](docs/0.7.0-ALPHA.zh-CN.md)
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
- 稳定声明式 adaptive / throughput / token-first 路由 profile。
- 在不削弱 scope 与 candidate identity 的前提下评估 straggler hedge 与 child-task suggestion。
- 为隔离写 worktree 增加可选、确定性的依赖 setup hook。
- 支持更多 agent host 与 MCP 模型后端。
- 增加跨仓库、可复现的 benchmark fixture。
- 在 1.0 前稳定 MCP contract。

## 许可证

MIT © 2026 Sicheng Gu。参见 [LICENSE](LICENSE)。
