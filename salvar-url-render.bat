@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo  IGS Lanchonete PRO - Salvar URL Render
echo ==========================================
echo.
echo Cole a DATABASE_URL completa do Render.
echo Ela sera salva em .env.render.local, que nao vai para o GitHub.
echo.
set /p DATABASE_URL=DATABASE_URL: 

if "%DATABASE_URL%"=="" (
  echo.
  echo ERRO: DATABASE_URL vazia.
  pause
  exit /b 1
)

if /i "%DATABASE_URL:sslmode=%"=="%DATABASE_URL%" (
  if "%DATABASE_URL:?=%"=="%DATABASE_URL%" (
    set "DATABASE_URL=%DATABASE_URL%?sslmode=require"
  ) else (
    set "DATABASE_URL=%DATABASE_URL%&sslmode=require"
  )
)

> ".env.render.local" echo %DATABASE_URL%

echo.
echo Pronto. DATABASE_URL salva em .env.render.local.
echo Agora voce pode usar atualizar-banco-render.bat sem colar a URL.
echo.
pause
