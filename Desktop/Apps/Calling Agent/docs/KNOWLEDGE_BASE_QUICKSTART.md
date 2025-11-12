# Knowledge Base RAG - Quick Start Guide

Get your Knowledge Base RAG system up and running in 5 steps.

## Prerequisites

✅ Backend running on `http://localhost:5000`
✅ MongoDB Atlas account
✅ OpenAI API key configured
✅ JWT token for authentication

## Step 1: Upgrade MongoDB Atlas Cluster (REQUIRED)

**Current cluster tier**: Check in Atlas dashboard

**Required**: M10 or higher ($60+/month)

### If you have M0/M2/M5 (Free/Shared):
1. Go to MongoDB Atlas dashboard
2. Click on your cluster
3. Click "Upgrade" or "Edit Configuration"
4. Select **M10** (minimum for vector search)
5. Click "Apply Changes"
6. Wait 5-10 minutes for upgrade

**Cost**: ~$60/month for M10

## Step 2: Create Vector Search Index

1. In Atlas dashboard, click on your cluster
2. Go to "Search" tab (Atlas Search)
3. Click "Create Search Index"
4. Choose "JSON Editor"
5. Select database and `knowledgebases` collection
6. Paste this configuration:

```json
{
  "name": "vector_index",
  "type": "vectorSearch",
  "fields": [
    {
      "type": "vector",
      "path": "chunks.embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "agentId"
    },
    {
      "type": "filter",
      "path": "isActive"
    },
    {
      "type": "filter",
      "path": "status"
    }
  ]
}
```

7. Click "Create Search Index"
8. Wait for status: "Building" → "Active" (1-5 minutes)

## Step 3: Get Your IDs

### Get JWT Token
```bash
# Login to get token
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "yourpassword"
  }'
```

Copy the `token` from response.

### Get Agent ID
```bash
# List your agents
curl http://localhost:5000/api/v1/agents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Copy an `_id` from the response.

## Step 4: Upload Test Document

### Option A: Using curl
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-base/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-document.pdf" \
  -F "agentId=YOUR_AGENT_ID"
```

### Option B: Using test-kb-api.http (VS Code)
1. Open `backend/test-kb-api.http`
2. Replace `YOUR_JWT_TOKEN_HERE` and `YOUR_AGENT_ID_HERE`
3. Click "Send Request" above "Upload Knowledge Base Document"

### Expected Response
```json
{
  "success": true,
  "message": "Document upload started. Processing in background.",
  "data": {
    "documentId": "67abc123...",
    "fileName": "test-document.pdf",
    "status": "processing"
  }
}
```

## Step 5: Wait & Verify

### Check Processing Status
```bash
curl http://localhost:5000/api/v1/knowledge-base/YOUR_AGENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Wait for `status: "ready"` (usually 2-5 seconds)

### Test RAG Query
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-base/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the main topic of the document?",
    "agentId": "YOUR_AGENT_ID",
    "topK": 5,
    "minScore": 0.7
  }'
```

### Expected Response
```json
{
  "success": true,
  "data": {
    "query": "What is the main topic...",
    "chunks": [
      {
        "text": "The document discusses...",
        "score": 0.89,
        "fileName": "test-document.pdf"
      }
    ],
    "totalChunks": 3,
    "maxScore": 0.89,
    "avgScore": 0.82
  }
}
```

## Step 6: Test in Phone Call (Optional)

1. Make a phone call to your agent
2. Ask a question related to your uploaded document
3. Listen to AI response - should use document context
4. Check backend logs:

```bash
pm2 logs backend
```

Look for:
```
🔍 RAG: Query is relevant, searching knowledge base
✅ RAG: Found relevant context { chunks: 3, maxScore: '0.891' }
```

## Troubleshooting

### Error: "vector search index not found"
**Fix**:
1. Check index name is exactly `vector_index`
2. Verify index status is "Active" in Atlas
3. Ensure collection is `knowledgebases`

### Error: "vector search not supported"
**Fix**:
- Upgrade to M10+ cluster
- Free tier (M0) doesn't support vector search

### No results from query
**Fix**:
1. Check document status is "ready"
2. Try lower minScore (0.5 instead of 0.7)
3. Verify vector index is active
4. Check query is relevant (not just "hello")

### Processing stuck on "processing"
**Fix**:
1. Check backend logs: `pm2 logs backend`
2. Look for errors in processing
3. Verify OpenAI API key is valid
4. Check document isn't corrupted

## File Format Tips

### Good Documents
✅ Clean text-based PDFs
✅ Well-formatted DOCX files
✅ Plain TXT files with proper formatting
✅ 1-100 pages (optimal)

### Problematic Documents
❌ Scanned PDFs (use OCR first)
❌ Image-heavy documents
❌ Complex tables/charts
❌ Encrypted/password-protected PDFs
❌ Very large files (>10MB)

## Cost Breakdown

### Setup Costs
- MongoDB Atlas M10: **$60/month**
- Document processing (1000 docs): **$0.025 one-time**

### Ongoing Costs
- RAG queries (10K/month): **$0.01/month** (negligible)
- Total: **~$60/month**

## What's Next?

### Production Setup
1. [ ] Configure production MongoDB Atlas cluster
2. [ ] Setup monitoring/alerts
3. [ ] Test with real documents
4. [ ] Train team on document upload
5. [ ] Monitor RAG quality

### Optional Enhancements
- Upload more documents for comprehensive coverage
- Tune chunk size for your use case
- Adjust minScore threshold based on results
- Add document versioning
- Setup automatic re-indexing

## Support Files

- **Complete Guide**: [KNOWLEDGE_BASE_SYSTEM.md](./KNOWLEDGE_BASE_SYSTEM.md)
- **Atlas Setup**: [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md)
- **Implementation Summary**: [KNOWLEDGE_BASE_IMPLEMENTATION_SUMMARY.md](./KNOWLEDGE_BASE_IMPLEMENTATION_SUMMARY.md)
- **API Tests**: [backend/test-kb-api.http](./backend/test-kb-api.http)

## Quick Commands Cheatsheet

```bash
# Upload document
curl -X POST localhost:5000/api/v1/knowledge-base/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@doc.pdf" -F "agentId=$AGENT_ID"

# List documents
curl localhost:5000/api/v1/knowledge-base/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN"

# Query RAG
curl -X POST localhost:5000/api/v1/knowledge-base/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","agentId":"'$AGENT_ID'"}'

# Get stats
curl localhost:5000/api/v1/knowledge-base/stats/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN"

# Delete document
curl -X DELETE localhost:5000/api/v1/knowledge-base/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

**You're all set!** 🎉

Upload your first document and start getting intelligent, context-aware responses from your AI calling agent.
