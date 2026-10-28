@echo off
rem Nocni run: dupli klik pokrece run (ili nastavlja od prvog nezavrsenog koraka).
rem Argumenti se prosledjuju runneru, npr. iz terminala: pokreni.cmd -From K05
title NOCNI RUN
cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0nocni-run.ps1" %*
