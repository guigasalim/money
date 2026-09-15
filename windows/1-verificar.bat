@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0.."
title money - verificacao do ambiente

rem Fluxo por goto, nao por blocos entre parenteses: texto com "(" ou ")"
rem dentro de um bloco fecha o bloco antes da hora e derruba o script.

echo.
echo   money - verificacao do ambiente
echo   ====================================================
echo.

set FALTA=0

call :checar git    "git --version"    "Git"                  1
call :checar node   "node --version"   "Node.js"              1
call :checar npm    "npm --version"    "npm"                  1
call :checar gh     "gh --version"     "GitHub CLI"           0
call :checar adb    "adb --version"    "ADB para o celular"   0
call :checar winget "winget --version" "winget instalador"    0

echo.
echo   ----------------------------------------------------
echo   Dependencias do projeto
echo   ----------------------------------------------------
if exist "node_modules\jsdom" goto :deps_ok
echo   [falta]  node_modules   - rode 2-instalar.bat
set FALTA=1
goto :repo
:deps_ok
echo   [ ok ]   node_modules instalado

:repo
echo.
echo   ----------------------------------------------------
echo   Repositorio
echo   ----------------------------------------------------
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :sem_repo

for /f "delims=" %%b in ('git branch --show-current 2^>nul') do echo   [ ok ]   branch atual: %%b
for /f "delims=" %%e in ('git config user.email 2^>nul') do echo   [info]   autor: %%e
git remote get-url origin >nul 2>&1
if errorlevel 1 goto :sem_remote
for /f "delims=" %%r in ('git remote get-url origin') do echo   [ ok ]   origin: %%r
goto :resumo

:sem_remote
echo   [falta]  sem remote origin   - rode 3-configurar-git.bat
goto :resumo

:sem_repo
echo   [falta]  esta pasta nao e um repositorio git

:resumo
echo.
echo   ====================================================
if "%FALTA%"=="1" goto :falta
echo   Ambiente pronto. Proximo passo:  4-testar-pc.bat
goto :fim
:falta
echo   Falta coisa. Rode:  2-instalar.bat
:fim
echo.
pause
exit /b 0

rem  %1 comando   %2 como pegar a versao   %3 nome   %4 1=obrigatorio
:checar
where %~1 >nul 2>&1
if not errorlevel 1 goto :checar_ok
if "%~4"=="1" goto :checar_obrigatorio
echo   [ -- ]   %~3   - opcional, nao instalado
goto :eof
:checar_obrigatorio
echo   [falta]  %~3   - obrigatorio
set FALTA=1
goto :eof
:checar_ok
for /f "delims=" %%v in ('%~2 2^>nul') do (
  echo   [ ok ]   %~3   %%v
  goto :eof
)
echo   [ ok ]   %~3
goto :eof
