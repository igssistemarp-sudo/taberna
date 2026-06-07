@echo off
cd /d "%~dp0"
echo Iniciando IGS Lanchonete PRO...
echo.
echo API:  http://localhost:3333
echo Tela: http://localhost:5173
echo.
echo Abrindo a API primeiro. Aguarde ate ela ficar pronta...
echo.

start "IGS API" cmd /k "pushd ""%~dp0"" && set AUTO_SETUP=false && npm.cmd run dev:api"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=1; $i -le 40; $i++){ try { Invoke-WebRequest -UseBasicParsing 'http://localhost:3333/api/health' -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 1 } }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo.
  echo ERRO: a API nao respondeu em http://localhost:3333.
  echo Veja a janela "IGS API" para conferir o erro.
  pause
  exit /b 1
)

echo API pronta. Abrindo a tela...
echo.
start "IGS Tela" cmd /k "pushd ""%~dp0"" && npm.cmd run dev:web"

echo.
echo Aguarde o Vite mostrar:
echo   Local: http://localhost:5173/
echo.
echo Abra sempre: http://localhost:5173/
echo.
echo Para encerrar, feche as janelas "IGS API" e "IGS Tela".
echo.
pause
