# Installs the `ion` command from this folder (Windows PowerShell or PowerShell 7).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Require($command, $help) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        Write-Host "ion install: '$command' was not found. $help" -ForegroundColor Red
        exit 1
    }
}

Require "node" "Install Node.js 20 or newer from https://nodejs.org"
Require "npm" "npm comes with Node.js; reinstall Node.js from https://nodejs.org"

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
    Write-Host "ion install: Node.js $major is too old. Ion needs Node.js 20 or newer." -ForegroundColor Red
    exit 1
}

Write-Host "Installing packages..."
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Making the 'ion' command available everywhere..."
npm link
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Open a new terminal and run:  ion --version" -ForegroundColor Green
