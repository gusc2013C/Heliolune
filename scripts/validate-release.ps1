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

$required = @(
    $manifestPath,
    $marketplacePath,
    (Join-Path $pluginRoot '.mcp.json'),
    (Join-Path $pluginRoot 'scripts\server.mjs'),
    (Join-Path $pluginRoot 'scripts\app-server-client.mjs'),
    (Join-Path $pluginRoot 'scripts\pricing.mjs'),
    (Join-Path $pluginRoot 'scripts\supervision.mjs'),
    (Join-Path $pluginRoot 'scripts\finalization.mjs'),
    (Join-Path $pluginRoot 'scripts\leader.mjs'),
    $skillPath,
    (Join-Path $repoRoot 'README.md'),
    (Join-Path $repoRoot 'LICENSE'),
    (Join-Path $repoRoot 'tests\pricing.test.mjs'),
    (Join-Path $repoRoot 'tests\supervision.test.mjs'),
    (Join-Path $repoRoot 'tests\finalization.test.mjs'),
    (Join-Path $repoRoot 'tests\leader.test.mjs'),
    (Join-Path $repoRoot 'tests\mcp-smoke.test.mjs'),
    (Join-Path $repoRoot 'tests\app-server-client-watchdog.test.mjs'),
    (Join-Path $repoRoot 'tests\fixtures\fake-app-server.mjs'),
    (Join-Path $repoRoot 'scripts\run-live-benchmark.mjs'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis.json'),
    (Join-Path $repoRoot 'benchmarks\bounded-analysis-direct.json'),
    (Join-Path $repoRoot 'benchmarks\forced-finalization.json')
)

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $path"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.name -ne 'luna-pool-orchestrator') {
    throw "Unexpected plugin name: $($manifest.name)"
}
if ($manifest.version -notmatch '^0\.5\.[01](?:-alpha\.[0-9]+)?(?:\+codex\.[0-9A-Za-z.-]+)?$') {
    throw "Unexpected alpha version: $($manifest.version)"
}
if ($manifest.author.name -ne 'Sicheng Gu' -or $manifest.interface.developerName -ne 'Sicheng Gu') {
    throw 'Plugin author and developerName must be Sicheng Gu.'
}

$marketplace = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
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

$skill = Get-Content -LiteralPath $skillPath -Raw
if ($skill -notmatch '(?s)^---\s+name:\s*luna-pool-orchestrator\s+description:.+?\s+---') {
    throw 'SKILL.md frontmatter is invalid.'
}

foreach ($script in @('server.mjs', 'app-server-client.mjs', 'pricing.mjs', 'supervision.mjs', 'finalization.mjs', 'leader.mjs')) {
    & node --check (Join-Path $pluginRoot "scripts\$script")
    if ($LASTEXITCODE -ne 0) {
        throw "Node syntax validation failed: $script"
    }
}

$nodeTests = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'tests') -Filter '*.test.mjs' -File | Select-Object -ExpandProperty FullName)
& node --test $nodeTests
if ($LASTEXITCODE -ne 0) {
    throw 'Node regression tests failed.'
}

$serverText = Get-Content -LiteralPath (Join-Path $pluginRoot 'scripts\server.mjs') -Raw
$clientText = Get-Content -LiteralPath (Join-Path $pluginRoot 'scripts\app-server-client.mjs') -Raw
$escapedVersion = [regex]::Escape(($manifest.version -replace '\+.*$', ''))
$serverVersionPattern = 'const VERSION = ["'']' + $escapedVersion + '["'']'
$clientVersionPattern = 'const APP_VERSION = ["'']' + $escapedVersion + '["'']'
if ($serverText -notmatch $serverVersionPattern) {
    throw 'server.mjs version does not match the plugin manifest.'
}
if ($clientText -notmatch $clientVersionPattern) {
    throw 'app-server-client.mjs version does not match the plugin manifest.'
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

$forbidden = Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | Where-Object {
    $_.FullName -notlike "$(Join-Path $repoRoot '.git')*" -and
    ($_.Name -match '\.(log|tmp|pem|key)$' -or $_.Name -match '^(codex|codex-cli)(\.exe)?$' -or $_.Name -match '^id_(rsa|ed25519)$')
}
if ($forbidden) {
    throw "Forbidden release files found: $($forbidden.FullName -join ', ')"
}

Write-Output "Release validation passed: Heliolune $($manifest.version)"
Write-Output "PowerShell: $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
