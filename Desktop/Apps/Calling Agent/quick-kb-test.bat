@echo off
REM Quick KB Test Script for Windows
REM Tests knowledge base with common queries

if "%1"=="" (
  echo.
  echo ❌ Please provide an agent ID
  echo.
  echo Usage: quick-kb-test.bat ^<agentId^>
  echo.
  echo To get agent IDs, run: node list-agents.js
  echo.
  exit /b 1
)

set AGENT_ID=%1

echo.
echo ==================================
echo 🧪 Quick KB Test for Agent: %AGENT_ID%
echo ==================================
echo.

REM Test 1: Feature query
echo 📋 Test 1: Product features query
echo ----------------------------------
node test-kb-retrieval.js "%AGENT_ID%" "What are the main features?"
echo.
echo Press Enter to continue to next test...
pause >nul

REM Test 2: How-to query
echo 📋 Test 2: How-to query
echo ----------------------------------
node test-kb-retrieval.js "%AGENT_ID%" "How do I get started?"
echo.
echo Press Enter to continue to next test...
pause >nul

REM Test 3: Specific information
echo 📋 Test 3: Specific information query
echo ----------------------------------
node test-kb-retrieval.js "%AGENT_ID%" "What is the pricing?"
echo.
echo Press Enter to continue to next test...
pause >nul

REM Test 4: Conversational (should warn)
echo 📋 Test 4: Conversational query (should warn)
echo ----------------------------------
node test-kb-retrieval.js "%AGENT_ID%" "Hello there"
echo.

echo ==================================
echo ✅ All tests complete!
echo ==================================
echo.
