# Knowledge Base Testing Guide

## Quick Start

The `test-kb-retrieval.js` script allows you to test if your knowledge base is working correctly and retrieve context for queries.

### Basic Usage

```bash
node test-kb-retrieval.js <agentId> "<query>"
```

### Example

```bash
node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are the product features?"
```

## What the Script Tests

### 1. **Database Connection**
   - Verifies connection to MongoDB
   - Checks if the database is accessible

### 2. **Knowledge Base Documents**
   - Lists all documents uploaded for the agent
   - Shows document status (ready, processing, failed)
   - Displays total chunks per document

### 3. **Active Chunks**
   - Counts total active chunks in the database
   - Verifies chunks are properly created and indexed

### 4. **Query Relevance**
   - Tests if the query is suitable for KB search
   - Identifies conversational vs. information-seeking queries

### 5. **Embedding Generation**
   - Generates embedding for your query
   - Shows embedding dimensions and generation time

### 6. **Vector Search Tests**
   - Runs 3 different search configurations:
     - **Standard**: topK=3, minScore=0.7
     - **Relaxed**: topK=5, minScore=0.5 (more results, lower quality)
     - **Strict**: topK=3, minScore=0.8 (fewer results, higher quality)

   For each configuration, shows:
   - Number of chunks found
   - Search time
   - Max and average similarity scores
   - Chunk previews with scores

### 7. **LLM Context Formatting**
   - Shows exactly what context will be sent to the LLM
   - Includes source citations
   - Respects character limits (2000 chars for phone calls)

### 8. **RAG Statistics**
   - Total documents and chunks
   - Ready vs. processing documents
   - Overall KB health

### 9. **Low-Level Vector Search**
   - Direct MongoDB Atlas Vector Search test
   - Helps diagnose vector index issues

## Getting Your Agent ID

### Method 1: From the Dashboard
1. Open your dashboard
2. Go to the agent you want to test
3. Look at the URL: `http://localhost:3000/agents/<agentId>`

### Method 2: From MongoDB
```javascript
// Using MongoDB shell or Compass
db.agents.find({}, { _id: 1, name: 1 })
```

### Method 3: List all agents script
```bash
node list-agents.js  # If you create this helper script
```

## Example Output

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

🤔 Checking query relevance...
   Query: "What are the product features?"
   Is relevant: Yes ✅

🧮 Generating embedding for query...
✅ Embedding generated (1536 dimensions) in 234ms

🔎 VECTOR SEARCH TESTS

📍 Test: Standard (topK=3, minScore=0.7)
────────────────────────────────────────────────────────────────────────────────
✅ Found 3 chunk(s) in 456ms
   Max Score: 0.8945
   Avg Score: 0.8321
   Total Characters: 1247

   [1] product-guide.pdf (Page 5) - Score: 0.8945
   "Our product offers three main features: real-time analytics, automated reporting, and custom dashboards..."

   [2] product-guide.pdf (Page 12) - Score: 0.8567
   "The analytics feature provides insights into user behavior, conversion rates, and engagement metrics..."

   [3] faq.txt - Score: 0.7451
   "Q: What features are included? A: The platform includes real-time monitoring, custom alerts..."

================================================================================
📝 FORMATTED CONTEXT FOR LLM
================================================================================

# Knowledge Base Information

[1] Source: product-guide.pdf (Page 5)
Our product offers three main features: real-time analytics...

[2] Source: product-guide.pdf (Page 12)
The analytics feature provides insights into user behavior...

[3] Source: faq.txt
Q: What features are included? A: The platform includes...

---

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
- If the answer is not in the knowledge base, say so clearly
- Do not make up information not provided above

================================================================================
📊 RAG STATISTICS
================================================================================

Total Documents: 2
Total Chunks: 57
Ready Documents: 2
Processing Documents: 0

================================================================================
✅ TEST COMPLETE
================================================================================
```

## Troubleshooting

### No documents found
```
❌ No knowledge base documents found for this agent

Tip: Upload documents to the agent's knowledge base first
```

**Solution**: Upload PDF, DOCX, or TXT files through the dashboard.

### No chunks found
```
❌ No active chunks found

Tip: Make sure documents are processed and chunks are created
```

**Solution**: Wait for documents to finish processing. Check document status in the dashboard.

### Vector search failed
```
❌ Direct vector search failed: ...

⚠️ This might indicate the vector index is not properly configured in MongoDB Atlas
```

**Solution**: Create the vector index in MongoDB Atlas:
1. Go to Atlas Dashboard > Database > Search
2. Create Search Index
3. Collection: `knowledgechunks`
4. Index name: `vector_index_chunks`
5. Use this configuration:
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

See [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md) for detailed instructions.

### No results with standard settings
Try the relaxed configuration manually:
```bash
# Edit the script or wait for results from the three automatic tests
# The script automatically tests with minScore=0.5 as the "Relaxed" test
```

If still no results:
- Query might not match document content
- Documents might be in a different language
- Try a more specific query

## Understanding Similarity Scores

- **0.9 - 1.0**: Excellent match (very rare)
- **0.8 - 0.9**: Very good match (high confidence)
- **0.7 - 0.8**: Good match (standard threshold)
- **0.6 - 0.7**: Fair match (may be relevant)
- **0.5 - 0.6**: Weak match (low confidence)
- **< 0.5**: Poor match (usually filtered out)

## Testing Different Queries

### Information-seeking (should work well)
```bash
node test-kb-retrieval.js <agentId> "How do I reset my password?"
node test-kb-retrieval.js <agentId> "What are your business hours?"
node test-kb-retrieval.js <agentId> "Explain the pricing structure"
```

### Conversational (may not trigger KB search)
```bash
node test-kb-retrieval.js <agentId> "Hello"
node test-kb-retrieval.js <agentId> "Thank you"
```

The script will warn you if the query is too conversational but will still run the test.

## Integration with Voice Calls

During actual calls, the system:
1. Detects if user query is relevant for KB (using `isQueryRelevantForKB`)
2. Generates embedding for the query
3. Searches knowledge base with topK=3, minScore=0.7
4. Formats context with character limit of 2000 (for phone conversations)
5. Injects context into LLM prompt
6. LLM uses context to answer with source citations

## Next Steps

1. Test with various queries to understand coverage
2. Adjust minScore threshold if needed
3. Upload more documents to improve coverage
4. Monitor RAG logs during actual calls
5. Review call transcripts to see if KB is being used effectively

## Related Documentation

- [KNOWLEDGE_BASE_GUIDE.md](./KNOWLEDGE_BASE_GUIDE.md) - Full KB system guide
- [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md) - Vector index setup
- [KB_AUTO_REFRESH_FIX.md](./KB_AUTO_REFRESH_FIX.md) - Auto-refresh feature
