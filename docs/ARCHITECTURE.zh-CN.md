# 架构

[English](ARCHITECTURE.md) · 简体中文

Heliolune 将治理与有界执行分开：

```text
Sol controller / governor
  | objective + acceptance + narrow scope + budget
  v
start-once / await-once MCP orchestration boundary
  |-- function-affine owner
  |-- optional read-only verifier
  |-- adaptive operations leader
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
- **Adapter**：负责 session、turn、steer/interrupt、进度和 usage 的 host/model 适配层。

## 当前 Codex adapter

Sol 管理 `core`、`tests`、`integration` 与 `verifier` 四个 Luna/max lane。第五个兼容名为 `supervisor` 的 Luna/high session 作为 Operations Leader。所有 session 都是 ephemeral，但在 MCP 进程存活期间复用。

Leader 不读取仓库。它只看到紧凑的 liveness snapshot、objective 和结构化 owner/verifier bundle。它可以上报 continue/interrupt、跨 lane lifecycle digest 和压缩结果，但不能规划、分配、决定保留边界或最终验收。

## Finalization

任务总硬截止不会自动延长。60 秒以上任务默认预留 40–90 秒。活跃 work turn 到达预算时，adapter 使用 `turn/steer` 注入 `FINALIZE_NOW`，让同一 Luna/max turn 停止工具并根据已获得证据输出 schema。若完成 turn 的文本不是合法 JSON，才允许同一 warm thread 启动一次 no-tools fallback。

## 自适应 Leader

小型低风险结果直接返回，并将 task id、lane、状态、变更路径、失败检查、风险/升级计数和 verifier 状态追加到最多 12 条的 backlog。大结果、verifier、高风险、保留边界或 `needsSol` 会唤醒 Leader，并携带 backlog。这样既保留跨 lane 跟踪，又不为每个小任务付一轮模型前缀。

## 可见进度边界

Codex Desktop 使用两个 stdio MCP server。`luna-pool.start_task` 创建后台 job 与状态界面后立即返回；`luna-await.await_task` 再阻塞读取原子写入的终态文件。拆分是因为同一 server 的阻塞请求会串行化其他调用；独立 await 能让 app-only 状态路径保持可读，又不增加 Sol turn 或模型 session。

可见界面按 host capability 选择。声明 `extensions["io.modelcontextprotocol/ui"]` 的 host 使用内联 MCP App；未声明该能力的 Windows host 使用系统自带 WSH/Windows PowerShell 启动 WPF 悬浮窗。支持 MCP Apps 时绝不启动原生 fallback，`HELIOLUNE_STATUS_WINDOW=off` 也可手工关闭。原生窗口实际渲染后才写 ready 标记；状态和终态文件原子写入用户本地 Codex 数据目录。

两种界面都固定显示 `core`、`tests`、`integration`、`verifier`、`supervisor`。自然语言说明只采集 Codex `item/reasoning/summaryTextDelta`，它是模型生成的 reasoning summary，而不是 raw reasoning；持久化前会截断。raw reasoning、命令输出、工具结果和完整 worker transcript 不会进入状态界面。Luna 尚未给出 summary 时使用确定性 lifecycle 标签。

能附带 MCP progress token 的 host 也可使用单次阻塞 `run_task`，由同一 watchdog snapshot 发送单调、限频的标准 `notifications/progress`。Codex CLI 0.146.0 的模型 MCP 调用没有该 token，也没有声明 MCP Apps，所以选择 Windows 原生路径。

## 保留决策

架构、安全/信任边界、公共 API/兼容性、不可逆迁移、残余风险接受和最终验收始终属于 Sol。Luna 只能在已批准 objective/scope 中做局部、可逆实现决策。

## Usage 与费用

registry 保存原始 usage 和计数，不保存 transcript。价格在读取 dashboard 时计算，因此价格更新不会改写历史 token。推理输出是输出 token 子集，不重复计费。可见的 Sol-only 预测使用保留的同质量 alpha benchmark 比率（`3,702 / 902.32`）缩放当前 Luna worker 费用；由于 MCP 看不到当前 Sol 规划与验收用量，这只是方向性估算。raw JSON 的 same-token 重定价仅作为次要的价格敏感性数据保留。

## 通用化方向

未来将 app-server 实现抽象为 provider-neutral adapter，允许配置 controller/worker 身份和声明式 lane profile；紧凑 MCP contract 与 controller-owned trust boundary 保持不变。
