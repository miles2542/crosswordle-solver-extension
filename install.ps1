# Capture the terminal's window handle IMMEDIATELY at start
# At this point, the terminal IS the foreground window.
$terminalCode = @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
Add-Type -TypeDefinition $terminalCode
$terminalHandle = [WinAPI]::GetForegroundWindow()

$ErrorActionPreference = "SilentlyContinue"
$installRoot = "$env:LOCALAPPDATA\CrosswordlePlus"
$extPath = "$installRoot\extension"
$chromeUrl = "chrome://extensions"

function Get-Focus {
    # Ensure window is restored if minimized
    [WinAPI]::ShowWindow($terminalHandle, 9) | Out-Null # 9 = SW_RESTORE
    
    # Tap Alt to unlock focus-stealing prevention
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.SendKeys('%')
    
    # Jump back to terminal
    [WinAPI]::SetForegroundWindow($terminalHandle) | Out-Null
}

Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      Crosswordle++ Installer             " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Setup Files
Write-Host "[1/4] Preparing files..." -ForegroundColor Yellow
if (Test-Path $installRoot) { Remove-Item -Path $extPath -Recurse -Force }
New-Item -ItemType Directory -Path $extPath -Force | Out-Null

$srcPath = Join-Path $PSScriptRoot "dist"
if (!(Test-Path $srcPath)) { $srcPath = $PSScriptRoot }
Copy-Item -Path "$srcPath\*" -Destination $extPath -Recurse -Force
Write-Host "      Done! Extension files are ready." -ForegroundColor Gray

# 2. Chrome Check
Write-Host ""
Write-Host "[2/4] Checking Chrome..." -ForegroundColor Yellow
$chromeProc = Get-Process chrome
if (!$chromeProc) {
    Write-Host "      Chrome isn't running. Starting it now..." -ForegroundColor Gray
    Start-Process "chrome"
    # Delay to ensure Chrome window is initialized
    Start-Sleep -Seconds 3
    Get-Focus
} else {
    Write-Host "      Chrome is already running. Excellent." -ForegroundColor Gray
}

# 3. Step 1: Open Extensions Page
Write-Host ""
Write-Host "[3/4] Opening the 'Secret' page..." -ForegroundColor Yellow
$chromeUrl | Set-Clipboard
Write-Host "      I've copied the magic address to your clipboard." -ForegroundColor Cyan
Write-Host "      --> ACTION: Go to Chrome, open a NEW TAB, PASTE (Ctrl+V) and press Enter." -ForegroundColor Green
Write-Host ""
Read-Host "      Press [Enter] once you see the Extensions page in Chrome..."
Get-Focus

# 4. Step 2: Install Location
Write-Host ""
Write-Host "[4/4] Loading the extension..." -ForegroundColor Yellow
$extPath | Set-Clipboard
Write-Host "      I've now copied the installation path to your clipboard." -ForegroundColor Cyan
Write-Host "      --> ACTION IN CHROME:" -ForegroundColor Green
Write-Host "      1. Turn ON 'Developer mode' (top right corner toggle)."
Write-Host "      2. Click 'Load unpacked' (button on the top left)."
Write-Host "      3. PASTE (Ctrl+V) into the folder box that pops up and press Enter."
Write-Host "      4. Click 'Select Folder' to finish."
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      🎉 ALL DONE! Check your Chrome.     " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now close this window."
Pause
