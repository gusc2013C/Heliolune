# 更新日志

[English](CHANGELOG.md) · 简体中文

Heliolune 遵循语义化版本。`0.4.0` 为当前 Git 仓库之前的原型历史，`0.5.0-alpha.1` 是当前仓库保留的第一个提交版本。

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
