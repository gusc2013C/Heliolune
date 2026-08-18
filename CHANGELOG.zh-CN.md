# 更新日志

[English](CHANGELOG.md) · 简体中文

Heliolune 遵循语义化版本。`0.4.0` 为当前 Git 仓库之前的原型历史，`0.5.0-alpha.1` 是当前仓库保留的第一个提交版本。

## [0.8.4] - 2026-08-18

### 默认使用 V2 owner dispatch

- 所有新的 Luna owner dispatch 必须使用 `HELIOLUNE_OWNER_CONTRACT_V2`，公开紧凑示例也只展示 V2。
- V1 解析及其旧固定上限只保留用于历史 contract 与 rollout 验证；活跃 owner profile 会拒绝使用 V1 执行新实现。

## [0.8.3] - 2026-08-18

### 任务专属资源租约

- 新增 `HELIOLUNE_OWNER_CONTRACT_V2`、`HELIOLUNE_RESOURCE_LEASE_V2` 与 `HELIOLUNE_OWNER_RESULT_V2`，同时保留历史 V1 contract 与 rollout 验证兼容性。
- 移除 V2 的通用工具调用和 edit 调用预算。V2 只接受显式提供的字节/token 资源上限；持久化的工具/edit 调用数仅作为事后诊断，不作为 token 或成本代理。
- 独立报告 `qualityPass` 与 `resourcePass`，真实的资源超限不再否定已经通过质量验收的实现。
- 将旧的五次发现调用、36 次会话调用、六次 edit 和固定输出上限明确限定到 V1 owner 指令。Codex Desktop 当前没有逐调用前置拦截 hook，因此 V2 不宣称实时强制执行。

## [0.8.2] - 2026-08-18

### 依赖 preflight

- Git 或 ripgrep 不可用时 bootstrap preflight 立即失败，不再延迟到首次 HelioTerm observation。
- CI 显式安装 ripgrep，使干净 runner 验证与公开运行要求一致。

## [0.8.1] - 2026-08-18

### 安装与发布加固

- 新增显式 bootstrap 命令：默认只预览写入，CI 可选隔离 `CODEX_HOME`，并安装 Native V2 profile 后运行 preflight。
- 公开 Git marketplace 安装示例固定到 `v0.8.1`，并使用随包 validator 校验最终解压后的 ZIP。
- CI 增加干净临时 clone 的打包 smoke，发布检查不再依赖开发工作树。

## [0.8.0] - 2026-08-18

### 稳定 Native V2 与紧凑 Sol 验收

- 将 Native V2 插件提升为稳定版 `0.8.0+codex.20260818153255`，同时把 alpha.3 与 alpha.4 证据保留为历史记录。
- 新增 `validate-release.ps1 -Compact`：仍完整执行 205 项发布测试，输出流写入临时文件，成功时只输出 65 字节，失败时保留有界的 40 行/8 KiB 诊断尾部。
- 发布打包改用紧凑验证；Sol 必须批量执行互不重复的验收检查，不重跑 owner checks，并优先采用紧凑 HelioTerm evidence。
- 实测 validator 从 18,538 字节降至 65 字节，减少 18,473（99.65%）；HelioTerm 累计压缩 652,453 字节（43.9%），避免 80 个模型边界。
- Rollout counter 仍明确属于非计费诊断证据：观测到的长 Sol 任务输入缓存率为 98.15%，但任务过长与 86.54% 的单调用 wrapper 只作为前瞻优化目标，不声称追溯性节省。
- 已验收的实现 owner 经持久化证明为 `gpt-5.6-luna` / `max`、Native V2，共 9 次工具调用，累计持久化工具输出 18,146 字节。

详见 [稳定版 token-efficiency 发布说明](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.zh-CN.md) 与 [English version](docs/0.8.0-STABLE-TOKEN-EFFICIENCY.md)。

## [0.8.0-alpha.4] - 2026-08-18

- Owner 输出预算现在采用前瞻性边界：read/search 证据上限为 12 KiB/160 行，每个 tool result 上限为 24 KiB，累计 tool output 上限为 192 KiB，并使用紧凑 verification 输出；不宣称追溯性节省。

### 有界发现与 token 效率证据

- 将 Native V2 manifest 更新为 `0.8.0-alpha.4+codex.20260818140328`，并保留 alpha.3 文档作为历史发布证据。
- 固定 1..4 `readFirst`/anchor-first 有界切片 gate：一次跨所有路径的定向 anchor 查询消耗首个发现调用，之后最多读取四个有界切片。
- 在隐私安全的诊断 JSON audit 中记录聚合 rollout counter 与 HelioTerm A/B 路由事实；这些计数明确不是 billing token，不包含 prompt、命令载荷、环境、stdin、secret、task ID 或 raw tool output。
- 普通 HelioTerm 失败（8.8 KB 单输入与 15.0 KB 批量输入）改走 `model=0` 且 `semanticScore=0`；显式语义请求和真实测试诊断仍走 Luna 且 `semanticScore=3`。
- 记录 single-Luna repair 对比：当前单轮 repair 为 3,724,754 个诊断 token，之前双轮为 4,347,302，减少 622,548（14.32%）。

详见 [alpha.4 token-efficiency 发布说明](docs/0.8.0-ALPHA.4-TOKEN-EFFICIENCY.zh-CN.md) 与 [English version](docs/0.8.0-ALPHA.4-TOKEN-EFFICIENCY.md)。

## [0.8.0-alpha.3] - 2026-08-17

### Native V2 owner 与有界 terminal I/O

- 将 Native V2 `heliolune` 插件设为当前发布身份，提供可复用 Luna owner、有界 follow-up、结构化 evidence 与独立 Sol 验收。
- 保留旧 `luna-pool-orchestrator` 插件及其 0.7.0-alpha.2 runtime 身份，作为经过验证的兼容适配器。
- 默认提供确定性的 direct HelioTerm 执行路径，并保留显式、有界的模型 terminal 回退与安装/证明所需的 Native V2 agent profile。
- 为 alpha.3 会话复用和 HelioTerm 测量记录补齐英文版本与语言链接。详见 [`Luna 会话复用`](docs/0.8.0-ALPHA.3-LUNA-SESSION-REUSE.zh-CN.md)、[`HelioTerm 直连优化`](docs/0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.zh-CN.md) 与 [`HelioTerm 三路实测`](docs/0.8.0-ALPHA.3-HELIOTERM-AB3.zh-CN.md)。

## [0.7.0-alpha.2] - 2026-08-03

### 可执行任务图

- 将 task node 从纯遥测记录提升为经过验证的 `TASK_DAG_V1` 执行，加入依赖、缺失节点、环、自依赖、READY 状态与失败传播语义。
- 加入 read/write lease，无序冲突会在调用模型前失败。Alpha.2 拒绝链式 writer，因为后继 worktree 目前无法真实继承尚未集成的前驱 patch。
- 加入事件驱动 adaptive `1 → 2 → 4` 扩宽、显式满宽 `throughput`（`speed-first` 保留为旧别名）、确定性 critical-depth/priority/path-affinity 分配，以及 required node 与显式 quorum 完成后的 optional 排队节点取消。
- post-patch challenge 绑定 producer 的精确 detached worktree、base commit 和 SHA-256 candidate fingerprint；强制使用不同 worker 槽、不转发 owner reasoning，并在 review 期间 candidate 改变时失败。
- `TASK_NODE_V1` 新增图依赖、lease、assignment、宽度变化、阻断/取消、fingerprint 与 DAG 关键路径遥测。

### 验证与测量边界

- 新增 8 项图调度回归（包括备用槽繁忙时的 challenge gate 与 worker-blocked 传播）、clean-room 依赖证据、DAG 感知的 profile/telemetry/worktree/MCP 检查，以及真实 candidate-bound 写入 harness；throughput 运行时与声明的 1/2/4/8 schema 已对齐。打包前 candidate suite 通过 121 项无依赖测试。
- 最终源码的真实 Luna/max `owner → challenge` 在 371.676 秒完成：不同槽 clean-room review、稳定 candidate fingerprint、安全未暂存集成、临时 worktree 完整清理与 detached runner 退出均通过。本次 challenge 为 337.349 秒，而此前修正后运行为 140.129 秒；两者作为明确的质量/延迟与长尾证据保留。
- 运行一次宽任务 adaptive/throughput 匹配对照。Adaptive 观察到墙钟 -27.19%、估算费用 +25.93%；两条路线都在 0ms 开放相同四槽，因此只作为 `n=1` 模型/输出方差报告，不声称 DAG 因果加速。
- cachebuster 重装后的全新 Codex app-server smoke 通过：精确 version/build/prompt/DAG 身份、真实 adaptive Luna/max turn、独立 await、简体中文原生窗口自动关闭，以及 detached runner/app-server 进程树退出均已验证。
- 延后 child-task suggestion、speculative straggler hedge、Terra counsel、学习型路由及 p50/p95 结论。详见 [`docs/0.7.0-ALPHA.2.zh-CN.md`](docs/0.7.0-ALPHA.2.zh-CN.md)。

## [0.7.0-alpha.1] - 2026-08-03

### 自适应路由与可观测决策

- 将 `adaptive` 设为 `start_task` 默认 profile，根据风险、scope、acceptance 与保留边界信号确定性选择 1、2 或 4 路 Luna/max。保留显式四路 `speed-first`、高级自定义 batch 与 token-first 安全回退。
- speed-first 增加不参与执行的 adaptive shadow 决策；新增带版本的 `TASK_NODE_V1` 遥测，记录实际/shadow 路由、node 状态、排队、关键路径、利用率与 Leader 占比。MCP 边界外指标明确标为 unavailable。
- 已完成、低风险的单/双路结果可以直接返回；高风险、partial、升级、不安全集成和四路汇总继续使用 Leader。
- detached-worktree 安全 gate 与共享队列扩展到自适应单/双路写入计划。

### 评估

- 新增分类边界、1/2/4 调度、直接返回、遥测、数字 slot 与单 writer safe-apply 回归。
- 真实运行匹配 Luna/max arm：窄任务 adaptive 单路相对 0.6.5 四路墙钟降低 29.88%、估算费用降低 86.18%；中等双路估算费用降低 36.97%，但因长尾墙钟增加 3.57%。负结果被完整保留，本版本不作普适加速声明。
- Windows PowerShell 5.1 与 PowerShell 7.6.4 下均通过 111/111 发布测试；全新安装态 adaptive 宿主运行通过原生窗口自动关闭和完整进程回收；真实双 writer detached-worktree safe-apply 运行通过。
- 独立宽任务基线在相同质量下显示四路加速 3.176 倍，因此继续保留显式 speed-first。详见 [`docs/0.7.0-ALPHA.zh-CN.md`](docs/0.7.0-ALPHA.zh-CN.md)。

## [0.6.5] - 2026-08-03

### 独立 job owner 与资源回收

- 先持久化 starting record 与 request，再把执行权交给隐藏的 detached runner，不再由短生命周期 MCP stdio 进程持有 job。完整 claim 文档通过独占硬链接原子发布，独立 await server 继续交付终态。
- runner 在 job 终态前保持引用，活动工作期间延后 `SIGINT`/`SIGTERM`，并显式关闭 standalone app-server 进程树。Windows 现在同时等待 `taskkill /T` 与 app-server 自身退出确认；POSIX 等待 `exit`/`close`，仅在有界宽限后强制结束。
- 增加按需 runner 生命周期诊断；全部真实 smoke 都必须等待 runner PID 退出。由此修复完成任务后 app-server 子进程累积、最终诱发随机 orphan 的泄漏。

### 运行时身份与卡死收口

- 在语义版本和 prompt 身份外增加精确构建身份 `0.6.5-owner-heartbeat-r2`。pool 预检、detached request、runner 与 await 必填参数必须一致，因此插件重装后遗留的同版本旧 pool/await MCP 会失败关闭。
- 每 5 秒独立于模型进度持久化 owner 心跳。await 与原生窗口会把 30 秒无 owner 心跳的 running job 转为失败，同时防住 PID 复用与 detached owner 静默卡死。
- 活动 worker 仍可无限续租；但连续 4 次存活检查都没有 app-server 活动时会中断。任一事件都会重置熔断，因此长任务没有固定截止，真正静默的 worker 也不能永久续租。

### 原生状态窗可靠性

- 保留终态后 15 秒自动关闭倒计时，并由 Codex-host smoke 直接验证窗口 PID 自动退出。
- 状态窗用 Windows `ReadWrite|Delete` 共享模式读取 snapshot；原子替换对瞬时 `EPERM`、`EBUSY`、`EACCES` 使用更长且错峰的重试。由窗口或 await 刷新导致终态写入失败的竞态已消除。
- 终态 record 强制覆盖旧 running snapshot；过期启动租约、死亡 owner、陈旧心跳都进入失败终态 UI；job record 持续不可用也会自动关闭。live benchmark 明确 headless，删除临时 job root 不再遗留窗口。
- Git root 先 canonicalize，并在 Windows 下忽略大小写比较，修复 GitHub Actions 因等价 runner 路径表示不同而失败的问题。

### 真实 demo 验证

- 通过已安装 0.6.4 的 `runtime_info` → `start_task` → 独立 `await_task` 复现：四路 demo 约运行 5 分 48 秒后 owner 退出。后续 0.6.5 候选轮次又暴露了完成进程泄漏、claim 非原子发布、POSIX 关闭缺口及 Windows 状态窗读取竞态；每项都先落成聚焦回归，再重启完整矩阵。
- 103 项无依赖自动化测试及 PowerShell 5.1 发布校验全部通过。
- 最终安装态 r2 宿主运行用时 240.018 秒，4/4 Luna/max 完成；pool/await 精确构建身份、中文原生状态、独立 await、窗口自动关闭、runner/app-server 自动退出全部通过。
- 238.658 秒 token-first 生命周期审计无 medium/high/critical 风险；修复其唯一低风险 Windows 退出确认项；随后 5 workstream / 4 slot 排队运行 99.535 秒，8 workstream / 8 slot 运行 94.892 秒，双 writer safe-apply 运行 70.085 秒。
- 将用户报告的卡住窗口复现为 benchmark job `993ad283`：job 与 runner 已终态，但临时状态清理早于窗口读取终态。精确关闭该进程，增加 harness 与窗口回归，最终 pool/await MCP、runner、状态窗及 standalone app-server 残留均为 0。完整证据见 [`docs/0.6.5-REAL-DEMO.zh-CN.md`](docs/0.6.5-REAL-DEMO.zh-CN.md) 与 [`benchmarks/results/0.6.5-real-demo-r1.json`](benchmarks/results/0.6.5-real-demo-r1.json)。

## [0.6.4] - 2026-08-03

### 可续租 worker 存活机制

- 删除固定 worker 执行截止、活动 turn 的 finalization steer、job 过期时间，以及 await server 的 65 分钟截止。活动 worker 现在可以一直运行到自然终态。
- 公共字段从 `timeoutSeconds` 改为 `checkpointSeconds`。它只是首次可续租存活检查，最大为 90 秒拆分目标，绝不限制执行时长。
- 首次检查后每 30 秒重查存活。近期 app-server 活动在本地直接续租，不调用 Leader；持续静默才唤醒共享 Luna/high Leader，且只有高置信度 stall 判断才能 interrupt。模糊、不可用或低/中置信度判断都会继续运行。
- 保留 orphan 保护：只有编排进程退出才把运行中 job 转为失败，不再把墙钟时间当作失败。
- 只在 completed turn 返回非法 JSON 时保留一次同 thread Luna/high schema repair。

### 并行调度与诊断

- 明确并测试共享队列：任一空闲 burst slot 会立即领取下一项，不等待较慢 sibling。Leader 仍不规划或重新分配 scope。
- 当 `turn/completed` 延迟或缺失时，接收权威 `item/completed` final-answer item；失败结果保留紧凑 app-server 活动与 schema repair 诊断。
- 删除会在 Heliolune 之外终止活动源码测试的旧 benchmark harness 截止。
- 从常规 `start_task` schema 删除全部时间字段并缩短工具说明。安装后的 pool 工具面约从 1,447 降到 1,151 schema token（-20.46%）；常规 `runtime_info` + `start_task` 从 643 降到 480（-25.35%），高级 `start_batch` 从 579 降到 447（-22.79%）。
- 只保留 Codex 对单次 await 请求要求的 24 小时 MCP transport 保护；它不是 worker 截止，也不能取消独立运行的后台 job。

### 验证

- 72 项无依赖自动化测试全部通过，覆盖超过固定 completion window 后的续租完成、多轮静默卡死判断、忽略旧 expiry、空闲 slot 队列领取，以及 Leader 对未证实 worker 风险的保守处理。
- 真实 5 workstream / 4 slot Luna/max 在 30 秒首次检查点下用时 64.515 秒。两个 worker 在检查点后自然完成（37.972 秒、48.871 秒），第五项由 `burst-2` 接力；因持续有近期活动，管理 Leader 调用为 0。
- 同一 30 秒检查点下，真实 8 workstream / 8 slot Luna/max 用时 114.065 秒，8/8 全部完成；最慢 worker 为 92.968 秒，没有管理 turn 或时间型中止。因长尾方差，8 路仍保持 opt-in。
- 真实四路只读与双 worker 隔离写 smoke 均完成；写入场景安全应用两个非重叠路径、index 保持干净，并清除临时 worktree。
- 最终默认 `start_task` 真实运行用时 241.912 秒，4/4 Luna/max 全部成功；两个 worker 自然运行 162.639 与 218.899 秒，因活动在本地续租，管理检查仍为 0，也没有时间型中止。
- 记录并收紧该运行中发现的一条 Luna review 幻觉：Leader 汇总现在必须把未证实风险标为候选发现，不得提高严重级别，也不得把 Leader confidence 表述为正确性结论。

## [0.6.3] - 2026-08-02

### 运行时身份与界面

- 增加不调用模型的 `runtime_info` 预检。skill 只有在已加载 MCP 明确报告 0.6.3、默认 4 路 `speed-first`、ephemeral burst thread、隐藏 standalone app-server 和 Windows 原生状态窗时才允许启动付费任务，避免新 skill 误用旧串行 MCP。
- 紧凑 skill 约 1,099 个序列化字符 token，与 0.6.2 的 1,096 基本相同。`runtime_info` 为安装工具面增加约 92 个 schema token，用于避免代价高得多的错误派发和缓存扫描。
- 所有 Luna burst thread 保持 ephemeral，standalone app-server 强制隐藏。Windows 自动可见界面只有 WPF Leader 悬浮窗；Heliolune 不创建 Codex Desktop worker task。
- 通过官方 shell environment policy 优先使用 Codex bundled Python、Node 和 Git，同时保留正常 host PATH 回退，避免失效 Gaia Python launcher 等旧虚拟环境 shim 覆盖可用工具链。

### 并行可靠性

- contract lane 与 owner 并发运行。只有明确 `status=blocked` 且包含真实保留边界 `needsSol` 决策时才能中断 writer；普通歧义和可能的隐藏期望只记为非阻塞风险。
- contract、edges、verify 明确是独立 base snapshot 审查。Leader 不再把它们无法观察并发 owner patch 误报为实现缺失或冲突。
- 总进度提高 mutating owner 权重；未安全完成但非空的 patch 会作为隔离恢复候选返回，真正 incomplete writer 仍不会自动集成。
- 自动收尾从 50%/最多 90 秒改为 40–60 秒，并给原 turn 10–20 秒比例化 steer grace；最后一次修改后必须重新取得决定性检查证据。
- `completed` 以已提供且可运行的 acceptance 为准。不可见 hidden tests 记入风险，不再让已经完成的 worker 永远返回 `partial`。

### 诊断 benchmark

- 增加无依赖 Python 后端 fixture。最终 4 路运行在 337.050 秒内安全集成两个文件，Luna 费用 0.584154，worker 输入缓存率 69.83%，历史校准的 Sol-only 预估节省 75.63%。
- Sol 验收通过公开测试 12/12 与仓库外隐藏测试 8/8。报告保留此前失败轮次，因为每轮分别暴露并推动修复了上述独立编排缺陷。

## [0.6.2] - 2026-08-02

### 快速启动

- 将紧凑 `start_task` 设为常规入口。MCP 根据一份 Sol objective、acceptance 与 scope，确定性生成精确 scope owner，以及 contract、边界/测试、正确性风险三路 Luna/max 审查。
- 热路径 skill 缩小 65.5%，按序列化字符估算从约 3,173 降至 1,096 token。低频 `initialize_pool` 与 `pool_status` 不再默认注入工具面；安装态 pool schema 约 1,192 token，常规 `start_task` schema 约 455 token。
- 增加严格可用性门：当前 Codex 任务若未暴露 `start_task` 或 `await_task`，Sol 立即要求新建任务/重启，不再扫描插件缓存、重复读取 manifest 或手工启动 MCP。

### 可靠性

- 每个 job 持久化编排进程 PID、进程启动时间、心跳与有界过期时间。独立 await server 会把失去 owner 的旧 `running` 记录转为终态失败，不再对静态快照等待最长 65 分钟。
- 原生中英双语悬浮窗可独立发现编排进程退出，将未完成 worker 标为失败，显示恢复建议并正常关闭。
- 短任务默认结构化收尾预留提高到硬截止的 50%（最多 90 秒）。若 Luna/max 在 stop-and-synthesize steer 后 10 秒仍未交付，就中断该 turn，并用剩余预算在同一 session 上执行只读 Luna/high schema 合成。
- 每个 worker 仍有独立硬截止，已完成兄弟结果会保留；活跃长尾可用完声明的截止，但不能让 job 无限等待。
- 只读伴随审查超时不再阻止已安全隔离的 owner patch；只有未完成的 mutating workstream 会阻止确定性集成。

## [0.6.1] - 2026-08-02

### 变更

- 将 4 路 `speed-first` 从“明显可拆任务的条件默认”提升为产品无条件默认路由。
- 小任务和单文件任务使用一个隔离写 owner，配合有意义的只读 contract、边界/测试与正确性风险 workstream；禁止重叠写入和无意义的占位任务。
- `token-first` 仅保留为显式安全回退：mutating checkout dirty/非 Git、写入无法隔离或任务存在严格顺序依赖。
- `initialize_pool`、工具顺序、插件默认提示词和中英文文档全部改为并行优先，避免新 Codex 任务静默选择串行路径。
- 更明确的默认/回退工具说明使完整工具面从约 1,557 增至 1,586 token，但仍比 0.6 之前缩小约 37.1%。

## [0.6.0] - 2026-08-02

### 新增

- 增加由 Sol 选择的 `token-first` 档位，以及 4 路稳定默认 / 8 路实验并发的 `speed-first` Luna/max 档位。
- 增加 `start_batch`：接收 2–8 个由 Sol 定义的独立 workstream，各自拥有硬截止与失败隔离。
- 由一个共享 Luna/high Leader 在 90 秒规模检查点统一管理所有仍活跃的并行 session，随后复用同一 warm Leader 汇总终态。90 秒不是硬上限；有界 workstream 最长可运行 600 秒。
- 原生悬浮窗动态显示 4/8 个 burst worker 与共享 Leader。
- 增加 detached-HEAD Git worktree 隔离，支持并行实现与修复。只有 clean HEAD、精确 scope、全部完成、实际路径无重叠以及 `git apply --check --index` 全部通过，patch 才安全应用到主工作树。
- 确定性集成被阻止时不修改主工作树，并保留本地 patch artifact 交给 Sol 审查。
- 增加基于官方 Codex subagent/worktree 文档的 Heliolune 与原生 subagent 中英文对比。

### 优化

- 只读冷等价费用与串行 benchmark 相当、平均墙钟约加速 3.8 倍，因此对可拆分 workstream 条件默认 4 路并行；8 路因长尾方差保持 opt-in。
- 删除内联 MCP App、仅供 App 的 `job_status`、重复公开的 `run_task` 和低频公开调试字段。按序列化字符估算，包含两档位的完整 0.6 工具面比旧 token-first 工具面缩小约 38.2%。
- 同时接受嵌套 `params.turn.id` 与顶层 `params.turnId` 完成通知，避免 worker 已完成后仍误报 active timeout。
- 在返回 Sol 前压缩 batch usage、费用投影与输出字符串；完整价格假设仍由 `cost_dashboard` 提供。
- mutating worktree 使用 fresh ephemeral Luna session，避免其他 workstream 的 checkout context 从缓存历史泄漏。

### 安全与验证

- 只有 Sol 可以拆分 batch，并决定架构、安全、公共 API、不可逆迁移、风险接受、审查与最终验收；Leader 只管理存活和压缩。
- 真实双 worker 写入 smoke 在 35.541 秒总时间内安全合并两个非重叠文件，Git index 保持干净且临时 worktree 全部移除；Git 安全测试覆盖正常合并、越界拒绝、dirty main 拒绝和 HEAD 变化拒绝。

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
