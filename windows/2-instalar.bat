@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0.."
title money - instalar dependencias

echo.
echo   money - instalacao de dependencias
echo   ====================================================
echo.

where winget >nul 2>&1
if errorlevel 1 (
  echo   winget nao encontrado. Ele vem com o "App Installer" da
  echo   Microsoft Store. Instale por la, ou baixe manualmente:
  echo.
  echo     Git      https://git-scm.com/download/win
  echo     Node LTS https://nodejs.org/
  echo     GitHub   https://cli.github.com/
  echo.
  goto :npm
)

echo   Instalando o que faltar via winget.
echo   Programas ja instalados sao apenas ignorados.
echo.

call :instalar Git.Git                "Git"
call :instalar OpenJS.NodeJS.LTS      "Node.js LTS"
call :instalar GitHub.cli             "GitHub CLI"
call :instalar Google.PlatformTools   "ADB / platform-tools"

echo.
echo   ----------------------------------------------------
echo   IMPORTANTE: se algo foi instalado agora, FECHE esta
echo   janela e abra outra antes de continuar. O PATH so
echo   atualiza em terminal novo.
echo   ----------------------------------------------------
echo.

:npm
where npm >nul 2>&1
if errorlevel 1 (
  echo   npm ainda nao esta no PATH. Abra um terminal novo e
  echo   rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo   Instalando dependencias do projeto...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   npm install falhou. Verifique sua conexao.
  pause
  exit /b 1
)

echo.
echo   ====================================================
echo   Pronto. Proximo passo:  3-configurar-git.bat
echo.
pause
exit /b 0

:instalar
echo   ^> %~2
winget install --id %~1 --exact --silent --accept-source-agreements --accept-package-agreements >nul 2>&1
if errorlevel 1 (
  echo     ja estava instalado, ou precisa ser instalado a mao
) else (
  echo     instalado
)
goto :eof
