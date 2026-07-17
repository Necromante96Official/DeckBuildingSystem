@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  Forbidden Legacy - Publicar no GitHub Pages (pasta docs/)
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
where git >nul 2>&1
if errorlevel 1 (
  echo [ERRO] git nao encontrado no PATH.
  pause
  exit /b 1
)

echo [1/4] npm install...
call npm install
if errorlevel 1 (
  echo [ERRO] npm install falhou.
  pause
  exit /b 1
)

echo [2/4] Build do site em docs/ (artes locais, sem download)...
call npm run build -- --no-download
if errorlevel 1 (
  echo [ERRO] Build falhou.
  pause
  exit /b 1
)

echo [3/4] Criando docs\.nojekyll...
type nul > "docs\.nojekyll"

if not exist "docs\index.html" (
  echo [ERRO] docs\index.html nao foi gerado.
  pause
  exit /b 1
)
if not exist "docs\app.js" (
  echo [ERRO] docs\app.js nao foi gerado.
  pause
  exit /b 1
)

echo [4/4] Commit e push...
git add -A
git status --short
git diff --cached --stat

git commit -m "Publish site to docs/ for GitHub Pages"
if errorlevel 1 (
  echo.
  echo Nenhum commit novo (talvez ja estava atualizado). Continuando push...
)

git push
if errorlevel 1 (
  echo.
  echo [ERRO] git push falhou. Verifica o remote e as credenciais.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  Push OK.
echo  No GitHub: Settings -^> Pages -^> Source:
echo    Deploy from a branch
echo    Branch: main (ou master)  /  pasta: /docs
echo  Depois abre: https://SEU-USUARIO.github.io/SEU-REPO/
echo ========================================
echo.
pause
exit /b 0
