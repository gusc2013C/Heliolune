[CmdletBinding()]
param(
    [switch]$Compact
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw 'Windows PowerShell 5.1 or PowerShell 7+ is required.'
}

if ($Compact) {
    $compactTempPath = [IO.Path]::Combine(
        [IO.Path]::GetTempPath(),
        'heliolune-release-validation-' + [guid]::NewGuid().ToString('N') + '.log'
    )
    $compactFailure = $null
    $compactExitCode = 0
    try {
        $LASTEXITCODE = 0
        & $PSCommandPath > $compactTempPath 2>&1
        if ($null -ne $LASTEXITCODE) {
            $compactExitCode = [int]$LASTEXITCODE
        }
    } catch {
        $compactFailure = $_.ToString()
        $compactExitCode = 1
    }

    try {
        $compactOutput = @()
        if (Test-Path -LiteralPath $compactTempPath) {
            $compactOutput = @(Get-Content -LiteralPath $compactTempPath -Tail 40 -ErrorAction SilentlyContinue)
        }
        if ($null -ne $compactFailure) {
            $compactOutput += $compactFailure
        }

        if ($compactExitCode -eq 0) {
            $successLines = @(
                $compactOutput |
                    ForEach-Object { $_.ToString() } |
                    Where-Object { $_ -match '^Release validation passed:' } |
                    Select-Object -Last 1
            )
            if ($successLines.Count -gt 0) {
                Write-Output $successLines[0]
            } else {
                Write-Output 'Release validation passed (compact).'
            }
        } else {
            Write-Output 'Release validation failed (compact).'
            $diagnosticLines = @(
                $compactOutput |
                    ForEach-Object { $_.ToString() } |
                    Select-Object -Last 40
            )
            $diagnosticText = ($diagnosticLines -join [Environment]::NewLine)
            if ($diagnosticText.Length -gt 8192) {
                $diagnosticText = $diagnosticText.Substring($diagnosticText.Length - 8192)
            }
            if (-not [string]::IsNullOrWhiteSpace($diagnosticText)) {
                Write-Output $diagnosticText
            }
        }
    } finally {
        if (Test-Path -LiteralPath $compactTempPath) {
            Remove-Item -LiteralPath $compactTempPath -Force -ErrorAction SilentlyContinue
        }
    }
    if ($compactExitCode -ne 0) {
        throw 'Release validation failed (compact).'
    }
    return
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\luna-pool-orchestrator'
$nativePluginRoot = Join-Path $repoRoot 'plugins\heliolune'
$manifestPath = Join-Path $nativePluginRoot '.codex-plugin\plugin.json'
$legacyManifestPath = Join-Path $pluginRoot '.codex-plugin\plugin.json'
$marketplacePath = Join-Path $repoRoot '.agents\plugins\marketplace.json'
$skillPath = Join-Path $pluginRoot 'skills\luna-pool-orchestrator\SKILL.md'
$nativeSkillPath = Join-Path $nativePluginRoot 'skills\heliolune\SKILL.md'
$mcpPath = Join-Path $pluginRoot '.mcp.json'
$projectAgentsRoot = Join-Path $repoRoot '.codex\agents'
$nativeProfileFiles = @(
    'helioterm-mcp.toml',
    'helioterm.toml',
    'luna-critic.toml',
    'luna-owner.toml',
    'luna-peer.toml',
    'spark-terminal.toml'
)

$nativeRequired = @(
    (Join-Path $nativePluginRoot 'model-bindings.json'),
    $nativeSkillPath,
    (Join-Path $nativePluginRoot 'skills\helioterm\SKILL.md'),
    (Join-Path $nativePluginRoot 'scripts\install-agents.mjs'),
    (Join-Path $nativePluginRoot 'scripts\preflight.mjs'),
    (Join-Path $nativePluginRoot 'scripts\configure-models.mjs'),
    (Join-Path $nativePluginRoot 'scripts\native-owner-gate.mjs'),
    (Join-Path $nativePluginRoot 'scripts\inspect-role-proof.mjs'),
    (Join-Path $nativePluginRoot 'scripts\inspect-terminal-proof.mjs'),
    (Join-Path $nativePluginRoot 'scripts\find-rollout.mjs'),
    (Join-Path $nativePluginRoot 'components\helioterm\firewall.mjs'),
    (Join-Path $nativePluginRoot 'components\helioterm\kernel.mjs'),
    (Join-Path $nativePluginRoot 'components\helioterm\direct-runner.mjs'),
    (Join-Path $nativePluginRoot 'components\helioterm\preflight.mjs'),
    (Join-Path $nativePluginRoot 'agents\helioterm-mcp.toml'),
    (Join-Path $nativePluginRoot 'agents\helioterm.toml'),
    (Join-Path $nativePluginRoot 'agents\luna-critic.toml'),
    (Join-Path $nativePluginRoot 'agents\luna-owner.toml'),
    (Join-Path $nativePluginRoot 'agents\luna-peer.toml'),
    (Join-Path $nativePluginRoot 'agents\spark-terminal.toml')
)

foreach ($profileFile in $nativeProfileFiles) {
    $nativeRequired += Join-Path $projectAgentsRoot $profileFile
}

$required = @(
    $manifestPath,
    $legacyManifestPath,
    $marketplacePath,
    $mcpPath,
    (Join-Path $pluginRoot 'scripts\server.mjs'),
    (Join-Path $pluginRoot 'scripts\app-server-client.mjs'),
    (Join-Path $pluginRoot 'scripts\pricing.mjs'),
    (Join-Path $pluginRoot 'scripts\supervision.mjs'),
    (Join-Path $pluginRoot 'scripts\schema-recovery.mjs'),
    (Join-Path $pluginRoot 'scripts\orchestration-policy.mjs'),
    (Join-Path $pluginRoot 'scripts\leader.mjs'),
    (Join-Path $pluginRoot 'scripts\profiles.mjs'),
    (Join-Path $pluginRoot 'scripts\task-telemetry.mjs'),
    (Join-Path $pluginRoot 'scripts\task-dag.mjs'),
    (Join-Path $pluginRoot 'scripts\worktrees.mjs'),
    (Join-Path $pluginRoot 'scripts\progress.mjs'),
    (Join-Path $pluginRoot 'scripts\jobs.mjs'),
    (Join-Path $pluginRoot 'scripts\job-files.mjs'),
    (Join-Path $pluginRoot 'scripts\job-runner.mjs'),
    (Join-Path $pluginRoot 'scripts\job-runner-launch.mjs'),
    (Join-Path $pluginRoot 'scripts\job-runner-launcher.vbs'),
    (Join-Path $pluginRoot 'scripts\await-server.mjs'),
    (Join-Path $pluginRoot 'scripts\status-window.mjs'),
    (Join-Path $pluginRoot 'scripts\status-window.ps1'),
    (Join-Path $pluginRoot 'scripts\status-window-launcher.vbs'),
    (Join-Path $pluginRoot 'assets\status-locales.json'),
    $skillPath,
    (Join-Path $repoRoot 'README.md'),
    (Join-Path $repoRoot 'README.zh-CN.md'),
    (Join-Path $repoRoot 'CHANGELOG.md'),
    (Join-Path $repoRoot 'LICENSE'),
    (Join-Path $repoRoot 'CHANGELOG.zh-CN.md'),
    (Join-Path $repoRoot 'CONTRIBUTING.zh-CN.md'),
    (Join-Path $repoRoot 'SECURITY.zh-CN.md'),
    (Join-Path $repoRoot 'RELEASE_CHECKLIST.zh-CN.md'),
    (Join-Path $repoRoot 'RELEASE_CHECKLIST.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-LUNA-SESSION-REUSE.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-LUNA-SESSION-REUSE.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-HELIOTERM-AB3.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.3-HELIOTERM-AB3.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.4-TOKEN-EFFICIENCY.md'),
    (Join-Path $repoRoot 'docs\0.8.0-ALPHA.4-TOKEN-EFFICIENCY.zh-CN.md'),
    (Join-Path $repoRoot 'benchmarks\results\0.8.0-alpha.4-token-efficiency.json'),
    (Join-Path $repoRoot 'docs\0.8.0-STABLE-TOKEN-EFFICIENCY.md'),
    (Join-Path $repoRoot 'docs\0.8.0-STABLE-TOKEN-EFFICIENCY.zh-CN.md'),
    (Join-Path $repoRoot 'benchmarks\results\0.8.0-stable-token-efficiency.json'),
    (Join-Path $repoRoot 'docs\ARCHITECTURE.zh-CN.md'),
    (Join-Path $repoRoot 'docs\BENCHMARKS.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.6-RESEARCH.md'),
    (Join-Path $repoRoot 'docs\0.6-RESEARCH.zh-CN.md'),
    (Join-Path $repoRoot 'docs\HELIOLUNE-VS-CODEX-SUBAGENTS.md'),
    (Join-Path $repoRoot 'docs\HELIOLUNE-VS-CODEX-SUBAGENTS.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.6.2-FAST-START-BENCHMARK.md'),
    (Join-Path $repoRoot 'docs\0.6.2-FAST-START-BENCHMARK.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.6.3-RUNTIME-DIAGNOSTIC.md'),
    (Join-Path $repoRoot 'docs\0.6.3-RUNTIME-DIAGNOSTIC.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.6.4-RENEWABLE-LIVENESS.md'),
    (Join-Path $repoRoot 'docs\0.6.4-RENEWABLE-LIVENESS.zh-CN.md'),
    (Join-Path $repoRoot 'docs\0.6.5-REAL-DEMO.md'),
    (Join-Path $repoRoot 'docs\0.6.5-REAL-DEMO.zh-CN.md'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.5-real-demo-r1.json'),
    (Join-Path $repoRoot 'docs\0.7.0-ALPHA.md'),
    (Join-Path $repoRoot 'docs\0.7.0-ALPHA.zh-CN.md'),
    (Join-Path $repoRoot 'benchmarks\results\0.7.0-alpha.1-adaptive-r1.json'),
    (Join-Path $repoRoot 'docs\0.7.0-ALPHA.2.md'),
    (Join-Path $repoRoot 'docs\0.7.0-ALPHA.2.zh-CN.md'),
    (Join-Path $repoRoot 'benchmarks\results\0.7.0-alpha.2-dag-r1.json'),
    (Join-Path $repoRoot 'tests\pricing.test.mjs'),
    (Join-Path $repoRoot 'tests\supervision.test.mjs'),
    (Join-Path $repoRoot 'tests\schema-recovery.test.mjs'),
    (Join-Path $repoRoot 'tests\leader.test.mjs'),
    (Join-Path $repoRoot 'tests\profiles.test.mjs'),
    (Join-Path $repoRoot 'tests\task-telemetry.test.mjs'),
    (Join-Path $repoRoot 'tests\task-dag.test.mjs'),
    (Join-Path $repoRoot 'tests\worktrees.test.mjs'),
    (Join-Path $repoRoot 'tests\progress.test.mjs'),
    (Join-Path $repoRoot 'tests\jobs.test.mjs'),
    (Join-Path $repoRoot 'tests\job-files.test.mjs'),
    (Join-Path $repoRoot 'tests\job-runner-detachment.test.mjs'),
    (Join-Path $repoRoot 'tests\await-server.test.mjs'),
    (Join-Path $repoRoot 'tests\status-window.test.mjs'),
    (Join-Path $repoRoot 'tests\mcp-smoke.test.mjs'),
    (Join-Path $repoRoot 'tests\app-server-client-watchdog.test.mjs'),
    (Join-Path $repoRoot 'tests\orchestration-policy.test.mjs'),
    (Join-Path $repoRoot 'tests\fixtures\fake-app-server.mjs'),
    (Join-Path $repoRoot 'tests\fixtures\detached-runner.mjs'),
    (Join-Path $repoRoot 'tests\fixtures\launch-detached-runner.mjs'),
    (Join-Path $repoRoot 'scripts\run-live-benchmark.mjs'),
    (Join-Path $repoRoot 'scripts\run-codex-host-smoke.mjs'),
    (Join-Path $repoRoot 'scripts\benchmark-parallel-luna.mjs'),
    (Join-Path $repoRoot 'scripts\measure-tool-schema.mjs'),
    (Join-Path $repoRoot 'scripts\run-speed-batch-smoke.mjs'),
    (Join-Path $repoRoot 'scripts\run-parallel-write-smoke.mjs'),
    (Join-Path $repoRoot 'scripts\run-dag-write-smoke.mjs'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis.json'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis-direct.json'),
    (Join-Path $repoRoot 'benchmarks\renewable-liveness.json'),
    (Join-Path $repoRoot 'benchmarks\0.7-alpha2-renewable-throughput.json'),
    (Join-Path $repoRoot 'benchmarks\token-first-job-owner.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6-parallel-cold-r1.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6-parallel-cold-r2.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.2-fast-start-code-r1.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.3-backend-diagnostic-r5.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.4-renewable-fast-start-r1.json')
) + $nativeRequired

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $path"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.name -ne 'heliolune') {
    throw "Unexpected plugin name: $($manifest.name)"
}

foreach ($profileFile in $nativeProfileFiles) {
    $sourceProfile = Get-Content -LiteralPath (Join-Path $nativePluginRoot "agents\$profileFile") -Raw -Encoding UTF8
    $projectProfile = Get-Content -LiteralPath (Join-Path $projectAgentsRoot $profileFile) -Raw -Encoding UTF8
    if ($sourceProfile -cne $projectProfile) {
        throw "Project standalone profile is stale: $profileFile"
    }
}
if ($manifest.version -notmatch '^0\.8\.0(?:\+codex\.[0-9A-Za-z.-]+)?$') {
    throw "Unexpected release version: $($manifest.version)"
}
$releaseVersion = $manifest.version -replace '\+codex\..*$', ''
if ($manifest.author.name -ne 'Sicheng Gu' -or $manifest.interface.developerName -ne 'Sicheng Gu') {
    throw 'Plugin author and developerName must be Sicheng Gu.'
}
if ($manifest.PSObject.Properties.Name -contains 'mcpServers') {
    throw 'The Native V2 plugin must not expose an MCP server.'
}

$legacyManifest = Get-Content -LiteralPath $legacyManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($legacyManifest.name -ne 'luna-pool-orchestrator') {
    throw "Unexpected legacy plugin name: $($legacyManifest.name)"
}
if ($legacyManifest.version -notmatch '^0\.7\.0-alpha\.2(?:\+codex\.[0-9A-Za-z.-]+)?$') {
    throw "Unexpected legacy compatibility version: $($legacyManifest.version)"
}
$legacyReleaseVersion = $legacyManifest.version -replace '\+codex\..*$', ''

$marketplace = Get-Content -LiteralPath $marketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($marketplace.name -ne 'heliolune') {
    throw "Unexpected marketplace name: $($marketplace.name)"
}
$entry = @($marketplace.plugins | Where-Object { $_.name -eq 'luna-pool-orchestrator' })
$nativeEntry = @($marketplace.plugins | Where-Object { $_.name -eq 'heliolune' })
if ($entry.Count -ne 1 -or $entry[0].source.path -ne './plugins/luna-pool-orchestrator') {
    throw 'Marketplace must contain exactly one canonical luna-pool-orchestrator entry.'
}
if ($nativeEntry.Count -ne 1 -or $nativeEntry[0].source.path -ne './plugins/heliolune') {
    throw 'Marketplace must contain exactly one canonical heliolune Native V2 entry.'
}
if ($entry[0].policy.installation -ne 'AVAILABLE' -or $entry[0].policy.authentication -ne 'ON_INSTALL') {
    throw 'Marketplace policy must remain AVAILABLE / ON_INSTALL.'
}
if ($nativeEntry[0].policy.installation -ne 'AVAILABLE' -or $nativeEntry[0].policy.authentication -ne 'ON_INSTALL') {
    throw 'Native marketplace policy must remain AVAILABLE / ON_INSTALL.'
}

$mcp = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $mcp.mcpServers.'luna-pool' -or -not $mcp.mcpServers.'luna-await') {
    throw 'Plugin must expose separate luna-pool and luna-await MCP servers.'
}
if ($mcp.mcpServers.'luna-pool'.default_tools_approval_mode -ne 'approve' -or $mcp.mcpServers.'luna-await'.default_tools_approval_mode -ne 'approve') {
    throw 'Installed Heliolune MCP tools must avoid redundant blocking approval prompts.'
}
$poolTools = @($mcp.mcpServers.'luna-pool'.enabled_tools)
if ($poolTools -notcontains 'start_task' -or $poolTools -notcontains 'start_batch' -or @($mcp.mcpServers.'luna-await'.enabled_tools) -notcontains 'await_task') {
    throw 'Heliolune requires start_task/start_batch on luna-pool and await_task on luna-await.'
}
if ($poolTools -contains 'run_task' -or $poolTools -contains 'job_status') {
    throw 'Removed duplicate/inline tools must not be exposed in 0.6.'
}

$skill = Get-Content -LiteralPath $skillPath -Raw -Encoding UTF8
if ($skill -notmatch '(?s)^---\s+name:\s*luna-pool-orchestrator\s+description:.+?\s+---') {
    throw 'SKILL.md frontmatter is invalid.'
}
$nativeSkill = Get-Content -LiteralPath $nativeSkillPath -Raw -Encoding UTF8
if ($nativeSkill -notmatch '(?s)^---\s+name:\s*heliolune\s+description:.+?\s+---') {
    throw 'Native V2 SKILL.md frontmatter is invalid.'
}

$readmeEnglish = Get-Content -LiteralPath (Join-Path $repoRoot 'README.md') -Raw -Encoding UTF8
$readmeChinese = Get-Content -LiteralPath (Join-Path $repoRoot 'README.zh-CN.md') -Raw -Encoding UTF8
if (($readmeEnglish -notmatch '\(README\.zh-CN\.md\)') -or ($readmeChinese -notmatch '\[English\]\(README\.md\)')) {
    throw 'README language switch links are missing.'
}
$readmeVersionPattern = [regex]::Escape("**``$releaseVersion``**")
if (($readmeEnglish -notmatch $readmeVersionPattern) -or ($readmeChinese -notmatch $readmeVersionPattern)) {
    throw 'README versions do not match the plugin manifest.'
}

$changelogEnglish = Get-Content -LiteralPath (Join-Path $repoRoot 'CHANGELOG.md') -Raw -Encoding UTF8
$changelogChinese = Get-Content -LiteralPath (Join-Path $repoRoot 'CHANGELOG.zh-CN.md') -Raw -Encoding UTF8
if (($changelogEnglish -notmatch '\[0\.8\.0\]') -or ($changelogChinese -notmatch '\[0\.8\.0\]')) {
    throw 'Both changelogs must document the current Native V2 stable release.'
}
if (($changelogEnglish -notmatch '\(CHANGELOG\.zh-CN\.md\)') -or ($changelogChinese -notmatch '\[English\]\(CHANGELOG\.md\)')) {
    throw 'Changelog language switch links are missing.'
}

$releaseDocPairs = @(
    @('0.8.0-ALPHA.3-LUNA-SESSION-REUSE.md', '0.8.0-ALPHA.3-LUNA-SESSION-REUSE.zh-CN.md'),
    @('0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.md', '0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.zh-CN.md'),
    @('0.8.0-ALPHA.3-HELIOTERM-AB3.md', '0.8.0-ALPHA.3-HELIOTERM-AB3.zh-CN.md'),
    @('0.8.0-ALPHA.4-TOKEN-EFFICIENCY.md', '0.8.0-ALPHA.4-TOKEN-EFFICIENCY.zh-CN.md'),
    @('0.8.0-STABLE-TOKEN-EFFICIENCY.md', '0.8.0-STABLE-TOKEN-EFFICIENCY.zh-CN.md')
)
foreach ($pair in $releaseDocPairs) {
    $englishDoc = Get-Content -LiteralPath (Join-Path $repoRoot "docs\$($pair[0])") -Raw -Encoding UTF8
    $chineseDoc = Get-Content -LiteralPath (Join-Path $repoRoot "docs\$($pair[1])") -Raw -Encoding UTF8
    if (($englishDoc -notmatch [regex]::Escape("]($($pair[1]))")) -or ($chineseDoc -notmatch [regex]::Escape("[English]($($pair[0]))"))) {
        throw "Release documentation language links are missing: $($pair[0])"
    }
}

$tokenAuditPath = Join-Path $repoRoot 'benchmarks\results\0.8.0-alpha.4-token-efficiency.json'
$tokenAuditRaw = Get-Content -LiteralPath $tokenAuditPath -Raw -Encoding UTF8
$tokenAudit = $tokenAuditRaw | ConvertFrom-Json
if ($tokenAudit.schemaVersion -ne 'HELIOLUNE_TOKEN_EFFICIENCY_AUDIT_V1' -or
    $tokenAudit.releaseVersion -ne '0.8.0-alpha.4' -or
    $tokenAudit.buildIdentity -ne '0.8.0-alpha.4+codex.20260818140328' -or
    $tokenAudit.releaseDate -ne '2026-08-18' -or
    $tokenAudit.measurementClass -ne 'diagnostic' -or
    $tokenAudit.tokenMeaning -ne 'rollout counters, not billing tokens') {
    throw 'Alpha.4 token-efficiency audit metadata is invalid.'
}
$auditPropertyNames = @($tokenAudit.PSObject.Properties.Name)
$auditAllowedProperties = @(
    'schemaVersion', 'releaseVersion', 'buildIdentity', 'releaseDate', 'measurementClass',
    'tokenMeaning', 'ownerRollout', 'freshCompliantProof', 'avoidableSessions', 'repairComparison', 'routingComparison'
)
$unexpectedAuditProperties = @($auditPropertyNames | Where-Object { $auditAllowedProperties -notcontains $_ })
if ($unexpectedAuditProperties.Count -gt 0) {
    throw "Alpha.4 token-efficiency audit contains unsupported fields: $($unexpectedAuditProperties -join ', ')"
}
if ($tokenAuditRaw -match '(?i)(prompt|environment|stdin|secret|task\s*id|raw\s+tool|raw\s+output)') {
    throw 'Alpha.4 token-efficiency audit contains private or raw execution content.'
}
$ownerRollout = $tokenAudit.ownerRollout
if (-not $ownerRollout -or
    $ownerRollout.runCount -ne 7 -or
    $ownerRollout.totalDiagnosticTokens -ne 2752349 -or
    $ownerRollout.inputTokens -ne 2670303 -or
    $ownerRollout.cachedInputTokens -ne 2290688 -or
    $ownerRollout.outputTokens -ne 82046 -or
    $ownerRollout.reasoningTokens -ne 50589 -or
    $ownerRollout.toolCalls -ne 59 -or
    $ownerRollout.toolOutputBytes -ne 624332) {
    throw 'Alpha.4 owner rollout counters do not match the retained aggregate evidence.'
}
$freshCompliantProof = $tokenAudit.freshCompliantProof
if (-not $freshCompliantProof -or
    $freshCompliantProof.model -ne 'gpt-5.6-luna' -or
    $freshCompliantProof.effort -ne 'max' -or
    $freshCompliantProof.toolCalls -ne 4 -or
    $freshCompliantProof.maxPersistedToolOutputBytes -ne 6977 -or
    $freshCompliantProof.totalPersistedToolOutputBytes -ne 10461 -or
    $freshCompliantProof.totalDiagnosticTokens -ne 102468 -or
    $freshCompliantProof.nativeV2Identity -ne $true -or
    $freshCompliantProof.passedMaxToolOutputBytes -ne 24576 -or
    $freshCompliantProof.passedMaxTotalToolOutputBytes -ne 196608 -or
    $freshCompliantProof.retrospectiveImplementationSavingsClaim -ne $false) {
    throw 'Alpha.4 fresh compliant proof does not match the required bounded owner evidence.'
}
$avoidableSessions = $tokenAudit.avoidableSessions
if (-not $avoidableSessions -or
    $avoidableSessions.count -ne 2 -or
    $avoidableSessions.totalDiagnosticTokens -ne 364015 -or
    $avoidableSessions.sharePercent -ne 13.23) {
    throw 'Alpha.4 avoidable-session counters do not match the retained aggregate evidence.'
}
$repairComparison = $tokenAudit.repairComparison
if (-not $repairComparison -or
    $repairComparison.previousTurns -ne 2 -or
    $repairComparison.previousDiagnosticTokens -ne 4347302 -or
    $repairComparison.currentTurns -ne 1 -or
    $repairComparison.currentDiagnosticTokens -ne 3724754 -or
    $repairComparison.reductionDiagnosticTokens -ne 622548 -or
    $repairComparison.reductionPercent -ne 14.32) {
    throw 'Alpha.4 repair comparison does not match the retained aggregate evidence.'
}
$ordinaryFailure = $tokenAudit.routingComparison.ordinaryFailure
$explicitSemantic = $tokenAudit.routingComparison.explicitSemantic
$testDiagnostic = $tokenAudit.routingComparison.testDiagnostic
if (-not $ordinaryFailure -or
    $ordinaryFailure.singleFailureBytes -ne 8800 -or
    $ordinaryFailure.batchFailureBytes -ne 15000 -or
    $ordinaryFailure.beforeRoute -ne 'luna' -or
    $ordinaryFailure.after.model -ne 0 -or
    $ordinaryFailure.after.semanticScore -ne 0 -or
    -not $explicitSemantic -or
    $explicitSemantic.after.route -ne 'luna' -or
    $explicitSemantic.after.semanticScore -ne 3 -or
    -not $testDiagnostic -or
    $testDiagnostic.after.route -ne 'luna' -or
    $testDiagnostic.after.semanticScore -ne 3) {
    throw 'Alpha.4 HelioTerm routing comparison does not match the retained A/B evidence.'
}

$stableAuditPath = Join-Path $repoRoot 'benchmarks\results\0.8.0-stable-token-efficiency.json'
$stableAuditRaw = Get-Content -LiteralPath $stableAuditPath -Raw -Encoding UTF8
$stableAudit = $stableAuditRaw | ConvertFrom-Json
if ($stableAudit.schemaVersion -ne 'HELIOLUNE_STABLE_TOKEN_EFFICIENCY_AUDIT_V1' -or
    $stableAudit.releaseVersion -ne $releaseVersion -or
    $stableAudit.buildIdentity -ne $manifest.version -or
    $stableAudit.releaseDate -ne '2026-08-18' -or
    $stableAudit.measurementClass -ne 'diagnostic' -or
    $stableAudit.tokenMeaning -ne 'rollout counters and bytes/4 content estimates, not billing tokens') {
    throw 'Stable token-efficiency audit metadata is invalid.'
}
$stableAllowedProperties = @(
    'schemaVersion', 'releaseVersion', 'buildIdentity', 'releaseDate', 'measurementClass',
    'tokenMeaning', 'solRollout', 'helioterm', 'validatorAb', 'acceptedOwnerProof', 'claims'
)
$stableUnexpectedProperties = @($stableAudit.PSObject.Properties.Name | Where-Object { $stableAllowedProperties -notcontains $_ })
if ($stableUnexpectedProperties.Count -gt 0) {
    throw "Stable token-efficiency audit contains unsupported fields: $($stableUnexpectedProperties -join ', ')"
}
if ($stableAuditRaw -match '(?i)(prompt|environment|stdin|secret|task\s*id|raw\s+tool|raw\s+output)') {
    throw 'Stable token-efficiency audit contains private or raw execution content.'
}
$solAudit = $stableAudit.solRollout
if (-not $solAudit -or
    $solAudit.inputTokens -ne 71502261 -or
    $solAudit.cachedInputTokens -ne 70178816 -or
    $solAudit.uncachedInputTokens -ne 1323445 -or
    $solAudit.cacheRatePercent -ne 98.15 -or
    $solAudit.outputTokens -ne 204516 -or
    $solAudit.reasoningTokens -ne 71609 -or
    $solAudit.totalDiagnosticTokens -ne 71706777 -or
    $solAudit.samples -ne 615 -or
    $solAudit.userTurns -ne 9 -or
    $solAudit.samplesPerUser -ne 68.33 -or
    $solAudit.latestEstimatedContextTokens -ne 118609 -or
    $solAudit.toolWrappers -ne 468 -or
    $solAudit.singleCallWrappers -ne 405 -or
    $solAudit.singleCallWrapperPercent -ne 86.54 -or
    $solAudit.toolOutputBytes -ne 1638055 -or
    $solAudit.compactions -ne 3 -or
    $solAudit.automaticMigrationEnabled -ne $false -or
    $solAudit.retrospectiveSavingsClaim -ne $false) {
    throw 'Stable Sol rollout counters do not match the retained diagnostic snapshot.'
}
$termAudit = $stableAudit.helioterm
if (-not $termAudit -or
    $termAudit.runs -ne 337 -or
    $termAudit.inputBytes -ne 1485884 -or
    $termAudit.compactBytes -ne 833431 -or
    $termAudit.savedBytes -ne 652453 -or
    $termAudit.savedPercent -ne 43.9 -or
    $termAudit.estimatedNetContentTokensSaved -ne 163065 -or
    $termAudit.avoidedWakeups -ne 80 -or
    $termAudit.avoidedSamplingBoundaries -ne 80 -or
    $termAudit.estimationMethod -ne 'bytes4-content-estimate-not-billing') {
    throw 'Stable HelioTerm counters do not match the retained deterministic meter.'
}
$validatorAudit = $stableAudit.validatorAb
if (-not $validatorAudit -or
    $validatorAudit.fullTestCount -ne 205 -or
    $validatorAudit.baselineSuccessBytes -ne 18538 -or
    $validatorAudit.compactSuccessBytes -ne 65 -or
    $validatorAudit.reductionBytes -ne 18473 -or
    $validatorAudit.reductionPercent -ne 99.65 -or
    $validatorAudit.fullSuiteStillRuns -ne $true -or
    $validatorAudit.failureTailLines -ne 40 -or
    $validatorAudit.failureTailBytes -ne 8192 -or
    $validatorAudit.projectedThreePassSavedBytes -ne 55419 -or
    $validatorAudit.projectedThreePassContentTokenEstimate -ne 13855) {
    throw 'Stable validator A/B evidence is invalid.'
}
$stableOwner = $stableAudit.acceptedOwnerProof
if (-not $stableOwner -or
    $stableOwner.model -ne 'gpt-5.6-luna' -or
    $stableOwner.effort -ne 'max' -or
    $stableOwner.nativeV2 -ne $true -or
    $stableOwner.turns -ne 2 -or
    $stableOwner.toolCalls -ne 9 -or
    $stableOwner.maxPersistedToolOutputBytes -ne 7025 -or
    $stableOwner.totalPersistedToolOutputBytes -ne 18146 -or
    $stableOwner.totalDiagnosticTokens -ne 316841 -or
    $stableOwner.passedMaxToolOutputBytes -ne 24576 -or
    $stableOwner.passedMaxTotalToolOutputBytes -ne 196608) {
    throw 'Stable Luna owner proof does not match persisted Native V2 evidence.'
}
if ($stableAudit.claims.diagnosticOnly -ne $true -or
    $stableAudit.claims.billingTokens -ne $false -or
    $stableAudit.claims.retrospectiveSolSavings -ne $false) {
    throw 'Stable token-efficiency claims are not conservatively labelled.'
}

foreach ($script in @('server.mjs', 'await-server.mjs', 'app-server-client.mjs', 'pricing.mjs', 'supervision.mjs', 'schema-recovery.mjs', 'orchestration-policy.mjs', 'leader.mjs', 'profiles.mjs', 'task-dag.mjs', 'task-telemetry.mjs', 'worktrees.mjs', 'progress.mjs', 'jobs.mjs', 'job-files.mjs', 'job-runner.mjs', 'job-runner-launch.mjs', 'status-window.mjs')) {
    & node --check (Join-Path $pluginRoot "scripts\$script")
    if ($LASTEXITCODE -ne 0) {
        throw "Node syntax validation failed: $script"
    }
}

foreach ($scriptPath in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.mjs' -File) {
    & node --check $scriptPath.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Node syntax validation failed: $($scriptPath.Name)"
    }
}

$nodeTests = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'tests') -Filter '*.test.mjs' -File | Select-Object -ExpandProperty FullName)
& node --test $nodeTests
if ($LASTEXITCODE -ne 0) {
    throw 'Node regression tests failed.'
}

$serverText = Get-Content -LiteralPath (Join-Path $pluginRoot 'scripts\server.mjs') -Raw -Encoding UTF8
$clientText = Get-Content -LiteralPath (Join-Path $pluginRoot 'scripts\app-server-client.mjs') -Raw -Encoding UTF8
$awaitText = Get-Content -LiteralPath (Join-Path $pluginRoot 'scripts\await-server.mjs') -Raw -Encoding UTF8
$escapedLegacyVersion = [regex]::Escape($legacyReleaseVersion)
$serverVersionPattern = 'const VERSION = ["'']' + $escapedLegacyVersion + '["'']'
$clientVersionPattern = 'const APP_VERSION = ["'']' + $escapedLegacyVersion + '["'']'
$awaitVersionPattern = 'const VERSION = ["'']' + $escapedLegacyVersion + '["'']'
$legacyBuildIdPattern = 'const BUILD_ID = ["'']0\.7\.0-alpha\.2-task-dag-r1["'']'
if ($serverText -notmatch $serverVersionPattern) {
    throw 'Legacy server.mjs version does not match the compatibility manifest.'
}

foreach ($scriptPath in Get-ChildItem -LiteralPath $nativePluginRoot -Filter '*.mjs' -File -Recurse) {
    & node --check $scriptPath.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Native V2 Node syntax validation failed: $($scriptPath.FullName)"
    }
}

& node (Join-Path $nativePluginRoot 'scripts\preflight.mjs') --repo $repoRoot --agents-dir $projectAgentsRoot --compact
if ($LASTEXITCODE -ne 0) {
    throw 'Native V2 preflight failed.'
}
if ($clientText -notmatch $clientVersionPattern) {
    throw 'Legacy app-server-client.mjs version does not match the compatibility manifest.'
}
if ($awaitText -notmatch $awaitVersionPattern) {
    throw 'Legacy await-server.mjs version does not match the compatibility manifest.'
}
if (($serverText -notmatch $legacyBuildIdPattern) -or ($awaitText -notmatch $legacyBuildIdPattern)) {
    throw 'Legacy pool runtime build identity does not match alpha.2.'
}

$parseFailures = @()
foreach ($powerShellScript in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.ps1' -File) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $powerShellScript.FullName,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        $parseFailures += "$($powerShellScript.Name): $($parseErrors.Message -join '; ')"
    }
}
if ($parseFailures) {
    throw "PowerShell parse failures: $($parseFailures -join ' | ')"
}

$statusWindowScript = Join-Path $pluginRoot 'scripts\status-window.ps1'
if ([System.IO.File]::ReadAllBytes($statusWindowScript) | Where-Object { $_ -gt 127 }) {
    throw 'status-window.ps1 must remain ASCII so Windows PowerShell 5.1 parses it on every legacy code page; localized text belongs in status-locales.json.'
}
$statusLocales = Get-Content -LiteralPath (Join-Path $pluginRoot 'assets\status-locales.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $statusLocales.en -or -not $statusLocales.'zh-CN') {
    throw 'The status window must ship English and Simplified Chinese locales.'
}
if (Test-Path -LiteralPath (Join-Path $pluginRoot 'assets\status.html') -PathType Leaf) {
    throw 'The removed inline status app must not ship in 0.6.'
}

$forbidden = Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | Where-Object {
    $_.FullName -notlike "$(Join-Path $repoRoot '.git')*" -and
    ($_.Name -match '\.(log|tmp|pem|key)$' -or $_.Name -match '^(codex|codex-cli)(\.exe)?$' -or $_.Name -match '^id_(rsa|ed25519)$')
}
if ($forbidden) {
    throw "Forbidden release files found: $($forbidden.FullName -join ', ')"
}

Write-Output "Release validation passed: Heliolune $($manifest.version)"
Write-Output "PowerShell: $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
