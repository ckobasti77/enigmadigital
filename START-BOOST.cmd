@echo off
setlocal
title Enigma UI/UX boost
cd /d "%~dp0"
echo.
echo   Enigma UI/UX boost - ne zatvaraj ovaj prozor.
echo   Rezime: nocni-run\logs\boost\REZIME-BOOST.md
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nocni-run\run-boost.ps1" -BezOdbrojavanja %*
echo.
echo   Runner je zavrsio ili je zaustavljen. Pogledaj nocni-run\logs\boost\REZIME-BOOST.md
echo   Ista komanda (dupli klik na START-BOOST.cmd) nastavlja gde je stao.
pause
