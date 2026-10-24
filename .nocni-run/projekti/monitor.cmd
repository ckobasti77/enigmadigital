@echo off
rem Pracenje runa u drugom prozoru (samo cita).
title NOCNI RUN - monitor
cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0monitor.ps1"
