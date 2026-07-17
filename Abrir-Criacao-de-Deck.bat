@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "WIN_TITLE=Criacao de Deck - Forbidden Legacy"
set "PORT=5177"

echo.
echo  Forbidden Legacy - Criacao de Deck
echo  .bat de novo = reinicia ^| Fechar pagina = encerra
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado no PATH.
  pause
  exit /b 1
)

echo A limpar instancia anterior...
node "%~dp0scripts\stop-port.mjs" %PORT%
taskkill /FI "WINDOWTITLE eq %WIN_TITLE%*" /F /T >nul 2>&1
timeout /t 1 /nobreak >nul

title %WIN_TITLE%

set "FL_CMD_PID="
for /f "tokens=2 delims=," %%A in ('tasklist /FI "WINDOWTITLE eq %WIN_TITLE%" /FO CSV /NH 2^>nul') do (
  if not defined FL_CMD_PID set "FL_CMD_PID=%%~A"
)
if not defined FL_CMD_PID set "FL_CMD_PID=0"
set "PORT=%PORT%"

echo A preparar...
call npm install
if errorlevel 1 (
  echo [ERRO] npm install falhou.
  pause
  exit /b 1
)
call npm run build -- --no-download
if errorlevel 1 (
  echo [ERRO] Build falhou.
  pause
  exit /b 1
)

echo Servidor: http://127.0.0.1:%PORT%/
start /b "" node "%~dp0scripts\wait-and-open.mjs" %PORT%
call npm run dev

set ERR=%ERRORLEVEL%
if not %ERR%==0 pause
exit /b %ERR%
