# Knowledge Base Retrieval Testing - Summary

## What Was Created

I've created a comprehensive testing suite for verifying that your Knowledge Base (KB) context retrieval is working correctly.

## Files Created

### 1. **test-kb-retrieval.js** (Main Test Script)
   - Location: Root directory
   - Comprehensive KB retrieval testing tool
   - Tests all aspects of the RAG (Retrieval-Augmented Generation) system

### 2. **list-agents.js** (Helper Script)
   - Location: Root directory
   - Lists all agents with their IDs
   - Makes it easy to find the agent ID you want to test

### 3. **quick-kb-test.bat / quick-kb-test.sh** (Quick Test Scripts)
   - Location: Root directory
   - Runs multiple common queries automatically
   - Windows (.bat) and Linux/Mac (.sh) versions

### 4. **KB_TEST_README.md** (Main Documentation)
   - Location: Root directory
   - Complete guide on how to use all the testing tools
   - Troubleshooting guide
   - Best practices

### 5. **docs/KB_TESTING_GUIDE.md** (Detailed Guide)
   - Location: docs/ directory
   - In-depth explanation of what each test does
   - Understanding similarity scores
   - Integration with voice calls

## How to Use

### Step 1: Find Your Agent ID

```bash
node list-agents.js
```

This will show all agents with their IDs:
```
🤖 Available Agents:

  1. ✅ Troika Agent
     ID: 6901dadc921a728c0e2e5fd9
```

### Step 2: Test KB Retrieval

```bash
node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are the product features?"
```

This will:
1. ✅ Check if agent has KB documents
2. ✅ Count total active chunks
3. ✅ Test if query is relevant for KB search
4. ✅ Generate embedding for the query
5. ✅ Run vector search with 3 different settings (Standard, Relaxed, Strict)
6. ✅ Show exactly what context will be sent to the LLM
7. ✅ Display RAG statistics
8. ✅ Test low-level MongoDB vector search

### Step 3: Run Quick Multi-Query Test

**Windows:**
```batch
quick-kb-test.bat 6901dadc921a728c0e2e5fd9
```

**Linux/Mac (on server):**
```bash
chmod +x quick-kb-test.sh
./quick-kb-test.sh 6901dadc921a728c0e2e5fd9
```

## What Gets Tested

### Database & Configuration
- ✅ MongoDB connection
- ✅ Agent exists and has KB documents
- ✅ Document processing status (ready/processing)
- ✅ Active chunks in database
- ✅ Vector index configuration (MongoDB Atlas)

### Query Processing
- ✅ Query relevance detection (filters out greetings/small talk)
- ✅ Embedding generation (1536 dimensions)
- ✅ Generation time

### Vector Search
Three configurations are tested automatically:

| Config | Top K | Min Score | Purpose |
|--------|-------|-----------|---------|
| Standard | 3 | 0.7 | Default production settings |
| Relaxed | 5 | 0.5 | More results, lower threshold |
| Strict | 3 | 0.8 | Highest quality only |

For each configuration, you'll see:
- Number of chunks found
- Search time
- Max similarity score
- Average similarity score
- Total characters retrieved
- Preview of each chunk with its score

### Context Formatting
- ✅ How context is formatted for the LLM
- ✅ Source citations (e.g., [1], [2])
- ✅ Character limit enforcement (2000 chars for phone calls)
- ✅ Instructions to LLM on how to use the context

### Statistics
- ✅ Total documents
- ✅ Total chunks
- ✅ Ready vs. processing documents

## Understanding the Results

### Similarity Scores

The script shows similarity scores for each retrieved chunk:

- **0.9 - 1.0**: 🌟 Excellent match (very rare, almost exact match)
- **0.8 - 0.9**: ⭐⭐ Very good match (high confidence)
- **0.7 - 0.8**: ⭐ Good match (standard threshold - **this is the default**)
- **0.6 - 0.7**: Fair match (may be relevant)
- **0.5 - 0.6**: Weak match (low confidence)
- **< 0.5**: Poor match (automatically filtered out)

### What Good Results Look Like

```
✅ Found 3 chunk(s) in 456ms
   Max Score: 0.8945    ← Very good!
   Avg Score: 0.8321    ← Excellent!
   Total Characters: 1247

   [1] product-guide.pdf (Page 5) - Score: 0.8945
   "Our product offers three main features: real-time analytics..."
```

### What to Watch Out For

```
❌ Found 0 chunk(s)
```
Possible issues:
- No documents uploaded
- Documents don't contain relevant information
- Query language doesn't match document language
- Vector index not configured in MongoDB Atlas

## Testing on the Server

Since MongoDB connection might be slow from your local machine, you should run these tests on the server:

```bash
# SSH into your server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73

# Navigate to the project directory
cd ~/calling-agent

# Copy the test scripts to the server (first time only)
# You can use scp or git

# Run the tests
node list-agents.js
node test-kb-retrieval.js <agentId> "<query>"
```

## Copy Test Scripts to Server

From your local machine:

```bash
# Copy all test scripts to server
scp -i "C:\Users\USER\.ssh\calling-agent.pem" list-agents.js test-kb-retrieval.js quick-kb-test.sh ubuntu@13.127.214.73:~/calling-agent/

# Make the shell script executable
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73 "chmod +x ~/calling-agent/quick-kb-test.sh"
```

## Example Test Session

```bash
# On the server
cd ~/calling-agent

# Step 1: List agents
$ node list-agents.js

📡 Connecting to MongoDB...
✅ Connected

🤖 Available Agents:

  1. ✅ Troika Agent
     ID: 6901dadc921a728c0e2e5fd9

Total: 1 agent(s)

# Step 2: Test KB retrieval
$ node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are your business hours?"

================================================================================
🔍 KNOWLEDGE BASE RETRIEVAL TEST
================================================================================

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📚 Checking Knowledge Base for agent: 6901dadc921a728c0e2e5fd9
✅ Found 2 document(s) in knowledge base:
   1. business-info.pdf (ready) - 15 chunks
   2. faq.txt (ready) - 8 chunks

📊 Total active chunks in database: 23

🤔 Checking query relevance...
   Query: "What are your business hours?"
   Is relevant: Yes ✅

🧮 Generating embedding for query...
✅ Embedding generated (1536 dimensions) in 187ms

🔎 VECTOR SEARCH TESTS

📍 Test: Standard (topK=3, minScore=0.7)
────────────────────────────────────────────────────────────────────────────────
✅ Found 2 chunk(s) in 234ms
   Max Score: 0.9124
   Avg Score: 0.8745
   Total Characters: 543

   [1] faq.txt - Score: 0.9124
   "Q: What are your business hours? A: We are open Monday through Friday, 9 AM to 6 PM EST..."

   [2] business-info.pdf (Page 2) - Score: 0.8366
   "Operating Hours: Our customer service team is available during regular business hours..."

================================================================================
📝 FORMATTED CONTEXT FOR LLM
================================================================================

# Knowledge Base Information

[1] Source: faq.txt
Q: What are your business hours? A: We are open Monday through Friday, 9 AM to 6 PM EST...

[2] Source: business-info.pdf (Page 2)
Operating Hours: Our customer service team is available during regular business hours...

---

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
- If the answer is not in the knowledge base, say so clearly
- Do not make up information not provided above

================================================================================
✅ TEST COMPLETE
================================================================================
```

## Verifying During Live Calls

After making a test call, you can verify if the KB was used:

1. **Check the logs:**
   ```bash
   pm2 logs calling-agent | grep -i "RAG\|knowledge"
   ```

2. **Look for these messages:**
   - `🔍 RAG: Query is relevant, searching knowledge base`
   - `✅ RAG: Found relevant context` (with chunk count and scores)
   - `⚠️ RAG: No relevant context found`

3. **Compare with test results:**
   - Run the same query through `test-kb-retrieval.js`
   - Compare scores and retrieved content
   - Verify the agent's response used the KB information

## Troubleshooting

See [KB_TEST_README.md](../KB_TEST_README.md) for detailed troubleshooting.

Common issues:
- ✅ MongoDB Atlas vector index not configured → See [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md)
- ✅ No documents uploaded → Upload through dashboard
- ✅ Documents still processing → Wait and check status
- ✅ No results with good query → Try lower minScore (0.5)

## Next Steps

1. **Upload Test Documents**: If you haven't already, upload some test documents (PDF, DOCX, or TXT)
2. **Run Initial Test**: Use `test-kb-retrieval.js` to verify setup
3. **Make Test Calls**: Call your agent and ask questions related to your documents
4. **Compare Results**: Run the same questions through the test script
5. **Optimize**: Adjust minScore thresholds based on your needs

## Related Documentation

- [KB_TEST_README.md](../KB_TEST_README.md) - Complete testing tools guide
- [KB_TESTING_GUIDE.md](./KB_TESTING_GUIDE.md) - Detailed testing guide
- [KNOWLEDGE_BASE_GUIDE.md](./KNOWLEDGE_BASE_GUIDE.md) - Full KB system documentation
- [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md) - Vector index setup

## Quick Reference

```
┌─────────────────────────────────────────────────────────┐
│  KNOWLEDGE BASE TESTING - QUICK COMMANDS                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. List agents:                                        │
│     node list-agents.js                                 │
│                                                          │
│  2. Test KB:                                            │
│     node test-kb-retrieval.js <id> "<query>"           │
│                                                          │
│  3. Quick multi-test:                                   │
│     ./quick-kb-test.sh <id>                            │
│                                                          │
│  4. Copy to server:                                     │
│     scp -i <key> *.js ubuntu@<ip>:~/calling-agent/     │
│                                                          │
│  5. Check live call logs:                               │
│     pm2 logs calling-agent | grep -i "RAG"             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Summary

You now have a complete testing suite to:
- ✅ Verify KB documents are properly uploaded and processed
- ✅ Test vector search with different configurations
- ✅ See exactly what context is retrieved for any query
- ✅ Debug issues with KB retrieval
- ✅ Monitor KB usage during live calls
- ✅ Optimize similarity thresholds for your use case

All scripts are ready to use - just copy them to your server and run!
