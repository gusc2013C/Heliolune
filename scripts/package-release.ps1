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
& (Join-Path $PSScriptRoot 'validate-release.ps1')

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

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $archivePath)" | Set-Content -LiteralPath $checksumPath -Encoding ascii

Write-Output "Created: $archivePath"
Write-Output "SHA256: $hash"
