@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  Forbidden Legacy - Publicar no GitHub Pages (pasta docs/)
echo  Dica: Publicar-GitHub-Pages.bat --push-only  = so commit/push (docs/ ja pronto)
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERRO] git nao encontrado no PATH.
  pause
  exit /b 1
)

if /I "%~1"=="--push-only" goto PUSH_ONLY

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
if not exist "docs\data\cards.json" (
  echo [ERRO] docs\data\cards.json nao foi gerado.
  pause
  exit /b 1
)

goto DO_PUSH

:PUSH_ONLY
echo [skip] Build omitido (--push-only). Usando docs/ atual.
if not exist "docs\index.html" (
  echo [ERRO] docs\index.html em falta. Corre sem --push-only primeiro.
  pause
  exit /b 1
)
if not exist "docs\data\cards.json" (
  echo [ERRO] docs\data\cards.json em falta. Corre sem --push-only primeiro.
  pause
  exit /b 1
)
type nul > "docs\.nojekyll"

:DO_PUSH
echo [4/4] Ajustando remote e fazendo commit/push...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/Necromante96Official/DeckBuildingSystem.git
) else (
  git remote set-url origin https://github.com/Necromante96Official/DeckBuildingSystem.git
)
git add -A
git status --short
git diff --cached --stat

git commit -m "Align project with DeckBuildingSystem GitHub Pages"
if errorlevel 1 (
  echo.
  echo Nenhum commit novo (talvez ja estava atualizado). Continuando push...
)

git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo [ERRO] git push falhou. Verifica o remote e as credenciais.
  echo Remote esperado: https://github.com/Necromante96Official/DeckBuildingSystem.git
  pause
  exit /b 1
)

echo.
echo ========================================
echo  Push OK.
echo  No GitHub: Settings -^> Pages -^> Source:
echo    Deploy from a branch
echo    Branch: main  /  pasta: /docs
echo  Site: https://necromante96official.github.io/DeckBuildingSystem/
echo ========================================
echo.
pause
exit /b 0
