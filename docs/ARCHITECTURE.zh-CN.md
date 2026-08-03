# 架构

[English](ARCHITECTURE.md) · 简体中文

Heliolune 将治理与有界执行分开：

```text
Sol controller / governor
  | objective + acceptance + narrow scope + budget
  v
start-once / await-once MCP orchestration boundary
  |-- adaptive：按任务分类选择 1/2/4 路 worker
  |-- speed-first：显式四路对照；自定义 2–8 路 batch
  |-- token-first：显式安全回退
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
- **Profile**：默认使用自适应 1/2/4 路；宽且独立的任务可显式选择四路 speed-first；持久 token-first 作为安全回退。
- **Adapter**：负责 session、turn、可续租存活判断、进度和 usage 的 host/model 适配层。

## 当前 Codex adapter

Adaptive `start_task` 根据风险、scope、acceptance 与保留边界信号，确定性选择 1、2 或 4 个 Luna/max burst slot；显式 speed-first 使用四路，自定义 batch 支持 2–8 路，token-first 保留 function-affine 持久 lane。只读 burst session 可以复用；mutating workstream 在隔离 Git worktree 中使用 fresh ephemeral session，避免 checkout context 跨 worker 泄漏。兼容名为 `supervisor` 的 Luna/high session 作为共享 Operations Leader。所有 session 都不会显示为普通 Desktop task。

`TASK_NODE_V1` 记录实际路由、可选 shadow 路由、worker node 状态、排队时间、活动墙钟、关键路径、利用率与 Leader 占比。controller usage、最终验收耗时、错误验收、结果采用、重复探索与 route regret 在能被直接观测前一律明确标为 unavailable。

Leader 不读取仓库。它只看到紧凑的 liveness snapshot、objective 和结构化 owner/verifier bundle。近期活动会直接续租，不唤醒 Leader；持续静默时 Leader 可以上报 continue/interrupt，但只有高置信度 stall 判断才能中止。它不能规划、分配、决定保留边界或最终验收。

对 speed-first 而言，90 秒是 workstream 尺寸目标与首次共享管理检查点，不是截止时间。每个 worker 持有可续租 lease；近期活动会无限续租，持续静默才交给共享 Leader。模糊或不可用的判断会继续续租，但连续 4 次检查都无 app-server 活动时，本地高置信度熔断会 interrupt，保证静默卡死最终收口。workstream 来自共享队列，任一空闲 slot 会立刻领取下一项，而不等待长尾 sibling。Leader 不得规划或重新分配；确定性调度器只执行 Sol 已经定义的队列。

## 结构化输出恢复

活动 worker 不会因墙钟时间被 steer 或中止。只有已经完成的 turn 返回非法 JSON 时，才允许同一 warm thread 启动一次 no-tools schema repair。

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

Codex Desktop 使用两个 stdio MCP server。常规路径只调用一次紧凑 `luna-pool.start_task`；pool server 在内部确定性展开四路 workstream，原子写入 starting request，启动 detached job runner，并在创建原生状态界面后返回。runner 独占 claim 完整 request，并持有 standalone app-server 直到终态清理。`luna-await.await_task` 再阻塞读取原子替换的结果文件。拆分 server 与分离所有权可避免 host stdio 生命周期清理误杀活动工作。

运行中记录包含 detached runner PID、进程启动时间和每 5 秒独立刷新一次的心跳，但没有 worker 墙钟过期时间。`luna-await` 在阻塞时验证精确 build 身份与 owner 心跳；若 owner 退出或心跳陈旧 30 秒，就把记录原子转换为失败。原生窗口执行相同检查，并让过期启动、终态 snapshot 陈旧及记录消失都进入关闭倒计时。Windows 读取启用 delete sharing，writer 对瞬时共享冲突错峰重试。终态清理关闭 app-server 进程树、确认退出、删除 claim、释放 runner keepalive，最后让 runner 自行退出。

Codex MCP 配置要求 transport 使用有限保护值，但 Heliolune 内部 await 没有截止。随附 `luna-await` 保护为 24 小时；即使 host 请求本身到达该保护，由独立 owner 持有的后台 job 仍会继续，保护值不会传给 worker，也不会中止其 app-server turn。

Windows 使用系统自带 WSH/Windows PowerShell 启动唯一的 WPF 悬浮窗，不再同时提供内联 task 面板。`HELIOLUNE_STATUS_WINDOW=off` 可手工关闭。原生窗口实际渲染后才写 ready 标记；状态和终态文件原子写入用户本地 Codex 数据目录。

悬浮窗根据当前 job 动态创建卡片，可显示固定 token-first lane 或 4/8 个 burst slot 与 `supervisor`。自然语言说明只采集 Codex `item/reasoning/summaryTextDelta`，它是模型生成的 reasoning summary，而不是 raw reasoning；持久化前会截断。raw reasoning、命令输出、工具结果和完整 worker transcript 不会进入状态界面。Luna 尚未给出 summary 时使用确定性 lifecycle 标签。

能附带 MCP progress token 的 host 还可从 start 调用接收基于同一 watchdog snapshot 的单调、限频标准 `notifications/progress`；模型侧 contract 仍是启动一次、等待一次。

## 保留决策

架构、安全/信任边界、公共 API/兼容性、不可逆迁移、残余风险接受和最终验收始终属于 Sol。Luna 只能在已批准 objective/scope 中做局部、可逆实现决策。

## Usage 与费用

registry 保存原始 usage 和计数，不保存 transcript。价格在读取 dashboard 时计算，因此价格更新不会改写历史 token。推理输出是输出 token 子集，不重复计费。可见的 Sol-only 预测使用保留的同质量 alpha benchmark 比率（`3,702 / 902.32`）缩放当前 Luna worker 费用；由于 MCP 看不到当前 Sol 规划与验收用量，这只是方向性估算。raw JSON 的 same-token 重定价仅作为次要的价格敏感性数据保留。

## 通用化方向

未来将 app-server 实现抽象为 provider-neutral adapter，允许配置 controller/worker 身份，并为隔离 worktree 增加确定性依赖 setup hook；紧凑 MCP contract 与 controller-owned trust boundary 保持不变。
