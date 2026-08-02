[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$JobId,

    [string]$JobRoot = (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\luna-pool-orchestrator\jobs'),

    [switch]$Probe,

    [switch]$WpfProbe
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw 'Windows PowerShell 5.1 or newer is required.'
}
if ([string]::IsNullOrWhiteSpace($env:windir)) {
    $env:windir = $env:SystemRoot
}

$jobFile = Join-Path $JobRoot ($JobId + '.json')
$readyFile = Join-Path $JobRoot ($JobId + '.window.json')
$errorFile = Join-Path $JobRoot ($JobId + '.window-error.log')
trap {
    $diagnostic = $_ | Out-String
    if ($null -ne $_.Exception) { $diagnostic += [Environment]::NewLine + $_.Exception.ToString() }
    $diagnostic += [Environment]::NewLine + ('ApartmentState=' + [System.Threading.Thread]::CurrentThread.ApartmentState)
    [System.IO.File]::WriteAllText($errorFile, $diagnostic, (New-Object System.Text.UTF8Encoding($false)))
    exit 1
}
$languageTag = $null
try { $languageTag = @(Get-WinUserLanguageList)[0].LanguageTag } catch { $languageTag = $null }
if ([string]::IsNullOrWhiteSpace($languageTag)) { $languageTag = [System.Globalization.CultureInfo]::CurrentUICulture.Name }
$isChinese = $languageTag.ToLowerInvariant().StartsWith('zh')
$localePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\status-locales.json'
$locales = Get-Content -LiteralPath $localePath -Raw -Encoding UTF8 | ConvertFrom-Json
$locale = if ($isChinese) { $locales.'zh-CN' } else { $locales.en }
$strings = $locale.strings
$laneNames = @{}
foreach ($property in $locale.lanes.PSObject.Properties) { $laneNames[$property.Name] = [string]$property.Value }
$statusNames = @{}
foreach ($property in $locale.statuses.PSObject.Properties) { $statusNames[$property.Name] = [string]$property.Value }

function Read-HelioluneSnapshot {
    if (-not (Test-Path -LiteralPath $jobFile -PathType Leaf)) {
        return $null
    }
    try {
        $record = Get-Content -LiteralPath $jobFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $record.snapshot) {
            return $record.snapshot
        }
        $resultUsage = $null
        if ($null -ne $record.result) {
            $resultUsage = $record.result.usage
        }
        return [PSCustomObject]@{
            jobId = $JobId
            status = $record.status
            lane = $record.lane
            effort = 'max'
            progress = $(if ($record.status -eq 'running') { 1 } else { 100 })
            message = $(if ($record.status -eq 'completed') { 'Heliolune Leader - task complete - ready for Sol' } elseif ($record.status -eq 'failed') { 'Heliolune Leader - task failed' } else { 'Heliolune Leader - task queued' })
            elapsedMs = 0
            updates = @()
            workers = @()
            usage = $resultUsage
        }
    }
    catch {
        return $null
    }
}

if ($Probe) {
    $probeSnapshot = Read-HelioluneSnapshot
    if ($null -eq $probeSnapshot) {
        throw "No readable Heliolune job record: $jobFile"
    }
    $probeSnapshot | ConvertTo-Json -Depth 8 -Compress
    exit 0
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Heliolune Leader" Width="620" Height="690" MinWidth="520" MinHeight="580"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent" ResizeMode="CanResizeWithGrip"
        ShowInTaskbar="True" Topmost="True">
  <Border CornerRadius="22" Background="#F7171D2B" BorderBrush="#44516B" BorderThickness="1" Padding="24">
    <Border.Effect><DropShadowEffect Color="#000000" BlurRadius="30" ShadowDepth="10" Opacity="0.38"/></Border.Effect>
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/>
      </Grid.RowDefinitions>
      <Grid Grid.Row="0" x:Name="DragArea" Margin="0,0,0,18">
        <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
        <Grid Width="48" Height="48" Margin="0,0,14,0">
          <Ellipse>
            <Ellipse.Fill><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#FFD166" Offset="0"/><GradientStop Color="#8FAEFF" Offset="1"/></LinearGradientBrush></Ellipse.Fill>
          </Ellipse>
          <TextBlock Text="HL" FontFamily="Segoe UI Semibold" FontWeight="Bold" FontSize="14" Foreground="#172033" HorizontalAlignment="Center" VerticalAlignment="Center"/>
        </Grid>
        <StackPanel Grid.Column="1" VerticalAlignment="Center">
          <TextBlock Text="Heliolune Leader" FontFamily="Segoe UI Semibold" FontSize="20" FontWeight="SemiBold" Foreground="#F4F7FF"/>
          <TextBlock x:Name="SubtitleText" FontFamily="Segoe UI" FontSize="12" Foreground="#9EABC3" Margin="0,3,0,0"/>
        </StackPanel>
        <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Top">
          <Button x:Name="MinimizeButton" Content="-" Width="34" Height="30" Margin="0,0,7,0" Background="#252E42" Foreground="#BCC8DE" BorderThickness="0" FontSize="15" Cursor="Hand"/>
          <Button x:Name="CloseButton" Content="x" Width="34" Height="30" Background="#352633" Foreground="#FFB6C1" BorderThickness="0" FontSize="17" Cursor="Hand"/>
        </StackPanel>
      </Grid>

      <Border Grid.Row="1" Background="#20283A" CornerRadius="14" Padding="16" Margin="0,0,0,14">
        <StackPanel>
          <Grid>
            <TextBlock x:Name="OverallLabel" FontSize="12" Foreground="#9DAAC1"/>
            <TextBlock x:Name="OverallPercent" Text="1%" HorizontalAlignment="Right" FontSize="12" FontWeight="SemiBold" Foreground="#DDE6FA"/>
          </Grid>
          <Border x:Name="OverallTrack" Height="9" CornerRadius="5" Background="#313B50" Margin="0,10,0,12" ClipToBounds="True">
            <Border x:Name="OverallFill" Width="4" HorizontalAlignment="Left" CornerRadius="5">
              <Border.Background><LinearGradientBrush StartPoint="0,0" EndPoint="1,0"><GradientStop Color="#FFD166" Offset="0"/><GradientStop Color="#86A6FF" Offset="1"/></LinearGradientBrush></Border.Background>
            </Border>
          </Border>
          <TextBlock x:Name="MainExplanation" TextWrapping="Wrap" FontSize="13" LineHeight="20" Foreground="#E6EBF6" MinHeight="40"/>
          <TextBlock x:Name="MetaText" FontSize="11" Foreground="#8492AA" Margin="0,10,0,0"/>
          <Border Background="#1D3A35" BorderBrush="#31594D" BorderThickness="1" CornerRadius="10" Padding="10,7" Margin="0,11,0,0">
            <TextBlock x:Name="CostText" FontSize="11" FontWeight="SemiBold" Foreground="#8DE0B7" TextWrapping="Wrap"/>
          </Border>
        </StackPanel>
      </Border>

      <Grid Grid.Row="2" Margin="2,0,2,9">
        <TextBlock x:Name="WorkersLabel" FontFamily="Segoe UI Semibold" FontWeight="SemiBold" FontSize="13" Foreground="#DCE5F8"/>
        <TextBlock x:Name="ActiveCount" HorizontalAlignment="Right" FontSize="11" Foreground="#8492AA"/>
      </Grid>

      <ScrollViewer Grid.Row="4" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled">
        <StackPanel x:Name="WorkersPanel"/>
      </ScrollViewer>

      <Grid Grid.Row="5" Margin="2,14,2,0">
        <TextBlock x:Name="UsageText" FontSize="11" Foreground="#8492AA"/>
        <TextBlock x:Name="CloseCountdown" HorizontalAlignment="Right" FontSize="11" Foreground="#8FAEFF"/>
      </Grid>
    </Grid>
  </Border>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
if ($WpfProbe) {
    @{ wpf = 'ready'; windir = $env:windir; apartment = [System.Threading.Thread]::CurrentThread.ApartmentState.ToString() } | ConvertTo-Json -Compress
    exit 0
}

function Find-Control([string]$name) {
    return $window.FindName($name)
}

$subtitleText = Find-Control 'SubtitleText'
$overallLabel = Find-Control 'OverallLabel'
$overallPercent = Find-Control 'OverallPercent'
$overallTrack = Find-Control 'OverallTrack'
$overallFill = Find-Control 'OverallFill'
$mainExplanation = Find-Control 'MainExplanation'
$metaText = Find-Control 'MetaText'
$costText = Find-Control 'CostText'
$workersLabel = Find-Control 'WorkersLabel'
$activeCount = Find-Control 'ActiveCount'
$workersPanel = Find-Control 'WorkersPanel'
$usageText = Find-Control 'UsageText'
$closeCountdown = Find-Control 'CloseCountdown'
$closeButton = Find-Control 'CloseButton'
$minimizeButton = Find-Control 'MinimizeButton'
$dragArea = Find-Control 'DragArea'

$subtitleText.Text = $strings.Subtitle
$overallLabel.Text = $strings.Overall
$workersLabel.Text = $strings.Workers
$mainExplanation.Text = $strings.Waiting
$usageText.Text = $strings.LocalOnly
$costText.Text = $strings.CostPending
$closeButton.ToolTip = $strings.Close
$minimizeButton.ToolTip = $strings.Minimize

$laneOrder = @()
$workerControls = @{}
function Add-WorkerCard([string]$lane) {
    if ($workerControls.ContainsKey($lane)) { return }
    $card = New-Object System.Windows.Controls.Border
    $card.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#CC20283A')
    $card.BorderBrush = [Windows.Media.BrushConverter]::new().ConvertFromString('#303B51')
    $card.BorderThickness = New-Object Windows.Thickness(1)
    $card.CornerRadius = New-Object Windows.CornerRadius(13)
    $card.Padding = New-Object Windows.Thickness(14, 11, 14, 11)
    $card.Margin = New-Object Windows.Thickness(0, 0, 0, 9)

    $grid = New-Object System.Windows.Controls.Grid
    $grid.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height = [Windows.GridLength]::Auto }))
    $grid.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height = [Windows.GridLength]::Auto }))
    $grid.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height = [Windows.GridLength]::Auto }))

    $header = New-Object System.Windows.Controls.Grid
    $header.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
    $header.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition -Property @{ Width = [Windows.GridLength]::Auto }))
    $name = New-Object System.Windows.Controls.TextBlock
    $displayName = $laneNames[$lane]
    if ([string]::IsNullOrWhiteSpace([string]$displayName)) {
        if ($lane -match '^burst-(\d+)$') { $displayName = $strings.BurstWorker -f $Matches[1] }
        else { $displayName = $lane }
    }
    $name.Text = $displayName
    $name.FontFamily = 'Segoe UI Semibold'
    $name.FontSize = 12
    $name.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#EDF2FF')
    $badge = New-Object System.Windows.Controls.Border
    $badge.CornerRadius = New-Object Windows.CornerRadius(9)
    $badge.Padding = New-Object Windows.Thickness(8, 3, 8, 3)
    $badgeText = New-Object System.Windows.Controls.TextBlock
    $badgeText.FontSize = 10
    $badgeText.FontWeight = [Windows.FontWeights]::SemiBold
    $badge.Child = $badgeText
    [System.Windows.Controls.Grid]::SetColumn($badge, 1)
    $header.Children.Add($name) | Out-Null
    $header.Children.Add($badge) | Out-Null

    $explanation = New-Object System.Windows.Controls.TextBlock
    $explanation.Text = $strings.Idle
    $explanation.TextWrapping = [Windows.TextWrapping]::Wrap
    $explanation.FontSize = 11
    $explanation.LineHeight = 17
    $explanation.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#A9B5CA')
    $explanation.Margin = New-Object Windows.Thickness(0, 7, 0, 8)
    [System.Windows.Controls.Grid]::SetRow($explanation, 1)

    $track = New-Object System.Windows.Controls.Border
    $track.Height = 5
    $track.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#303A4E')
    $track.CornerRadius = New-Object Windows.CornerRadius(3)
    $track.ClipToBounds = $true
    [System.Windows.Controls.Grid]::SetRow($track, 2)
    $fill = New-Object System.Windows.Controls.Border
    $fill.Width = 0
    $fill.HorizontalAlignment = [Windows.HorizontalAlignment]::Left
    $fill.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#8FAEFF')
    $fill.CornerRadius = New-Object Windows.CornerRadius(3)
    $track.Child = $fill

    $grid.Children.Add($header) | Out-Null
    $grid.Children.Add($explanation) | Out-Null
    $grid.Children.Add($track) | Out-Null
    $card.Child = $grid
    $workersPanel.Children.Add($card) | Out-Null
    $workerControls[$lane] = @{ Badge = $badge; BadgeText = $badgeText; Explanation = $explanation; Track = $track; Fill = $fill }
}

function Set-BadgeStyle($controls, [string]$status) {
    switch ($status) {
        'completed' { $controls.Badge.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#243F36'); $controls.BadgeText.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#83E0B0') }
        'failed' { $controls.Badge.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#482B35'); $controls.BadgeText.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#FFADB9') }
        'idle' { $controls.Badge.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#2C3446'); $controls.BadgeText.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#8E9AB0') }
        default { $controls.Badge.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#293958'); $controls.BadgeText.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#AFC6FF') }
    }
}

$script:completedAt = $null
$script:lastSnapshot = $null
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(750)
$timer.Add_Tick({
    $snapshot = Read-HelioluneSnapshot
    if ($null -eq $snapshot) {
        return
    }
    $script:lastSnapshot = $snapshot
    $overallValue = [Math]::Max(0, [Math]::Min(100, [int][Math]::Round([double]$snapshot.progress)))
    $overallPercent.Text = '{0}%' -f $overallValue
    if ($overallTrack.ActualWidth -gt 0) {
        $overallFill.Width = [Math]::Max(4, $overallTrack.ActualWidth * $overallValue / 100)
    }
    $elapsedSeconds = [Math]::Max(0, [int][Math]::Round(([double]$snapshot.elapsedMs) / 1000))
    $displayLane = $laneNames[[string]$snapshot.lane]
    if ([string]::IsNullOrWhiteSpace($displayLane)) { $displayLane = [string]$snapshot.lane }
    $metaText.Text = '{0}: {1}s   |   {2}/max   |   #{3}' -f $strings.Elapsed, $elapsedSeconds, $displayLane, ([string]$JobId).Substring(0, 8)

    $workerMap = @{}
    foreach ($worker in @($snapshot.workers)) {
        $workerMap[[string]$worker.lane] = $worker
    }
    $laneOrder = @($snapshot.workers | ForEach-Object { [string]$_.lane })
    foreach ($lane in $laneOrder) { Add-WorkerCard $lane }
    $activeWorkers = 0
    $activeExplanation = $null
    foreach ($lane in $laneOrder) {
        $worker = $workerMap[$lane]
        if ($null -eq $worker) {
            $worker = [PSCustomObject]@{ lane = $lane; status = 'idle'; progress = 0; explanation = $null }
        }
        $controls = $workerControls[$lane]
        $workerStatus = [string]$worker.status
        if (($workerStatus -ne 'idle') -and ($workerStatus -ne 'completed') -and ($workerStatus -ne 'failed')) {
            $activeWorkers += 1
        }
        $localizedStatus = $statusNames[$workerStatus]
        if ($null -eq $localizedStatus) { $localizedStatus = $workerStatus }
        $controls.BadgeText.Text = $localizedStatus
        Set-BadgeStyle $controls $workerStatus
        if ([string]::IsNullOrWhiteSpace([string]$worker.explanation)) {
            $controls.Explanation.Text = $(if ($workerStatus -eq 'idle') { $strings.Idle } else { $strings.NoExplanation })
        } else {
            $controls.Explanation.Text = [string]$worker.explanation
            if ($workerStatus -ne 'idle') {
                $activeExplanation = [string]$worker.explanation
            }
        }
        $workerValue = [Math]::Max(0, [Math]::Min(100, [double]$worker.progress))
        if ($controls.Track.ActualWidth -gt 0) {
            $controls.Fill.Width = $controls.Track.ActualWidth * $workerValue / 100
        }
    }
    $activeCount.Text = $strings.ActiveCount -f $activeWorkers
    $mainExplanation.Text = $(
        if ($null -ne $activeExplanation) { $activeExplanation }
        elseif ([string]$snapshot.status -eq 'completed') { $strings.Complete }
        elseif ([string]$snapshot.status -eq 'failed') { $strings.Failed }
        else { $strings.NoExplanation }
    )

    if ($null -ne $snapshot.usage) {
        $inputTokens = [double]$snapshot.usage.inputTokens
        $cachedTokens = [double]$snapshot.usage.cachedInputTokens
        $outputTokens = [double]$snapshot.usage.outputTokens
        $cacheRate = 0
        if ($inputTokens -gt 0) { $cacheRate = [Math]::Round(($cachedTokens / $inputTokens) * 100) }
        $usageText.Text = '{0:N0} {1}   |   {2}% {3}   |   {4:N0} {5}' -f $inputTokens, $strings.Input, $cacheRate, $strings.Cached, $outputTokens, $strings.Output
    }
    if (($null -ne $snapshot.cost) -and ($null -ne $snapshot.cost.savingsPercent)) {
        $costText.Text = $strings.CostSummary -f [double]$snapshot.cost.estimatedSavings, [Math]::Round([double]$snapshot.cost.savingsPercent, 2), [double]$snapshot.cost.actual, [double]$snapshot.cost.projectedSolOnly
    }

    $statusText = [string]$snapshot.status
    if (($statusText -eq 'completed') -or ($statusText -eq 'failed')) {
        if ($null -eq $script:completedAt) { $script:completedAt = [DateTime]::UtcNow }
        $remaining = [Math]::Max(0, 15 - [int]([DateTime]::UtcNow - $script:completedAt).TotalSeconds)
        $closeCountdown.Text = $strings.AutoClose -f $remaining
        if ($remaining -le 0) { $window.Close() }
    }
})

$dragArea.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq [Windows.Input.MouseButtonState]::Pressed) { $window.DragMove() } })
$closeButton.Add_Click({ $window.Close() })
$minimizeButton.Add_Click({ $window.WindowState = [Windows.WindowState]::Minimized })
$window.Add_ContentRendered({
    $workingArea = [System.Windows.SystemParameters]::WorkArea
    $window.Left = [Math]::Max($workingArea.Left, $workingArea.Right - $window.ActualWidth - 22)
    $window.Top = [Math]::Max($workingArea.Top, $workingArea.Bottom - $window.ActualHeight - 22)
    $ready = @{ pid = $PID; language = $(if ($isChinese) { 'zh-CN' } else { 'en' }); shownAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($readyFile, $ready, (New-Object System.Text.UTF8Encoding($false)))
})
$window.Add_Closed({
    $timer.Stop()
    Remove-Item -LiteralPath $readyFile -Force -ErrorAction SilentlyContinue
})

$timer.Start()
[void]$window.ShowDialog()
