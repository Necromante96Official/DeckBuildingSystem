@echo off
REM Atalho: so faz commit/push da pasta docs/ ja gerada (sem npm build).
cd /d "%~dp0"
call "%~dp0Publicar-GitHub-Pages.bat" --push-only
