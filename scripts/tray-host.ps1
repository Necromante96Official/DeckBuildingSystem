# Forbidden Legacy - Criacao de Deck (tray)
# Icone na bandeja: clique abre o browser. Nao esconde o CMD.
# Menu: abrir browser, mostrar CMD, sair.

param(
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [int]$Port = 5177,
  [int]$CmdPid = 0
)

$ErrorActionPreference = "Continue"

if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") {
  $relaunch = @(
    "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-Root", $Root,
    "-Port", "$Port",
    "-CmdPid", "$CmdPid"
  )
  Start-Process -FilePath "powershell.exe" -ArgumentList $relaunch -WindowStyle Hidden
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Native {
  public const int SW_RESTORE = 9;
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AttachConsole(uint dwProcessId);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool FreeConsole();
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
}
"@

$Url = "http://127.0.0.1:$Port/"
$Root = $Root.TrimEnd('\', '/')
$script:hwnd = [IntPtr]::Zero

function Get-ListenerPid {
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
  } catch { }
  try {
    $pattern = ":$Port\s+\S+\s+LISTENING\s+(\d+)"
    foreach ($line in (netstat -ano -p tcp 2>$null)) {
      if ($line -match $pattern) { return [int]$Matches[1] }
    }
  } catch { }
  return 0
}

function ConsoleHwndFromPid([int]$procId) {
  if ($procId -le 0) { return [IntPtr]::Zero }
  [Native]::FreeConsole() | Out-Null
  if (-not [Native]::AttachConsole([uint32]$procId)) { return [IntPtr]::Zero }
  $h = [Native]::GetConsoleWindow()
  [Native]::FreeConsole() | Out-Null
  if ($h -ne [IntPtr]::Zero -and [Native]::IsWindow($h)) { return $h }
  return [IntPtr]::Zero
}

function Resolve-ConsoleHwnd {
  $h = ConsoleHwndFromPid $CmdPid
  if ($h -ne [IntPtr]::Zero) { return $h }
  return (ConsoleHwndFromPid (Get-ListenerPid))
}

function Ensure-Hwnd {
  if ($script:hwnd -ne [IntPtr]::Zero -and [Native]::IsWindow($script:hwnd)) {
    return $script:hwnd
  }
  $script:hwnd = Resolve-ConsoleHwnd
  return $script:hwnd
}

function Show-Cmd {
  $h = Ensure-Hwnd
  if ($h -eq [IntPtr]::Zero) { return }
  [Native]::ShowWindow($h, [Native]::SW_RESTORE) | Out-Null
  [Native]::SetForegroundWindow($h) | Out-Null
}

function Stop-Server {
  $listenPid = Get-ListenerPid
  if ($listenPid -gt 0) {
    try { taskkill /PID $listenPid /T /F 2>$null | Out-Null } catch { }
  }
  if ($CmdPid -gt 0) {
    try { taskkill /PID $CmdPid /T /F 2>$null | Out-Null } catch { }
  }
}

$iconPath = Join-Path $Root "scripts\tray.ico"
if (Test-Path -LiteralPath $iconPath) {
  $icon = New-Object System.Drawing.Icon($iconPath)
} else {
  $icon = [System.Drawing.SystemIcons]::Application
}

[System.Windows.Forms.Application]::EnableVisualStyles()
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $icon
$notify.Text = "Forbidden Legacy - Criacao de Deck"
$notify.Visible = $true
$notify.BalloonTipTitle = "Criacao de Deck"
$notify.BalloonTipText = "Abre no browser. Fechar a pagina encerra tudo."
try { $notify.ShowBalloonTip(2500) } catch { }

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemOpen = $menu.Items.Add("Abrir no browser")
$itemShowCmd = $menu.Items.Add("Mostrar janela do servidor")
$itemExit = $menu.Items.Add("Sair (parar servidor)")
$notify.ContextMenuStrip = $menu

$notify.add_MouseClick({
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    Start-Process $Url | Out-Null
  }
})
$itemOpen.add_Click({ Start-Process $Url | Out-Null })
$itemShowCmd.add_Click({ Show-Cmd })
$itemExit.add_Click({
  $notify.Visible = $false
  Stop-Server
  [System.Windows.Forms.Application]::Exit()
})

$script:hwnd = Resolve-ConsoleHwnd

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
  # Se o servidor ainda nao subiu, nao sair; depois de ter estado up, sair se cair
  $pidListen = Get-ListenerPid
  if ($pidListen -gt 0) {
    $script:sawServer = $true
  } elseif ($script:sawServer) {
    $notify.Visible = $false
    Stop-Server
    [System.Windows.Forms.Application]::Exit()
  }
})
$script:sawServer = $false
$timer.Start()

[System.Windows.Forms.Application]::Run()
$timer.Stop()
$notify.Visible = $false
$notify.Dispose()
