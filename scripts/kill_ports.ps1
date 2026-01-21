param(
  [string]$Ports = "3000,3001"
)

$ErrorActionPreference = "SilentlyContinue"

$portList = @()
if ($Ports) {
  $portList = $Ports -split '[,\s]+' | Where-Object { $_ -and $_.Trim().Length -gt 0 } | ForEach-Object { [int]$_.Trim() }
}

foreach ($port in $portList) {
  $connections = Get-NetTCPConnection -LocalPort $port
  if (-not $connections) { continue }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    if (-not $processId) { continue }
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "[kill_ports] Killed PID $processId on port $port"
    } catch {
      Write-Host ("[kill_ports] Failed to kill PID {0} on port {1}: {2}" -f $processId, $port, $_.Exception.Message)
    }
  }
}
