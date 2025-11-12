# Backend Scripts

This directory contains utility scripts for managing and testing the calling agent system.

## Directory Structure

```
scripts/
├── db/             Database utility scripts
├── deploy/         Deployment scripts
├── maintenance/    Cleanup and maintenance scripts
└── testing/        Testing and validation scripts
```

## Database Scripts (`db/`)

Utilities for managing agents and phone numbers in MongoDB:

- `list-agents.js` - List all agents with full details
- `list-agents-simple.js` - List agents with IDs (simplified)
- `activate-agent.js` - Activate a specific agent
- `add-phone-number.js` - Add phone numbers to the database
- `update-phone-number.js` - Update existing phone numbers
- `verify-phone.js` - Verify phone number configuration
- `fix-phone-format.js` - Fix phone number formatting
- `list-phones.js` - List all phone numbers in system

**Usage:**
```bash
cd backend/scripts/db
node list-agents-simple.js
node activate-agent.js
```

## Testing Scripts (`testing/`)

Scripts for testing knowledge base and vector search functionality:

- `test-kb-retrieval.js` - Test knowledge base retrieval
- `test-kb-simple.js` - Simplified KB testing
- `test-vector-search.js` - Test MongoDB Atlas vector search
- `quick-kb-test.sh` - Bash script to orchestrate KB tests

**Usage:**
```bash
cd backend/scripts/testing
node test-kb-simple.js
```

## Deployment Scripts (`deploy/`)

Scripts for deploying services:

- `DEPLOY_DEEPGRAM_NOW.sh` - Deploy Deepgram STT service
- `deploy-fix.sh` - Generic deployment fixes

**Usage:**
```bash
cd backend/scripts/deploy
bash DEPLOY_DEEPGRAM_NOW.sh
```

## Maintenance Scripts (`maintenance/`)

Scripts for code cleanup and maintenance:

- `cleanup-logs.py` - Remove verbose logging from TypeScript files
- `cleanup-logs.ps1` - PowerShell version of log cleanup

**Usage:**
```bash
cd backend/scripts/maintenance
python cleanup-logs.py
```

---

**Note:** All scripts assume they are run from their respective directories and use relative paths to access the backend `.env` file.
