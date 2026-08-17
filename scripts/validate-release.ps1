[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw 'Windows PowerShell 5.1 or PowerShell 7+ is required.'
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
if ($manifest.version -notmatch '^0\.8\.0-alpha\.3(?:\+codex\.[0-9A-Za-z.-]+)?$') {
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
if (($changelogEnglish -notmatch '\[0\.8\.0-alpha\.3\]') -or ($changelogChinese -notmatch '\[0\.8\.0-alpha\.3\]')) {
    throw 'Both changelogs must document the current Native V2 prerelease.'
}
if (($changelogEnglish -notmatch '\(CHANGELOG\.zh-CN\.md\)') -or ($changelogChinese -notmatch '\[English\]\(CHANGELOG\.md\)')) {
    throw 'Changelog language switch links are missing.'
}

$releaseDocPairs = @(
    @('0.8.0-ALPHA.3-LUNA-SESSION-REUSE.md', '0.8.0-ALPHA.3-LUNA-SESSION-REUSE.zh-CN.md'),
    @('0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.md', '0.8.0-ALPHA.3-HELIOTERM-DIRECT-OPT.zh-CN.md'),
    @('0.8.0-ALPHA.3-HELIOTERM-AB3.md', '0.8.0-ALPHA.3-HELIOTERM-AB3.zh-CN.md')
)
foreach ($pair in $releaseDocPairs) {
    $englishDoc = Get-Content -LiteralPath (Join-Path $repoRoot "docs\$($pair[0])") -Raw -Encoding UTF8
    $chineseDoc = Get-Content -LiteralPath (Join-Path $repoRoot "docs\$($pair[1])") -Raw -Encoding UTF8
    if (($englishDoc -notmatch [regex]::Escape("]($($pair[1]))")) -or ($chineseDoc -notmatch [regex]::Escape("[English]($($pair[0]))"))) {
        throw "Release documentation language links are missing: $($pair[0])"
    }
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
