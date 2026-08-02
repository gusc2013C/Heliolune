# Heliolune 与 Codex subagent 对比

[English](HELIOLUNE-VS-CODEX-SUBAGENTS.md) · 简体中文

Heliolune 并不是 Codex subagent 的替代品。它是为 Sol/Luna 工作流定制的成本控制 adapter；原生 subagent 是 Codex 内置的通用多 agent 系统。选择取决于你更看重明确的 worker 经济性与确定性边界，还是原生灵活性。

## 快速对比

| 维度 | Heliolune 0.6 | Codex subagent |
|---|---|---|
| 首要目标 | 尽量减少 Sol context 与费用，同时让 Sol 保持 governor。 | 在 Codex 内提供通用并行委派与角色专门化。 |
| Worker | Luna/max worker、Luna/high 共享 Leader、固定 Sol 治理边界。 | 内置或自定义 agent 可选择受支持的模型、思考强度、工具、sandbox 与指令。 |
| 调度 | `start_task` / `start_batch` 后只阻塞 `await_task` 一次；模型不轮询。 | Codex 原生负责 spawn、follow-up、等待与汇总。 |
| 并行 | 稳定默认 4 路、实验 8 路；一个共享 Leader 管理长任务。 | 原生并发可配置，适合独立探索、测试、triage 与总结。 |
| 主会话 context | 结构化、有界 handoff；大结果先压缩再交给 Sol。 | subagent summary 可隔离探索噪音，但每个 agent 都会独立消耗模型与工具 token。 |
| Cache | token-first 复用功能型 lane 与稳定 prompt；写入 burst 为隔离而使用 fresh session。 | context 与模型设置按 Codex agent/thread 配置；公开 contract 不提供 Heliolune 式 cache 统计。 |
| 可见性 | 隐藏 ephemeral Luna session；一个双语原生悬浮窗显示进度与预计费用。 | 支持的 Codex app、CLI、IDE 会直接显示 subagent activity/thread，可查看或 steer。 |
| 并行读取 | 默认 4 路；窄任务按 contract、边界/测试和风险问题拆分，不因任务小而自动回退。 | 原生能力的典型场景；不需要费用归因时通常更简单。 |
| 并行写入 | detached Git worktree、精确非重叠 scope、clean-HEAD gate、patch 校验、安全合并与 Sol 复核。 | 官方建议谨慎使用 write-heavy 并行，因为冲突和协调开销会上升；Codex Desktop worktree 可隔离 chat 并支持 Handoff。 |
| 费用 | 精确 Luna input/cached/output/reasoning、价格表、dashboard 与历史 benchmark 校准的方向性节省。 | 原生更易用，但每个 subagent 都做独立模型/工具工作，因此通常比单 agent 消耗更多 token。 |
| 部署 | Plugin + MCP + 独立 Codex CLI + Node；当前原生悬浮窗只在 Windows 测试。 | 当前 Codex 版本内置；自定义 agent 使用项目或个人 TOML。 |
| 通用性 | 当前针对 Sol/Luna 与工程仓库优化。 | 支持更广任务、异构 agent、更多原生控制与更少项目假设。 |

## Heliolune 优点

- 明确 cost-first：昂贵的 Sol 只规划一次，随后阻塞，最后读取紧凑结果。
- Luna/max 负责窄而高频的工作；架构、安全、公共 API、迁移、风险、集成审查与验收始终由 Sol 决定。
- token-first 持久 lane 提高 prefix/cache locality；speed-first 可用 4/8 路并行换取速度。
- 共享 Luna/high Leader 管理长 batch，不接管规划，也不唤醒 Sol。
- 并行写入使用确定性 Git gate，不依赖多个 worker 在同一 checkout 中自行协调。
- dashboard 能归因 worker usage，并提供同层委派通常不具备的方向性节省估算。

## Heliolune 缺点

- 组件更多：Plugin、两个 MCP server、app-server 兼容性、独立 CLI、本地状态与版本回归。
- 故意限制灵活性：Luna 不能自行重设架构、扩大 scope 或解决冲突 workstream。
- 原生进度悬浮窗目前是 Windows 实现；其他平台暂时没有该 Heliolune UI。
- 终态 Leader 汇总会增加延迟；4 路只读 smoke 在 worker 完成后约增加 14 秒。
- 并行写要求干净 Git 根目录与精确非重叠 scope；Heliolune worktree 不复制 ignored 本地依赖。
- MCP 看不到当前 Sol 规划/验收 token，因此在同任务 Sol-only 匹配 arm 完成前，节省只能称为方向性估算。

## Codex 原生 subagent 优点

- 生命周期和 UI 原生集成，不需要插件专用 start/await protocol、悬浮窗或 registry。
- 支持的 client 可查看、steer agent；自定义 agent 能分别配置模型、effort、工具、指令和 sandbox。
- 更适合异构团队：不同子任务可使用更强推理、浏览器、文档 MCP 或不同权限。
- Codex 原生负责 spawn、follow-up、等待与汇总，adapter 维护成本更低。
- Codex Desktop worktree 是隔离 chat 的一等能力，并支持安全 Handoff 回本地 checkout。

## Codex 原生 subagent 缺点

- 每个 agent 都执行独立模型与工具工作，因此并行流程比相当的单 agent 运行消耗更多 token。
- 没有专门紧凑 contract 时，verbose summary 或新建冷高价验收 session 会推高 parent 成本。
- write-heavy 并行容易产生冲突和协调开销，仍需要谨慎拆分与集成策略。
- 原生灵活性允许模型、effort、工具和权限随任务变化；如果没有维护 custom agent 与项目规范，跨项目行为也会更不确定。

## 建议

工程任务、Sol 判断必须集中、Luna 价格优势明显、scope 可精确定界且需要 worker 费用可见性时，使用 Heliolune。更看重原生 UX、异构专用 agent、交互 steer、跨平台或更高自主性时，使用 Codex subagent。

两者也可以混合：大量窄 Luna 工作交给 Heliolune，只有真正独立且需要高判断力的审查才使用原生高能力 subagent。不要为了重新验收 Heliolune 结果而新建冷 Sol subagent；应在当前 warm Sol 主 session 内审查。

官方参考：[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md)、[Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees.md)。
