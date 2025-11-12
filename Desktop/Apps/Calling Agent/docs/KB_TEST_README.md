# Knowledge Base Testing Tools

This directory contains tools to test and verify your Knowledge Base (KB) retrieval system.

## Quick Start

### 1. List Your Agents

```bash
node list-agents.js
```

This will show all your agents with their IDs:
```
🤖 Available Agents:

  1. ✅ Troika Agent
     ID: 6901dadc921a728c0e2e5fd9

  2. ✅ Support Agent
     ID: 690abc123def456789012345

Total: 2 agent(s)
```

### 2. Test KB Retrieval for an Agent

```bash
# Basic test with a single query
node test-kb-retrieval.js <agentId> "<your query>"

# Example
node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are the product features?"
```

### 3. Run Quick Multi-Query Test

**Windows:**
```batch
quick-kb-test.bat 6901dadc921a728c0e2e5fd9
```

**Linux/Mac:**
```bash
chmod +x quick-kb-test.sh
./quick-kb-test.sh 6901dadc921a728c0e2e5fd9
```

This will run 4 different test queries automatically.

## Available Scripts

### `list-agents.js`
Lists all agents in your database with their IDs.

**Usage:**
```bash
node list-agents.js
```

**Output:**
- Agent name
- Agent ID
- Active status (✅/❌)

---

### `test-kb-retrieval.js`
Comprehensive KB retrieval testing tool.

**Usage:**
```bash
node test-kb-retrieval.js <agentId> "<query>"
```

**What it tests:**
1. ✅ MongoDB connection
2. ✅ Knowledge base documents for the agent
3. ✅ Active chunks in database
4. ✅ Query relevance detection
5. ✅ Embedding generation
6. ✅ Vector search with 3 different configurations
7. ✅ LLM context formatting
8. ✅ RAG statistics
9. ✅ Low-level vector search (MongoDB Atlas)

**Example:**
```bash
node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "How do I reset my password?"
```

---

### `quick-kb-test.bat` / `quick-kb-test.sh`
Runs multiple common queries for quick testing.

**Usage:**
```bash
# Windows
quick-kb-test.bat <agentId>

# Linux/Mac
./quick-kb-test.sh <agentId>
```

**Test queries:**
1. "What are the main features?"
2. "How do I get started?"
3. "What is the pricing?"
4. "Hello there" (conversational - should warn)

---

## Test Flow Example

```bash
# Step 1: Find your agent ID
node list-agents.js

# Output:
# 🤖 Available Agents:
#   1. ✅ Troika Agent
#      ID: 6901dadc921a728c0e2e5fd9

# Step 2: Test with a specific query
node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are your business hours?"

# Step 3: Review the output to see:
# - ✅ If chunks were found
# - ✅ Similarity scores
# - ✅ Retrieved content
# - ✅ Formatted context for LLM
```

## Understanding the Output

### Vector Search Scores

The script tests with 3 configurations:

| Configuration | Top K | Min Score | Use Case |
|---------------|-------|-----------|----------|
| **Standard** | 3 | 0.7 | Default - good balance |
| **Relaxed** | 5 | 0.5 | More results, lower quality |
| **Strict** | 3 | 0.8 | Fewer results, higher quality |

### Similarity Score Ranges

- **0.9-1.0**: Excellent match (very rare, almost exact)
- **0.8-0.9**: Very good match (high confidence)
- **0.7-0.8**: Good match (standard threshold) ← **Default**
- **0.6-0.7**: Fair match (may be relevant)
- **0.5-0.6**: Weak match (low confidence)
- **<0.5**: Poor match (filtered out)

### Example Output

```
================================================================================
🔍 KNOWLEDGE BASE RETRIEVAL TEST
================================================================================

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📚 Checking Knowledge Base for agent: 6901dadc921a728c0e2e5fd9
✅ Found 2 document(s) in knowledge base:
   1. product-guide.pdf (ready) - 45 chunks
   2. faq.txt (ready) - 12 chunks

📊 Total active chunks in database: 57

🔎 VECTOR SEARCH TESTS

📍 Test: Standard (topK=3, minScore=0.7)
────────────────────────────────────────────────────────────────────────────────
✅ Found 3 chunk(s) in 456ms
   Max Score: 0.8945
   Avg Score: 0.8321
   Total Characters: 1247

   [1] product-guide.pdf (Page 5) - Score: 0.8945
   "Our product offers three main features..."

================================================================================
📝 FORMATTED CONTEXT FOR LLM
================================================================================

# Knowledge Base Information

[1] Source: product-guide.pdf (Page 5)
Our product offers three main features...

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
...
```

## Troubleshooting

### No agents found
```bash
node list-agents.js
# ❌ No agents found
```
**Solution:** Create an agent through the dashboard first.

---

### No documents found
```
❌ No knowledge base documents found for this agent
```
**Solution:** Upload documents (PDF, DOCX, TXT) through the agent's knowledge base section in the dashboard.

---

### No chunks found
```
❌ No active chunks found
```
**Solution:**
1. Wait for documents to finish processing
2. Check document status in dashboard
3. Verify files uploaded successfully

---

### Vector search failed
```
❌ Direct vector search failed: ...
```
**Solution:** Create the vector index in MongoDB Atlas.

See [docs/MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](docs/MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md)

Quick fix:
1. Go to MongoDB Atlas → Database → Search
2. Create Search Index on `knowledgechunks` collection
3. Name: `vector_index_chunks`
4. Configuration:
   ```json
   {
     "fields": [{
       "type": "vector",
       "path": "embedding",
       "numDimensions": 1536,
       "similarity": "cosine"
     }]
   }
   ```

---

### No results with good query
```
✅ Found 0 chunk(s)
```

**Possible causes:**
1. Documents don't contain relevant information for this query
2. Query language doesn't match document language
3. minScore threshold too high (try 0.5 instead of 0.7)

**Try:**
```bash
# Test with a very general query to see if ANY chunks are retrieved
node test-kb-retrieval.js <agentId> "information"
```

## Testing During Live Calls

To see KB retrieval during actual phone calls:

1. **Check logs** after making a test call:
   ```bash
   ssh -i ~/.ssh/calling-agent.pem ubuntu@<your-server-ip>
   pm2 logs calling-agent | grep -i "RAG\|knowledge"
   ```

2. **Look for these log messages:**
   - `🔍 RAG: Query is relevant, searching knowledge base`
   - `✅ RAG: Found relevant context`
   - `⚠️ RAG: No relevant context found`

3. **Review call transcripts** in the dashboard to see if the agent used KB information

## Production vs Development

### Development Testing
```bash
# Local testing with .env file
node test-kb-retrieval.js <agentId> "<query>"
```

### Production Testing
```bash
# SSH into server
ssh -i ~/.ssh/calling-agent.pem ubuntu@<server-ip>

# Run test on server
cd ~/calling-agent
node test-kb-retrieval.js <agentId> "<query>"
```

## Best Practices

### 1. Test After Uploading Documents
```bash
# Upload document → Wait 30 seconds → Run test
node test-kb-retrieval.js <agentId> "test query related to new document"
```

### 2. Test with Various Query Types
- ✅ Questions: "What is...?", "How do I...?", "When does...?"
- ✅ Information requests: "Tell me about...", "Explain..."
- ✅ Specific lookups: "Price of...", "Location of..."
- ❌ Greetings: "Hello", "Hi there" (should be filtered)

### 3. Verify Scores
- If all scores are < 0.7: Consider improving document content or query
- If scores are > 0.85: Excellent match!
- If no results: Check if documents contain relevant information

### 4. Monitor Context Length
- Phone calls: Limited to 2000 chars
- Keep chunks concise and focused
- Use `maxContextLength` parameter to adjust

## Related Documentation

- [docs/KB_TESTING_GUIDE.md](docs/KB_TESTING_GUIDE.md) - Detailed testing guide
- [docs/KNOWLEDGE_BASE_GUIDE.md](docs/KNOWLEDGE_BASE_GUIDE.md) - Full KB system documentation
- [docs/MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](docs/MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md) - Vector index setup
- [docs/KB_AUTO_REFRESH_FIX.md](docs/KB_AUTO_REFRESH_FIX.md) - Auto-refresh feature

## Common Test Scenarios

### Scenario 1: New Agent Setup
```bash
# 1. Create agent in dashboard
# 2. List agents to get ID
node list-agents.js

# 3. Upload documents through dashboard
# 4. Wait 30 seconds for processing
# 5. Run comprehensive test
node test-kb-retrieval.js <agentId> "What information do you have?"
```

### Scenario 2: Verify Call Behavior
```bash
# 1. Make a test call
# 2. Ask a question during the call
# 3. Run the same query through the test script
node test-kb-retrieval.js <agentId> "same question you asked during call"

# 4. Compare what the script finds vs what the agent said
# 5. Check if scores match expectations
```

### Scenario 3: Debug Empty Results
```bash
# 1. Run with relaxed settings (script does this automatically)
# 2. Check if ANY chunks exist
node list-agents.js

# 3. Try extremely generic query
node test-kb-retrieval.js <agentId> "information"

# 4. If still no results, check MongoDB Atlas vector index
```

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review [docs/KB_TESTING_GUIDE.md](docs/KB_TESTING_GUIDE.md)
3. Verify MongoDB Atlas vector index is configured
4. Check document processing status in dashboard

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│  KNOWLEDGE BASE TESTING QUICK REFERENCE                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📋 List Agents:                                        │
│     node list-agents.js                                 │
│                                                          │
│  🔍 Test KB:                                            │
│     node test-kb-retrieval.js <id> "<query>"           │
│                                                          │
│  🧪 Quick Test:                                         │
│     quick-kb-test.bat <id>      (Windows)              │
│     ./quick-kb-test.sh <id>     (Linux/Mac)            │
│                                                          │
│  📊 Score Ranges:                                       │
│     0.9-1.0  → Excellent ⭐⭐⭐                        │
│     0.8-0.9  → Very Good ⭐⭐                          │
│     0.7-0.8  → Good ⭐ (default threshold)             │
│     0.5-0.7  → Fair                                     │
│     <0.5     → Poor (filtered)                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```
