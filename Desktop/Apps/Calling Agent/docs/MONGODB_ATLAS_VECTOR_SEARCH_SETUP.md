# MongoDB Atlas Vector Search Setup

This guide explains how to set up MongoDB Atlas Vector Search for the Knowledge Base RAG system.

## Prerequisites

- MongoDB Atlas cluster (M10 or higher required for Vector Search)
- Database: Your production/development database
- Collection: `knowledgebases`

## Why Atlas Vector Search?

- **Native Integration**: No separate vector database needed
- **Unified Database**: Same database for structured data + vectors
- **Cost Effective**: No additional infrastructure
- **Scalable**: Scales with your MongoDB cluster

## Cluster Requirements

**IMPORTANT**: Vector Search is only available on:
- M10+ clusters (Dedicated clusters)
- M0 (Free tier) and M2/M5 (Shared clusters) do NOT support vector search

**Cost**: M10 cluster starts at ~$60/month

## Step-by-Step Setup

### 1. Create Atlas Search Index

1. Go to your MongoDB Atlas dashboard
2. Navigate to your cluster
3. Click on "Search" tab (Atlas Search)
4. Click "Create Search Index"
5. Choose "JSON Editor"
6. Select your database and the `knowledgebases` collection

### 2. Vector Search Index Definition

Use this **exact** JSON configuration:

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

### 3. Configuration Breakdown

#### Vector Field
- **path**: `chunks.embedding` - Path to embedding array in nested chunks
- **numDimensions**: `1536` - OpenAI text-embedding-3-small dimensions
- **similarity**: `cosine` - Cosine similarity metric (best for text)

#### Filter Fields
These allow pre-filtering before vector search (more efficient):
- **agentId**: Filter by specific agent
- **isActive**: Only search active documents
- **status**: Only search documents with status='ready'

### 4. Index Creation Time

- Small collections: 1-2 minutes
- Large collections: 5-10 minutes
- You'll see status: "Building" → "Active"

### 5. Verify Index

After creation, verify:
1. Index name is exactly `vector_index` (code expects this name)
2. Status shows "Active"
3. Collection is `knowledgebases`

## Testing Vector Search

### Option 1: Test via API

```bash
curl -X POST http://localhost:5000/api/v1/knowledge-base/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "What is the refund policy?",
    "agentId": "YOUR_AGENT_ID",
    "topK": 5,
    "minScore": 0.7
  }'
```

### Option 2: Test in MongoDB Compass

Run aggregation pipeline:

```javascript
[
  {
    $vectorSearch: {
      index: "vector_index",
      path: "chunks.embedding",
      queryVector: [/* 1536 dimensional array */],
      numCandidates: 50,
      limit: 5,
      filter: {
        agentId: ObjectId("YOUR_AGENT_ID"),
        isActive: true,
        status: "ready"
      }
    }
  },
  {
    $project: {
      fileName: 1,
      "chunks.text": 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]
```

## Query Performance

Expected query latency:
- Query embedding generation: ~100-200ms (OpenAI API)
- Vector search: ~50-150ms (MongoDB Atlas)
- Total: ~150-350ms

For 1000 documents with 5000 chunks:
- Search time: <200ms
- Memory usage: ~8MB per 1000 embeddings

## Cost Estimation

### Storage Costs
- Each embedding: 1536 floats × 4 bytes = 6,144 bytes (~6KB)
- 1000 documents × 10 chunks avg = 10,000 embeddings
- Total: ~60MB for embeddings

### Compute Costs (Embedding Generation)
- OpenAI text-embedding-3-small: $0.02 per 1M tokens
- 1000 documents × 5000 chars avg = 5M chars ≈ 1.25M tokens
- Cost: ~$0.025 per 1000 documents

### Atlas Costs
- M10 cluster: ~$60/month (supports vector search)
- M30 cluster: ~$200/month (recommended for production)

## Troubleshooting

### Error: "vector search index not found"
- **Solution**: Ensure index name is exactly `vector_index`
- Check index status is "Active"
- Verify collection name is `knowledgebases`

### Error: "vector dimensions mismatch"
- **Solution**: Index expects 1536 dimensions (text-embedding-3-small)
- Don't use different embedding models without updating index

### Error: "vector search not supported"
- **Solution**: Upgrade to M10+ cluster
- Free/shared tiers don't support vector search

### Slow queries (>1s)
- **Solution**:
  - Use filters (agentId, isActive, status) to reduce search space
  - Increase numCandidates if getting poor results
  - Consider reducing topK

### No results returned
- **Solution**:
  - Check minScore threshold (try lowering to 0.6)
  - Verify documents exist with status='ready'
  - Check filter criteria (agentId, isActive)

## Alternative: Change Embedding Model

If you want to use a different model:

### OpenAI text-embedding-3-large (3072 dimensions)
```json
{
  "path": "chunks.embedding",
  "numDimensions": 3072,
  "similarity": "cosine"
}
```
Update in `embeddings.service.ts`:
```typescript
private readonly MODEL = 'text-embedding-3-large';
private readonly DIMENSIONS = 3072;
```

### OpenAI text-embedding-ada-002 (1536 dimensions)
No changes needed - same dimensions as text-embedding-3-small

## Maintenance

### Re-indexing
Vector index updates automatically when documents are added/updated.

### Monitoring
Monitor in Atlas:
1. Search → Vector Search Metrics
2. Check query latency
3. Monitor index size

### Backup
Vector indexes are **not** included in backups. After restore:
1. Recreate vector index
2. Wait for index to rebuild

## Next Steps

1. ✅ Create vector index in Atlas
2. ✅ Verify index is active
3. 📤 Upload test document via API
4. 🔍 Test RAG query
5. 📞 Test in live phone call

## Support

- [MongoDB Atlas Vector Search Docs](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [Vector Search Tutorial](https://www.mongodb.com/docs/atlas/atlas-vector-search/tutorials/)
- [Best Practices](https://www.mongodb.com/docs/atlas/atlas-vector-search/best-practices/)
