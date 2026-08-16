# Quick copy script: Run this in PowerShell to copy the entire project to Desktop
$Source = "$PSScriptRoot"
$Dest   = "$env:USERPROFILE\Desktop\OpsWatch-API"
Write-Host "Copying OpsWatch-API from: $Source"
Write-Host "                     To: $Dest"
if (Test-Path $Dest) {
  Remove-Item -Recurse -Force $Dest
}
Copy-Item -Recurse -Force $Source $Dest
Write-Host ""
Write-Host "✅ Done! Now open PowerShell in Desktop\OpsWatch-API and run:" -ForegroundColor Green
Write-Host "   npm install" -ForegroundColor Cyan
Write-Host "   npm start"   -ForegroundColor Cyan
