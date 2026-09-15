@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0.."
title money - testar no celular

set PORTA=8080
if not "%~1"=="" set PORTA=%~1

echo.
echo   money - teste no celular ^(RedMi via cabo USB^)
echo   ====================================================
echo.
echo   Por que por cabo e nao pelo IP da rede: service worker
echo   so funciona em HTTPS ou em localhost. Pelo IP da rede
echo   o app abre, mas sem offline e sem convite de instalar.
echo   O adb reverse faz o celular enxergar o PC como
echo   localhost, e ai vale como contexto seguro.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node nao encontrado. Rode 2-instalar.bat e reabra o terminal.
  pause
  exit /b 1
)

where adb >nul 2>&1
if errorlevel 1 (
  echo   ADB nao encontrado. Rode 2-instalar.bat, ou baixe:
  echo     https://developer.android.com/tools/releases/platform-tools
  echo.
  echo   Alternativa sem cabo: publique com 3-configurar-git.bat
  echo   e abra https://guigasalim.github.io/money/ no celular.
  echo.
  pause
  exit /b 1
)

echo   ----------------------------------------------------
echo   No RedMi, uma unica vez:
echo     Ajustes ^> Sobre o telefone ^> toque 7x em "Versao MIUI"
echo     Ajustes ^> Config. adicionais ^> Opcoes do desenvolvedor
echo       - ative "Depuracao USB"
echo       - ative "Instalar via USB" se aparecer
echo     Conecte o cabo e autorize o computador no popup.
echo   ----------------------------------------------------
echo.
echo   Procurando o aparelho...
adb start-server >nul 2>&1
adb devices

echo.
for /f "skip=1 tokens=1,2" %%a in ('adb devices') do (
  if "%%b"=="device" goto :conectado
  if "%%b"=="unauthorized" (
    echo   Aparelho conectado mas NAO autorizado.
    echo   Olhe a tela do celular e toque em "Permitir".
    echo.
    pause
    exit /b 1
  )
)

echo   Nenhum aparelho encontrado.
echo   Confira o cabo ^(precisa transferir dados, nao so carregar^)
echo   e a depuracao USB.
echo.
pause
exit /b 1

:conectado
echo   [ ok ]   aparelho conectado
echo.
adb reverse tcp:%PORTA% tcp:%PORTA%
if errorlevel 1 (
  echo   Falhou ao redirecionar a porta.
  pause
  exit /b 1
)
echo   [ ok ]   porta %PORTA% redirecionada para o celular
echo.
echo   ====================================================
echo   No Chrome do celular, abra:
echo.
echo       http://localhost:%PORTA%
echo.
echo   Depois: menu ^(tres pontos^) ^> Adicionar a tela inicial
echo   ou "Instalar aplicativo". Ele passa a abrir sem barra
echo   de navegador, com o icone do prisma.
echo.
echo   Testar offline: com o app ja aberto uma vez, tire o
echo   cabo e abra pelo icone. Tem que funcionar.
echo   ====================================================
echo.

node scripts/servidor.mjs %PORTA%

echo.
echo   Removendo o redirecionamento...
adb reverse --remove tcp:%PORTA% >nul 2>&1
endlocal
