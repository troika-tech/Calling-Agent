@echo off
echo ================================
echo AI Calling Platform - Quick Start
echo ================================
echo.

echo [1/3] Starting Redis...
docker-compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start Redis. Is Docker Desktop running?
    pause
    exit /b 1
)
echo Redis started successfully!
echo.

echo [2/3] Waiting for Redis to be ready...
timeout /t 3 /nobreak > nul
echo.

echo [3/3] Starting Backend Server...
cd backend
echo Backend will start on http://localhost:5000
echo Press Ctrl+C to stop the server
echo.
npm run dev
