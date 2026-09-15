@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0.."
title money - testar no PC

set PORTA=8080
if not "%~1"=="" set PORTA=%~1

echo.
echo   money - teste no PC
echo   ====================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node nao encontrado. Rode 2-instalar.bat e reabra o terminal.
  pause
  exit /b 1
)

if not exist "node_modules\jsdom" (
  echo   Instalando dependencias...
  call npm install --no-audit --no-fund
  echo.
)

echo   ----------------------------------------------------
echo   Teste de fluxo
echo   ----------------------------------------------------
call npm test
if errorlevel 1 (
  echo.
  echo   O teste falhou. Nao vou subir o servidor.
  pause
  exit /b 1
)

echo.
echo   ----------------------------------------------------
echo   Subindo o servidor em localhost:%PORTA%
echo   ----------------------------------------------------
echo.
echo   Para conferir o modo offline:
echo     1. abra a pagina e deixe carregar
echo     2. desligue o Wi-Fi do PC
echo     3. recarregue - o app tem que abrir igual
echo.
echo   Para instalar como aplicativo no PC:
echo     icone de instalar na barra de endereco do Chrome/Edge
echo.

start "" "http://localhost:%PORTA%"
node scripts/servidor.mjs %PORTA%

endlocal
