# Encerra instancia anterior da Criacao de Deck (porta, CMD, tray).
param(
  [int]$Port = 5177,
  [string]$WindowTitle = "Criacao de Deck - Forbidden Legacy",
  [string]$ExcludePid = "0",
  [string]$Root = ""
)

$ErrorActionPreference = "Continue"
$excludeParsed = 0
$excludeOk = [int]::TryParse(($ExcludePid -as [string]), [ref]$excludeParsed)
$ExcludePidInt = if ($excludeOk -and $excludeParsed -gt 0) { $excludeParsed } else { 0 }
$Root = if ($Root) { $Root.TrimEnd('\', '/').ToLowerInvariant() } else { "" }

function Get-ListenerPids {
  $pids = New-Object System.Collections.Generic.List[int]
  try {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { if ($_.OwningProcess) { [void]$pids.Add([int]$_.OwningProcess) } }
  } catch { }
  try {
    $pattern = ":$Port\s+\S+\s+LISTENING\s+(\d+)"
    foreach ($line in (netstat -ano -p tcp 2>$null)) {
      if ($line -match $pattern) {
        $p = [int]$Matches[1]
        if (-not $pids.Contains($p)) { [void]$pids.Add($p) }
      }
    }
  } catch { }
  return $pids
}

function Stop-PidTree([int]$procId) {
  if ($procId -le 0) { return }
  if ($ExcludePidInt -gt 0 -and $procId -eq $ExcludePidInt) { return }
  try { taskkill /PID $procId /T /F 2>$null | Out-Null } catch { }
}

foreach ($p in (Get-ListenerPids)) { Stop-PidTree $p }

try {
  Get-Process -Name cmd, powershell, pwsh -ErrorAction SilentlyContinue | ForEach-Object {
    if ($ExcludePidInt -gt 0 -and $_.Id -eq $ExcludePidInt) { return }
    $t = $_.MainWindowTitle
    if ($t -and ($t -eq $WindowTitle -or $t.StartsWith($WindowTitle))) {
      Stop-PidTree $_.Id
    }
  }
} catch { }

try {
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($ExcludePidInt -gt 0 -and $_.ProcessId -eq $ExcludePidInt) { return }
      $cmd = $_.CommandLine
      if (-not $cmd) { return }
      $hit =
        ($cmd -match 'tray-host\.ps1') -or
        ($cmd -match 'open-when-ready\.ps1') -or
        ($cmd -match 'stop-previous\.ps1')
      if (-not $hit) { return }
      if ($Root -and ($cmd.ToLowerInvariant().IndexOf($Root) -lt 0)) {
        if ($cmd -notmatch 'criacao-de-deck|cria[cç][aã]o-de-deck') { return }
      }
      Stop-PidTree ([int]$_.ProcessId)
    }
} catch { }

for ($i = 0; $i -lt 20; $i++) {
  $left = @(Get-ListenerPids)
  if ($left.Count -eq 0) { break }
  foreach ($p in $left) { Stop-PidTree $p }
  Start-Sleep -Milliseconds 250
}

Write-Host "Instancias anteriores encerradas (porta $Port)."
exit 0
