# 贡献指南

[English](CONTRIBUTING.md) · 简体中文

Heliolune 仍处于 0.x。修改应尽量小、有证据，并保持 controller/worker 信任边界。

1. 从 `main` 创建分支。
2. 不得打包模型 host 可执行文件、凭据、日志、worker transcript 或 benchmark workspace。
3. 尽量保持稳定 worker/Leader role prefix，只增量发送变化的 task state。
4. 修改路由、timeout、cache、verification、progress 或 token accounting 时，增加相应回归与验收证据。
5. 保持英文默认文档和简体中文链接同步。
6. 提交 PR 前运行 `pwsh -File .\scripts\validate-release.ps1`。

架构、安全边界、公共 API 和不可逆迁移必须由 maintainer 明确审查。
