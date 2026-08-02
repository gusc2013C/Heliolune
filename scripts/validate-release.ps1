[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw 'Windows PowerShell 5.1 or PowerShell 7+ is required.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\luna-pool-orchestrator'
$manifestPath = Join-Path $pluginRoot '.codex-plugin\plugin.json'
$marketplacePath = Join-Path $repoRoot '.agents\plugins\marketplace.json'
$skillPath = Join-Path $pluginRoot 'skills\luna-pool-orchestrator\SKILL.md'
$mcpPath = Join-Path $pluginRoot '.mcp.json'

$required = @(
    $manifestPath,
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
    (Join-Path $pluginRoot 'scripts\worktrees.mjs'),
    (Join-Path $pluginRoot 'scripts\progress.mjs'),
    (Join-Path $pluginRoot 'scripts\jobs.mjs'),
    (Join-Path $pluginRoot 'scripts\job-files.mjs'),
    (Join-Path $pluginRoot 'scripts\await-server.mjs'),
    (Join-Path $pluginRoot 'scripts\status-window.mjs'),
    (Join-Path $pluginRoot 'scripts\status-window.ps1'),
    (Join-Path $pluginRoot 'scripts\status-window-launcher.vbs'),
    (Join-Path $pluginRoot 'assets\status-locales.json'),
    $skillPath,
    (Join-Path $repoRoot 'README.md'),
    (Join-Path $repoRoot 'README.zh-CN.md'),
    (Join-Path $repoRoot 'LICENSE'),
    (Join-Path $repoRoot 'CHANGELOG.zh-CN.md'),
    (Join-Path $repoRoot 'CONTRIBUTING.zh-CN.md'),
    (Join-Path $repoRoot 'SECURITY.zh-CN.md'),
    (Join-Path $repoRoot 'RELEASE_CHECKLIST.zh-CN.md'),
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
    (Join-Path $repoRoot 'tests\pricing.test.mjs'),
    (Join-Path $repoRoot 'tests\supervision.test.mjs'),
    (Join-Path $repoRoot 'tests\schema-recovery.test.mjs'),
    (Join-Path $repoRoot 'tests\leader.test.mjs'),
    (Join-Path $repoRoot 'tests\profiles.test.mjs'),
    (Join-Path $repoRoot 'tests\worktrees.test.mjs'),
    (Join-Path $repoRoot 'tests\progress.test.mjs'),
    (Join-Path $repoRoot 'tests\jobs.test.mjs'),
    (Join-Path $repoRoot 'tests\job-files.test.mjs'),
    (Join-Path $repoRoot 'tests\await-server.test.mjs'),
    (Join-Path $repoRoot 'tests\status-window.test.mjs'),
    (Join-Path $repoRoot 'tests\mcp-smoke.test.mjs'),
    (Join-Path $repoRoot 'tests\app-server-client-watchdog.test.mjs'),
    (Join-Path $repoRoot 'tests\orchestration-policy.test.mjs'),
    (Join-Path $repoRoot 'tests\fixtures\fake-app-server.mjs'),
    (Join-Path $repoRoot 'scripts\run-live-benchmark.mjs'),
    (Join-Path $repoRoot 'scripts\run-codex-host-smoke.mjs'),
    (Join-Path $repoRoot 'scripts\benchmark-parallel-luna.mjs'),
    (Join-Path $repoRoot 'scripts\measure-tool-schema.mjs'),
    (Join-Path $repoRoot 'scripts\run-speed-batch-smoke.mjs'),
    (Join-Path $repoRoot 'scripts\run-parallel-write-smoke.mjs'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis.json'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis-direct.json'),
    (Join-Path $repoRoot 'benchmarks\renewable-liveness.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6-parallel-cold-r1.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6-parallel-cold-r2.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.2-fast-start-code-r1.json'),
    (Join-Path $repoRoot 'benchmarks\results\0.6.3-backend-diagnostic-r5.json')
    (Join-Path $repoRoot 'benchmarks\results\0.6.4-renewable-fast-start-r1.json')
)

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $path"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.name -ne 'luna-pool-orchestrator') {
    throw "Unexpected plugin name: $($manifest.name)"
}
if ($manifest.version -notmatch '^0\.6\.4(?:\+codex\.[0-9A-Za-z.-]+)?$') {
    throw "Unexpected release version: $($manifest.version)"
}
if ($manifest.author.name -ne 'Sicheng Gu' -or $manifest.interface.developerName -ne 'Sicheng Gu') {
    throw 'Plugin author and developerName must be Sicheng Gu.'
}

$marketplace = Get-Content -LiteralPath $marketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($marketplace.name -ne 'heliolune') {
    throw "Unexpected marketplace name: $($marketplace.name)"
}
$entry = @($marketplace.plugins | Where-Object { $_.name -eq 'luna-pool-orchestrator' })
if ($entry.Count -ne 1 -or $entry[0].source.path -ne './plugins/luna-pool-orchestrator') {
    throw 'Marketplace must contain exactly one canonical luna-pool-orchestrator entry.'
}
if ($entry[0].policy.installation -ne 'AVAILABLE' -or $entry[0].policy.authentication -ne 'ON_INSTALL') {
    throw 'Marketplace policy must remain AVAILABLE / ON_INSTALL.'
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

$readmeEnglish = Get-Content -LiteralPath (Join-Path $repoRoot 'README.md') -Raw -Encoding UTF8
$readmeChinese = Get-Content -LiteralPath (Join-Path $repoRoot 'README.zh-CN.md') -Raw -Encoding UTF8
if (($readmeEnglish -notmatch '\(README\.zh-CN\.md\)') -or ($readmeChinese -notmatch '\[English\]\(README\.md\)')) {
    throw 'README language switch links are missing.'
}
$readmeVersionPattern = [regex]::Escape("**``$($manifest.version)``**")
if (($readmeEnglish -notmatch $readmeVersionPattern) -or ($readmeChinese -notmatch $readmeVersionPattern)) {
    throw 'README versions do not match the plugin manifest.'
}

foreach ($script in @('server.mjs', 'await-server.mjs', 'app-server-client.mjs', 'pricing.mjs', 'supervision.mjs', 'schema-recovery.mjs', 'orchestration-policy.mjs', 'leader.mjs', 'profiles.mjs', 'worktrees.mjs', 'progress.mjs', 'jobs.mjs', 'job-files.mjs', 'status-window.mjs')) {
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
$escapedVersion = [regex]::Escape(($manifest.version -replace '\+.*$', ''))
$serverVersionPattern = 'const VERSION = ["'']' + $escapedVersion + '["'']'
$clientVersionPattern = 'const APP_VERSION = ["'']' + $escapedVersion + '["'']'
$awaitVersionPattern = 'const VERSION = ["'']' + $escapedVersion + '["'']'
if ($serverText -notmatch $serverVersionPattern) {
    throw 'server.mjs version does not match the plugin manifest.'
}
if ($clientText -notmatch $clientVersionPattern) {
    throw 'app-server-client.mjs version does not match the plugin manifest.'
}
if ($awaitText -notmatch $awaitVersionPattern) {
    throw 'await-server.mjs version does not match the plugin manifest.'
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
