# 架构

[English](ARCHITECTURE.md) · 简体中文

Heliolune 将治理与有界执行分开：

```text
Sol controller / governor
  | objective + acceptance + narrow scope + budget
  v
start-once / await-once MCP orchestration boundary
  |-- token-first：一个 function-affine owner + optional verifier
  |-- speed-first：4/8 个由 Sol 定义的隔离 burst worker
  |-- one shared operations leader
  v
compact evidence + changes + checks + risks + usage
  |
  v
Sol review and final acceptance
```

## 稳定概念

- **Controller**：理解需求、拆分工作、决定保留事项、审查证据并验收。
- **Worker**：在明确 scope 和预算内探索或实现。
- **Lane**：按功能固定、可复用的 worker context，用于提高 cache locality。
- **Verifier**：风险或关键正确性声明需要时启用的独立只读 worker。
- **Operations Leader**：只根据 MCP 提供的数据跟踪运行、判断存活并压缩上报。
- **Profile**：默认使用 4 路并行 speed-first；持久 token-first 仅作为显式安全回退。
- **Adapter**：负责 session、turn、steer/interrupt、进度和 usage 的 host/model 适配层。

## 当前 Codex adapter

Token-first 使用 `core`、`tests`、`integration` 与 `verifier` 四个持久 Luna/max lane；speed-first 使用默认 4 路或实验 8 路 Luna/max burst slot，且 workstream 必须由 Sol 预先定义。只读 burst session 可以复用；mutating workstream 在隔离 Git worktree 中使用 fresh ephemeral session，避免 checkout context 跨 worker 泄漏。兼容名为 `supervisor` 的 Luna/high session 作为共享 Operations Leader。所有 session 都不会显示为普通 Desktop task。

Leader 不读取仓库。它只看到紧凑的 liveness snapshot、objective 和结构化 owner/verifier bundle。它可以上报 continue/interrupt、跨 lane lifecycle digest 和压缩结果，但不能规划、分配、决定保留边界或最终验收。

对 speed-first 而言，90 秒是 workstream 尺寸目标与共享管理检查点，不是硬上限；每个 worker 的有界硬截止最长可到 600 秒。一个共享 Leader session 将同时到达的检查请求合并成一个 turn，接收当前活跃 slot 的 snapshot，并逐 slot 建议 continue/interrupt。后续排队波次可在同一 warm session 上再执行一次有界 turn，不进行模型轮询。Leader 不得重新分配工作；失败或长尾 slot 不会丢弃已经完成的兄弟结果；终态再复用同一 Leader thread 向 Sol 汇总。

## Finalization

任务总硬截止不会自动延长。60 秒以上任务默认预留 40–90 秒。活跃 work turn 到达预算时，adapter 使用 `turn/steer` 注入 `FINALIZE_NOW`，让同一 Luna/max turn 停止工具并根据已获得证据输出 schema。若完成 turn 的文本不是合法 JSON，才允许同一 warm thread 启动一次 no-tools fallback。

## 自适应 Leader

小型低风险结果直接返回，并将 task id、lane、状态、变更路径、失败检查、风险/升级计数和 verifier 状态追加到最多 12 条的 backlog。大结果、verifier、高风险、保留边界或 `needsSol` 会唤醒 Leader，并携带 backlog。这样既保留跨 lane 跟踪，又不为每个小任务付一轮模型前缀。

## 并行写隔离

Speed-first 实现和修复要求干净 Git 根目录，以及窄、非重叠、仓库相对的 scope。Adapter 解析精确 `HEAD` commit，为每个 workstream 创建原生 detached worktree；不会假设默认分支名是 `main`，也不会复制源码树或 ignored 文件。

每个 worker 只能修改自己的 worktree sandbox。全部 turn 到达终态后，adapter 只在一次性 worktree 内 staging，用于生成 full-index binary patch，从而覆盖 tracked、删除、rename、binary 与 untracked 变更。随后检查：

1. 所有 workstream 都 completed；
2. 每个实际修改路径都位于 Sol 指定 scope；
3. 不同 workstream 没有修改同一路径；
4. 主 checkout 仍是原 `HEAD` 且保持 clean；
5. 完整 patch set 的 indexed `git apply --check` 成功。

只有全部 gate 通过，所有 patch 才统一应用并立即 unstage，交给 Sol 审查。任一 gate 失败时主工作树不变，并保留有界本地 patch artifact；临时 worktree 通过 Git 删除并 prune。该确定性策略只是执行 Sol 给出的拆分，不替代 Sol 的 diff 审查、聚焦测试、风险判断与最终验收。

## 可见进度边界

Codex Desktop 使用两个 stdio MCP server。`luna-pool.start_task` 或 `luna-pool.start_batch` 创建后台 job 与原生状态界面后立即返回；`luna-await.await_task` 再阻塞读取原子写入的终态文件。拆分是因为同一 server 的阻塞请求会串行化其他调用；原生窗口可继续读取本地 snapshot，又不增加 Sol turn 或模型 session。

Windows 使用系统自带 WSH/Windows PowerShell 启动唯一的 WPF 悬浮窗，不再同时提供内联 task 面板。`HELIOLUNE_STATUS_WINDOW=off` 可手工关闭。原生窗口实际渲染后才写 ready 标记；状态和终态文件原子写入用户本地 Codex 数据目录。

悬浮窗根据当前 job 动态创建卡片，可显示固定 token-first lane 或 4/8 个 burst slot 与 `supervisor`。自然语言说明只采集 Codex `item/reasoning/summaryTextDelta`，它是模型生成的 reasoning summary，而不是 raw reasoning；持久化前会截断。raw reasoning、命令输出、工具结果和完整 worker transcript 不会进入状态界面。Luna 尚未给出 summary 时使用确定性 lifecycle 标签。

能附带 MCP progress token 的 host 还可从 start 调用接收基于同一 watchdog snapshot 的单调、限频标准 `notifications/progress`；模型侧 contract 仍是启动一次、等待一次。

## 保留决策

架构、安全/信任边界、公共 API/兼容性、不可逆迁移、残余风险接受和最终验收始终属于 Sol。Luna 只能在已批准 objective/scope 中做局部、可逆实现决策。

## Usage 与费用

registry 保存原始 usage 和计数，不保存 transcript。价格在读取 dashboard 时计算，因此价格更新不会改写历史 token。推理输出是输出 token 子集，不重复计费。可见的 Sol-only 预测使用保留的同质量 alpha benchmark 比率（`3,702 / 902.32`）缩放当前 Luna worker 费用；由于 MCP 看不到当前 Sol 规划与验收用量，这只是方向性估算。raw JSON 的 same-token 重定价仅作为次要的价格敏感性数据保留。

## 通用化方向

未来将 app-server 实现抽象为 provider-neutral adapter，允许配置 controller/worker 身份，并为隔离 worktree 增加确定性依赖 setup hook；紧凑 MCP contract 与 controller-owned trust boundary 保持不变。
