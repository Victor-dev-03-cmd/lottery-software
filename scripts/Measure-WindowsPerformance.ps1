# Measure the desktop app's CPU and memory on the ACTUAL Windows PC.
# Run once on the previous version (Label old) and again on the new test build
# (Label new) with the same database and workload. This script never edits data.
param(
    [string]$ProcessName = "lottery-manager",
    [ValidateRange(10, 1800)][int]$DurationSeconds = 90,
    [ValidateRange(1, 30)][int]$IntervalSeconds = 3,
    [string]$Label = "test",
    [string]$OutputDirectory = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$initial = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($initial.Count -eq 0) {
    throw "Open Lottery Manager first, then rerun this script. Process name: $ProcessName"
}
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$cores = [Environment]::ProcessorCount
$samples = New-Object System.Collections.Generic.List[object]
$previousCpu = @{}
$previousAt = $null
$startedAt = Get-Date
$finishAt = $startedAt.AddSeconds($DurationSeconds)

Write-Host "Measuring $ProcessName for $DurationSeconds seconds ($Label)..."
Write-Host "Keep the app idle for an idle test, or use a consistent workload for a busy test."

while ((Get-Date) -lt $finishAt) {
    $now = Get-Date
    $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Warning "Application process ended during measurement."
        break
    }

    $totalCpu = 0.0
    $workingSet = 0L
    $privateMem = 0L
    $currentCpu = @{}
    foreach ($p in $procs) {
        $currentCpu[$p.Id] = [double]$p.CPU
        $workingSet += [long]$p.WorkingSet64
        $privateMem += [long]$p.PrivateMemorySize64
        if ($previousAt -ne $null -and $previousCpu.ContainsKey($p.Id)) {
            $totalCpu += [math]::Max(0, [double]$p.CPU - [double]$previousCpu[$p.Id])
        }
    }

    $cpuPercent = $null
    if ($previousAt -ne $null) {
        $elapsed = ($now - $previousAt).TotalSeconds
        if ($elapsed -gt 0) {
            $cpuPercent = [math]::Round((100 * $totalCpu) / ($elapsed * $cores), 2)
        }
    }

    $samples.Add([pscustomobject]@{
        RecordedAt        = $now.ToString("o")
        Label             = $Label
        ProcessCount      = $procs.Count
        CpuPercentOfPC    = $cpuPercent
        WorkingSetMB      = [math]::Round($workingSet / 1MB, 2)
        PrivateMemoryMB   = [math]::Round($privateMem / 1MB, 2)
    })
    $previousAt = $now
    $previousCpu = $currentCpu
    Start-Sleep -Seconds $IntervalSeconds
}

if ($samples.Count -eq 0) { throw "No samples collected." }
$safeLabel = $Label -replace '[^a-zA-Z0-9_-]', '_'
$file = Join-Path $OutputDirectory ("lottery-performance-{0}-{1}.csv" -f $safeLabel, (Get-Date -Format 'yyyyMMdd-HHmmss'))
$samples | Export-Csv -Path $file -NoTypeInformation -Encoding UTF8
$cpuValues = @($samples | Where-Object { $null -ne $_.CpuPercentOfPC } | ForEach-Object { $_.CpuPercentOfPC })
$avgCpu = if ($cpuValues.Count) { [math]::Round(($cpuValues | Measure-Object -Average).Average,2) } else { "n/a" }
$peakMem = [math]::Round(($samples | Measure-Object -Property WorkingSetMB -Maximum).Maximum,2)
$avgMem = [math]::Round(($samples | Measure-Object -Property WorkingSetMB -Average).Average,2)
Write-Host "Samples: $($samples.Count)"
Write-Host "CPU average (percent of total logical CPU capacity): $avgCpu"
Write-Host "Working set average: $avgMem MB; peak: $peakMem MB"
Write-Host "CSV report: $file"
