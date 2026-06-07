@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo  IGS Lanchonete PRO - Banco do Render
echo ==========================================
echo.
echo Este comando atualiza o schema do banco usando:
echo   npx.cmd prisma db push
echo.
echo Procurando DATABASE_URL salva em .env.render.local...
echo.

if exist ".env.render.local" (
  for /f "usebackq delims=" %%A in (".env.render.local") do (
    set "DATABASE_URL=%%A"
    goto database_url_loaded
  )
)

echo Nao encontrei .env.render.local.
echo Cole a DATABASE_URL completa do Render abaixo.
echo Ela deve comecar com postgresql://
set /p DATABASE_URL=DATABASE_URL: postgresql://taberna_postgres_user:Q9EYNqdt6cjNtQ2y6tgApke3uzsMRVCJ@dpg-d8i946btqb8s73ato8lg-a.oregon-postgres.render.com/taberna_postgres

:database_url_loaded

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

echo.
echo Rodando prisma db push no banco do Render...
npx.cmd prisma db push
if errorlevel 1 (
  echo.
  echo ERRO: nao consegui atualizar o banco.
  echo Confira se a DATABASE_URL esta correta e tente novamente.
  pause
  exit /b 1
)

echo.
echo Pronto. Banco do Render atualizado.
echo.
pause
