[CmdletBinding()]
param(
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw 'Windows PowerShell 5.1 or PowerShell 7+ is required.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'plugins\heliolune\.codex-plugin\plugin.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version -replace '\+.*$', ''

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot 'dist'
}

Get-Command git -ErrorAction Stop | Out-Null
& (Join-Path $PSScriptRoot 'validate-release.ps1') -Compact
if ($LASTEXITCODE -ne 0) {
    throw 'Release validation failed.'
}

& git -C $repoRoot rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Create a Git commit before packaging.'
}

$branch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
    throw "Release packaging must run from main; current branch: $branch"
}

$status = & git -C $repoRoot status --porcelain
if ($status) {
    throw 'The Git working tree must be clean before packaging.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archivePath = Join-Path $OutputDirectory "heliolune-$version.zip"
$checksumPath = "$archivePath.sha256"
$extractionDirectory = Join-Path ([IO.Path]::GetTempPath()) ('heliolune-release-' + [guid]::NewGuid().ToString('N'))

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
    Remove-Item -LiteralPath $checksumPath -Force
}

& git -C $repoRoot archive --format=zip --output=$archivePath HEAD
if ($LASTEXITCODE -ne 0) {
    throw 'git archive failed.'
}

try {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractionDirectory -Force
    $extractedValidator = Join-Path $extractionDirectory 'scripts\validate-release.ps1'
    if (-not (Test-Path -LiteralPath $extractedValidator -PathType Leaf)) {
        throw 'The release archive does not contain scripts\validate-release.ps1.'
    }
    & $extractedValidator -Compact
    if ($LASTEXITCODE -ne 0) {
        throw 'Extracted release validation failed.'
    }

    $extractedBootstrap = Join-Path $extractionDirectory 'scripts\bootstrap-install.mjs'
    $consumerProject = Join-Path $extractionDirectory '.release-smoke\project'
    $consumerCodexHome = Join-Path $extractionDirectory '.release-smoke\codex-home'
    & node $extractedBootstrap --project $consumerProject --codex-home $consumerCodexHome --skip-codex --write --compact
    if ($LASTEXITCODE -ne 0) {
        throw 'Extracted release bootstrap smoke failed.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $consumerProject '.codex\agents\luna-owner.toml') -PathType Leaf)) {
        throw 'Extracted release bootstrap did not install the Luna owner profile.'
    }
} finally {
    if (Test-Path -LiteralPath $extractionDirectory) {
        Remove-Item -LiteralPath $extractionDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $archivePath)" | Set-Content -LiteralPath $checksumPath -Encoding ascii

Write-Output "Created: $archivePath"
Write-Output "SHA256: $hash"
