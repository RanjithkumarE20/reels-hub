# Starts Reels Hub automatically (hidden) every time you log in to Windows, so the feeds keep updating.
#   Install:   powershell -ExecutionPolicy Bypass -File install-autostart.ps1
#   Remove:    powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove
param([switch]$Remove, [string]$TaskName = "Reels Hub")

if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed '$TaskName'."
    return
}

$dir  = $PSScriptRoot
$node = (Get-Command node).Source
New-Item -ItemType Directory -Force (Join-Path $dir "logs") | Out-Null
$cmd  = "cd /d `"$dir`" && `"$node`" server.js >> logs\server.log 2>&1"

$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd" -WorkingDirectory $dir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed. Reels Hub now starts at login: http://localhost:4321"
