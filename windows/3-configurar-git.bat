@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0.."
title money - configurar git e publicar

set USUARIO=guigasalim
set NOME=Guilherme Salim
set EMAIL=guigasalim@hotmail.com
set REPO_APP=money
set REPO_DADOS=money-data

echo.
echo   money - configuracao do git
echo   ====================================================
echo.
echo   Conta pessoal: %USUARIO%  ^<%EMAIL%^>
echo.
echo   Esta identidade e gravada SO neste repositorio.
echo   A configuracao global da maquina nao e tocada -- e o
echo   que mantem financas pessoais fora da conta da empresa.
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo   Git nao encontrado. Rode 2-instalar.bat primeiro.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo   Iniciando repositorio...
  git init -q
)

git config user.name "%NOME%"
git config user.email "%EMAIL%"
git branch -M main >nul 2>&1
echo   [ ok ]   identidade e branch main configuradas

git rev-parse HEAD >nul 2>&1
if errorlevel 1 (
  git add -A
  git commit -q -m "money: primeiro commit"
  echo   [ ok ]   primeiro commit criado
)

git remote get-url origin >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%r in ('git remote get-url origin') do echo   [ ok ]   origin ja existe: %%r
  goto :push
)

where gh >nul 2>&1
if errorlevel 1 goto :manual

echo.
echo   ----------------------------------------------------
echo   Criando os repositorios com o GitHub CLI
echo   ----------------------------------------------------
gh auth status >nul 2>&1
if errorlevel 1 (
  echo   Voce ainda nao esta autenticado. Abrindo o login...
  echo   Escolha: GitHub.com  ^>  HTTPS  ^>  autenticar pelo navegador
  echo.
  gh auth login
  if errorlevel 1 (
    echo   Login nao concluido.
    pause
    exit /b 1
  )
)

echo   ^> repositorio PRIVADO dos dados: %REPO_DADOS%
gh repo view %USUARIO%/%REPO_DADOS% >nul 2>&1
if errorlevel 1 (
  gh repo create %REPO_DADOS% --private --add-readme -d "Dados do app money - privado"
  if errorlevel 1 (
    echo     falhou -- crie a mao em https://github.com/new
  ) else (
    echo     criado
  )
) else (
  echo     ja existia
)

echo   ^> repositorio PUBLICO do app: %REPO_APP%
gh repo create %REPO_APP% --public --source=. --remote=origin --push -d "Controle de orcamento pessoal, PWA offline-first"
if errorlevel 1 (
  echo     nao foi possivel criar/publicar automaticamente
  goto :manual
)
echo     criado e enviado

echo.
echo   ^> ligando o GitHub Pages ^(main /docs^)
gh api -X POST repos/%USUARIO%/%REPO_APP%/pages -f "source[branch]=main" -f "source[path]=/docs" >nul 2>&1
if errorlevel 1 (
  gh api -X PUT repos/%USUARIO%/%REPO_APP%/pages -f "source[branch]=main" -f "source[path]=/docs" >nul 2>&1
)
if errorlevel 1 (
  echo     ligue a mao: Settings ^> Pages ^> Source: main / pasta /docs
) else (
  echo     ligado
)
goto :fim

:push
echo.
echo   Enviando para o origin...
git push -u origin main
if errorlevel 1 (
  echo   push falhou. Confira suas credenciais do GitHub.
  pause
  exit /b 1
)
goto :fim

:manual
echo.
echo   ----------------------------------------------------
echo   Passo manual ^(GitHub CLI indisponivel^)
echo   ----------------------------------------------------
echo   1. Crie em https://github.com/new
echo        %REPO_DADOS%  ^-^>  PRIVADO, com README
echo        %REPO_APP%    ^-^>  PUBLICO, vazio
echo   2. Depois rode, nesta pasta:
echo        git remote add origin https://github.com/%USUARIO%/%REPO_APP%.git
echo        git push -u origin main
echo   3. Em %REPO_APP%: Settings ^> Pages ^> Source: main / pasta /docs
echo.

:fim
echo.
echo   ====================================================
echo   App:    https://%USUARIO%.github.io/%REPO_APP%/
echo   Dados:  https://github.com/%USUARIO%/%REPO_DADOS%  ^(privado^)
echo.
echo   O Pages leva ate uns 2 minutos para publicar na
echo   primeira vez.
echo.
echo   Falta so o token: 
echo     https://github.com/settings/personal-access-tokens/new
echo     - Only select repositories  ^-^>  %REPO_DADOS%
echo     - Repository permissions ^> Contents: Read and write
echo   e colar em Ajustes ^> Sincronizacao, dentro do app.
echo.
pause
exit /b 0
