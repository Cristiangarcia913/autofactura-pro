@echo off
title AutoFactura Pro
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js. Descargalo en https://nodejs.org
  echo  ^(boton "LTS"^), instalalo y vuelve a hacer doble clic aqui.
  echo.
  pause
  exit /b
)

if not exist .env (
  copy .env.example .env >nul
  powershell -NoProfile -Command "(Get-Content .env) -replace 'MOCK_AI=0','MOCK_AI=1' | Set-Content .env"
)

if not exist node_modules (
  echo.
  echo  Primera vez: instalando. Tarda 1-2 minutos, no cierres esta ventana...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Algo ha fallado en la instalacion. Haz una foto o copia este texto y enviaselo a Claude.
    pause
    exit /b
  )
)

echo.
echo  Arrancando AutoFactura Pro...
echo  Se abrira el navegador en unos segundos.
echo  PARA APAGARLA: cierra esta ventana negra.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm start
echo.
echo  La aplicacion se ha detenido. Si ves un error arriba, copialo y enviaselo a Claude.
pause
