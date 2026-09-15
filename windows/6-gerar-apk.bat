@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0.."
title money - gerar APK

echo.
echo   money - empacotar como APK ^(Capacitor^)
echo   ====================================================
echo.
echo   So faca isto se o PWA instalado nao bastar. O APK
echo   ganha: atalho do sistema, widget e permissao de
echo   notificacao. Custa ~8 GB de Android Studio + SDK.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node nao encontrado. Rode 2-instalar.bat.
  pause
  exit /b 1
)

if "%JAVA_HOME%"=="" (
  echo   [aviso] JAVA_HOME nao definido.
  echo           O Android Studio instala um JDK proprio; aponte
  echo           JAVA_HOME para ele, por exemplo:
  echo             C:\Program Files\Android\Android Studio\jbr
  echo.
)
if not "%ANDROID_HOME%"=="" goto :sdk_ok
if not "%ANDROID_SDK_ROOT%"=="" goto :sdk_ok
echo   [aviso] ANDROID_HOME nao definido.
echo           Normalmente:
echo             %%LOCALAPPDATA%%\Android\Sdk
echo.
echo   Sem Android Studio instalado, baixe antes:
echo     https://developer.android.com/studio
echo.
set /p SEGUIR="Continuar mesmo assim? [s/N] "
if /i not "%SEGUIR%"=="s" exit /b 0
:sdk_ok

echo   ----------------------------------------------------
echo   Instalando o Capacitor
echo   ----------------------------------------------------
call npm install @capacitor/core @capacitor/cli @capacitor/android --no-audit --no-fund
if errorlevel 1 (
  echo   Falhou. Verifique sua conexao.
  pause
  exit /b 1
)

if not exist "capacitor.config.json" if not exist "capacitor.config.ts" (
  echo.
  echo   Inicializando o projeto nativo...
  call npx cap init money br.com.guigasalim.money --web-dir=docs
)

if not exist "android" (
  echo.
  echo   Adicionando a plataforma Android...
  call npx cap add android
)

echo.
echo   Sincronizando docs/ para o projeto nativo...
call npx cap sync android
if errorlevel 1 (
  echo   Sync falhou.
  pause
  exit /b 1
)

echo.
echo   ----------------------------------------------------
echo   Gerando o APK de depuracao
echo   ----------------------------------------------------
pushd android
call gradlew.bat assembleDebug
set ERRO=%ERRORLEVEL%
popd

if not "%ERRO%"=="0" (
  echo.
  echo   O Gradle falhou. Quase sempre e JAVA_HOME ou o SDK.
  echo   Abra no Android Studio para ele resolver sozinho:
  echo     npx cap open android
  echo.
  pause
  exit /b 1
)

echo.
echo   ====================================================
echo   APK gerado em:
echo     android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo   Instalar no celular conectado:
echo     adb install -r android\app\build\outputs\apk\debug\app-debug.apk
echo.
set /p INSTALAR="Instalar agora no aparelho conectado? [s/N] "
if /i "%INSTALAR%"=="s" (
  adb install -r "android\app\build\outputs\apk\debug\app-debug.apk"
)
echo.
pause
endlocal
