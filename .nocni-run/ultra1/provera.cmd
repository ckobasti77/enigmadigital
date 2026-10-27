@echo off
rem Provera pre noci: selftest claude CLI-ja + pocetne provere projekta. Ne pokrece korake.
title NOCNI RUN - provera
cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0nocni-run.ps1" -SelfTestOnly %*
