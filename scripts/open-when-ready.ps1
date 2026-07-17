# Abre o browser assim que a porta responder.
param([int]$Port = 5177, [int]$Tries = 120)

$ErrorActionPreference = "Continue"
$url = "http://127.0.0.1:$Port/"

function Test-Tcp([int]$ms) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne($ms, $false) -and $client.Connected
    try { $client.Close() } catch { }
    return $ok
  } catch {
    return $false
  }
}

for ($i = 0; $i -lt 40; $i++) {
  if (-not (Test-Tcp 300)) { break }
  Start-Sleep -Milliseconds 250
}

for ($i = 0; $i -lt $Tries; $i++) {
  if (Test-Tcp 800) {
    Start-Sleep -Milliseconds 400
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
exit 1
