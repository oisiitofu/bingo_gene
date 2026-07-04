@echo off
setlocal
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome was not found.
  pause
  exit /b 1
)
set "PROFILE=%TEMP%\team-bingo-autoplay-profile"
start "" "%CHROME%" --user-data-dir="%PROFILE%" --autoplay-policy=no-user-gesture-required "http://127.0.0.1:8765/index.html"
