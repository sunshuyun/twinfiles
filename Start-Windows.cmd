@echo off
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/ and run this file again.
  pause
  popd
  exit /b 1
)
node bin\twinfiles.mjs --wizard
set "twinfilesExitCode=%errorlevel%"
echo.
pause
popd
exit /b %twinfilesExitCode%
