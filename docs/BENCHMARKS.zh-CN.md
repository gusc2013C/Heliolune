# Benchmark 方法

[English](BENCHMARKS.md) · 简体中文

Heliolune 优化的是 controller 成本，同时不能牺牲验收质量。因此有效比较必须同时报告质量、usage、缓存、费用估算与墙钟时间。

## 规则

- 两个 arm 使用相同 repo state、objective、scope、acceptance 和 response schema。
- 匹配 warmup；warmup 单独列为 measurement overhead。
- Sol 在当前 warm 主 session 内验收，不为验收新建冷 Sol session。
- 报告 input、cached input、output、reasoning output、cache rate，以及 planning/execution/acceptance 时间。
- 未获得实际账单时，价格加权数字必须标为估算。

## 0.5.0 参考

| 测试 | 结果 |
|---|---:|
| 匹配质量 | Sol-only 10/10；Sol+Luna 10/10 |
| 25:1 归一化费用 | 3,702 vs 902.32；估算节省 75.6% |
| 墙钟 | Sol+Luna 慢 23.2% |
| 同 lane warm 复用 | 24.113s → 10.709s，约 2.25x |
| warm worker cache | 94.65% |
| verifier 优化 | 272.947s → 100.069s，快约 63.3% |
| 30s timeout | 30.317s |

## alpha.1 timeout 诊断

可见 dashboard 和悬浮窗使用保留的同质量 alpha 比率：`3,702 / 902.32 = 4.102757x`。当前 Luna worker 估算费用按该比率外推 Sol-only 工作量费用，得到 `75.63%` 的方向性节省。由于 MCP 看不到当前 controller token，这不是当前 matched arm；raw JSON 的 same-token 重定价只用于价格敏感性分析。正式端到端结论仍必须重新执行匹配的两组测试。

两次强制 timeout 累计 101,698 input、59,904 cached、491 output；Luna 估算 `0.253652`，同 token Sol `6.3413`。90 秒样本最后一个事件是 token usage 更新，静默 1ms，证明 Luna/max 仍活跃而非卡死，但未及时输出 JSON。

## alpha.2 reserved finalization

alpha.1 的两文件、8 命令、120 秒分析以 `hard_timeout_active` 失败。alpha.2 的匹配任务在 70.411 秒直接完成：29,077 input / 26,368 cached / 1,934 output，Luna `0.084749`，同 token Sol `2.118725`。

强制样本使用 90 秒总截止、40 秒工作预算、50 秒 reserve。`turn/steer` 被接受，同一 Luna/max turn 在 87.991 秒返回可审查 `partial`：30,149 input / 27,392 cached / 767 output，Luna `0.050491`，同 token Sol `1.262275`。此前“中断后新开 turn”方案在相同截止内失败，因此活跃工作使用原位 steer。

## 0.5.1 Leader 实验

冷 forced-Leader 将 Sol 可见 JSON 从 3,547 降至 2,553 字符（-28.0%），保留 4 条证据、1 个风险、0 个升级项；但 Luna 成本 `0.050041` → `0.138475`，墙钟 106.782s → 118.916s，无条件 Leader 未通过费用门。

持久 MCP 配对 warm 测试中，Leader measured 与 direct measured 均返回 4 条证据、1 个风险、0 个升级项。payload 3,375 → 2,412（-28.5%），但费用 `0.044911` → `0.081124`、墙钟 14.127s → 36.968s。结论：小任务不应唤醒 Leader。

因此 0.5.1 默认 `reporting=auto`：小型低风险结果走 direct 并累计 digest；大结果、verifier、高风险、保留边界或 Sol 升级才启用 Leader。当前 harness 不暴露 Sol 对 tool result 的精确 tokenizer 计数，因此不把字符减少误报为精确 Sol token 节省。

## 0.5.2 progress 验证

live harness 在同一个阻塞式 `run_task` 请求中提供 MCP progress token，并被动记录 `notifications/progress`；没有轮询 Heliolune、没有新增 Sol turn，也没有把 worker transcript 放进进度消息。

低风险 direct 样本在 74.622 秒完成，发出 9 条从 2 到 100 严格递增的状态，覆盖路由、Luna/max activity、耗时、事件数、缓存率、最后 app-server 事件类别、owner 完成与终态 handoff。用量为 31,830 input / 28,416 cached / 1,808 output；Luna 估算 `0.085518`，同 token Sol `2.137950`，worker boundary 估算节省 96.0%。

forced-Leader 样本在 122.338 秒完成，发出 15 条严格递增状态；额外覆盖 reserved-finalization、原位 steer 被接受、owner 返回诚实 `partial`、Leader/high 压缩与 handoff ready。owner + Leader 合计 51,763 input / 33,536 cached / 959 output；Luna 估算 `0.136673`，同 token Sol `3.416825`。该样本证明慢路径可见，也再次说明 Leader 必须按需启用。

单元测试另行覆盖：无 progress token 时静默、严格单调、约 10 秒限频、非有限数拒绝，以及消息不含 transcript。

Codex CLI 0.146.0 不会给模型发起的 MCP 调用附加 progress token，也没有声明 MCP Apps capability。因此，安装态 host smoke 实测的是 0.5.2 fallback：`start_task` 立即返回，独立 `luna-await` server 阻塞等待且不消耗 Sol turn，Windows 原生悬浮窗以简体中文完成渲染。窗口同时显示 `core`、`tests`、`integration`、`verifier`、`supervisor` 五个固定 lane，主 MCP server 在 Luna 执行期间仍可响应只读状态查询。

最终 integration lane regression 的 worker 执行耗时为 27.558 秒（host 总墙钟 29.244 秒）；用量为 14,886 input / 13,056 cached / 634 output，其中 reasoning 444，input cache rate 87.71%。Luna 估算费用为 `0.034698`；界面的历史 profile 预测为 Sol-only `0.142357`、预计节省 `0.107659`（75.6261%）。活动 worker 用中文概括了 token gate、有限数值校验、限频、0–100 边界、单调性与终态关闭。该 regression 还必须验证：恰好存在五个 worker、活动 worker 到达终态、中文 UI 下 Luna 说明也是中文，并且 `alpha-0.5.0-matched` 费用预测非空。

## 0.6 并行档位

同一组 8 个独立只读审计任务在全新 Luna/max thread 上以 1、4、8 并发运行；每组同样支付一次全新 Luna/high Leader 汇总。为避免依赖 Luna 缓存命中，`cacheIgnoredColdEquivalent` 将全部输入 token 按未缓存 Luna 费率计价。

| 并发 | 样本 | 墙钟 | 相对 1 路 | 质量 | 冷等价费用 |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 200.769s | 1.00x | 100% | 0.890920 |
| 4 | 2 | 均值 52.846s | 3.80x | 90–95% | 均值 0.816648 |
| 8 | 2 | 36.488–73.225s | 均值 3.66x | 95% | 均值 0.821255 |

4 路运行稳定，冷等价费用与串行相当。该证据最初支持 0.6.0 的条件路由；0.6.1 将其提升为产品默认，并为窄任务增加有意义的只读伴随 workstream。8 路有一次全场最快，也有一次明显长尾，继续保持 opt-in。三次完整 4 路只读 MCP smoke（含共享 Leader 汇总）分别为 44.137s、49.607s 和 43.843s；最后一次精简 schema smoke 的 workstream 全部完成，Luna 估算费用为 0.225093。workstream 以 90 秒为尺寸目标，但有界硬截止最长可到 600 秒；共享 Leader session 在各自检查点统一管理仍活跃的 worker。

独立的真实写入 smoke 使用两个 detached Git worktree 内的 Luna/max worker。Heliolune 安全应用了 `alpha.txt` 与 `beta.txt` 的非重叠修改，使主 index 保持 unstaged，清理全部临时 worktree，并以 0.116710 Luna 估算费用在 35.541 秒内完成。单元测试覆盖 dirty main、`HEAD` 变化、scope 越界和 patch 证据保留等失败路径。详见[完整 0.6 工程报告](0.6-RESEARCH.zh-CN.md)与原始 JSON。

所有数字都依赖仓库、任务、缓存、host prefix 和价格，不能视为普适性能保证。
