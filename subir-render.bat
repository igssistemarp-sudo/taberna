@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  IGS Lanchonete PRO - Subir para Render
echo ==========================================
echo.
echo Este comando vai:
echo  1. Rodar o build do projeto
echo  2. Mostrar os arquivos alterados
echo  3. Criar um commit
echo  4. Enviar para o GitHub
echo.
echo O Render atualiza automaticamente depois do push.
echo Site: https://taberna.onrender.com/
echo.
echo Se o sistema local estiver rodando, feche antes de continuar.
echo.
pause

echo.
echo [1/4] Rodando build...
npm.cmd run build
if errorlevel 1 (
  echo.
  echo ERRO: o build falhou. Nada foi enviado.
  echo Veja a mensagem acima, corrija e rode este arquivo de novo.
  pause
  exit /b 1
)

echo.
echo [2/4] Arquivos alterados:
git status --short
echo.

set /p COMMIT_MSG=Digite a mensagem do commit: 
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Atualiza sistema"

echo.
echo [3/4] Criando commit...
git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo Nenhum commit foi criado. Talvez nao existam alteracoes novas.
  pause
  exit /b 1
)

echo.
echo [4/4] Enviando para o GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo ERRO: nao consegui enviar para o GitHub.
  echo Verifique login/conexao e tente novamente.
  pause
  exit /b 1
)

echo.
echo Pronto. Alteracoes enviadas.
echo O Render deve iniciar o deploy automaticamente.
echo Acompanhe em: https://taberna.onrender.com/
echo.
pause
