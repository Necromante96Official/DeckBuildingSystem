# Resolve PID do CMD pai do powershell auxiliar. So imprime digitos.
$ErrorActionPreference = "Continue"
$parent = 0
try {
  $me = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $PID)
  if ($me -and $me.ParentProcessId) { $parent = [int]$me.ParentProcessId }
} catch { }

if ($parent -gt 0) {
  Write-Output $parent
  exit 0
}
Write-Output 0
exit 0
