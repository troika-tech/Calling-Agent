# Knowledge Base RAG System

Complete implementation of Retrieval-Augmented Generation (RAG) for the AI Calling Platform.

## Overview

The Knowledge Base system allows agents to access uploaded documents (PDF, DOCX, TXT) during phone conversations, providing accurate, contextual responses based on your business documentation.

### Key Features

- 📄 **Multi-format Support**: PDF, DOCX, TXT files
- 🧠 **Semantic Search**: Vector similarity using OpenAI embeddings
- 🗄️ **MongoDB Atlas Vector Search**: Native vector search (no separate DB)
- 📞 **Phone-Optimized RAG**: Context length limited for conversation flow
- 🔍 **Smart Query Detection**: Only searches KB for relevant queries
- 💰 **Cost Effective**: $0.02 per 1M tokens for embeddings

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE BASE FLOW                       │
└─────────────────────────────────────────────────────────────┘

1. UPLOAD & PROCESSING
   User uploads file (PDF/DOCX/TXT)
        ↓
   Text Extraction Service
        ↓
   Semantic Chunking (LangChain)
        ↓
   Embedding Generation (OpenAI)
        ↓
   Store in MongoDB (chunks + embeddings)

2. RAG QUERY (During Phone Call)
   User speaks → Transcript
        ↓
   Query Relevance Check
        ↓
   Generate Query Embedding
        ↓
   Vector Search (MongoDB Atlas)
        ↓
   Retrieve Top K Chunks
        ↓
   Format Context for LLM
        ↓
   Enhanced System Prompt → LLM
        ↓
   AI Response with Citations
```

## Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Text Extraction** | pdf-parse, mammoth | Extract text from documents |
| **Chunking** | LangChain RecursiveCharacterTextSplitter | Semantic text splitting |
| **Embeddings** | OpenAI text-embedding-3-small | Generate 1536-dim vectors |
| **Vector Storage** | MongoDB Atlas Vector Search | Store and search embeddings |
| **RAG Pipeline** | Custom service | Query + retrieval logic |

## API Endpoints

### Upload Document
```http
POST /api/v1/knowledge-base/upload
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body:
- file: (binary) PDF/DOCX/TXT file (max 10MB)
- agentId: string

Response:
{
  "success": true,
  "message": "Document upload started. Processing in background.",
  "data": {
    "documentId": "...",
    "fileName": "product-catalog.pdf",
    "status": "processing"
  }
}
```

### List Documents
```http
GET /api/v1/knowledge-base/:agentId?status=ready
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "...",
        "fileName": "product-catalog.pdf",
        "fileType": "pdf",
        "fileSize": 1234567,
        "status": "ready",
        "totalChunks": 42,
        "totalTokens": 8400,
        "totalCharacters": 33600,
        "uploadedAt": "2025-01-15T10:30:00Z",
        "processedAt": "2025-01-15T10:30:45Z"
      }
    ],
    "stats": {
      "totalDocuments": 5,
      "totalChunks": 210,
      "readyDocuments": 5,
      "processingDocuments": 0
    }
  }
}
```

### Get Document Details
```http
GET /api/v1/knowledge-base/document/:documentId
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "id": "...",
    "fileName": "product-catalog.pdf",
    "chunks": [
      {
        "text": "Our refund policy allows...",
        "chunkIndex": 0,
        "metadata": {
          "pageNumber": 5,
          "section": "Policies"
        }
      }
    ],
    "processingMetadata": {
      "duration": 12500,
      "cost": 0.0025,
      "chunkingMethod": "RecursiveCharacterTextSplitter",
      "embeddingModel": "text-embedding-3-small"
    }
  }
}
```

### Delete Document
```http
DELETE /api/v1/knowledge-base/:documentId
Authorization: Bearer {token}

Response:
{
  "success": true,
  "message": "Knowledge base document deleted successfully"
}
```

### Query Knowledge Base (Testing)
```http
POST /api/v1/knowledge-base/query
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "query": "What is your refund policy?",
  "agentId": "...",
  "topK": 5,
  "minScore": 0.7
}

Response:
{
  "success": true,
  "data": {
    "query": "What is your refund policy?",
    "chunks": [
      {
        "text": "Our refund policy allows customers to return...",
        "score": 0.89,
        "fileName": "policies.pdf",
        "fileType": "pdf",
        "chunkIndex": 12,
        "metadata": {
          "pageNumber": 5
        }
      }
    ],
    "totalChunks": 3,
    "maxScore": 0.89,
    "avgScore": 0.82,
    "formattedContext": "# Knowledge Base Information\n\n[1] Source: policies.pdf..."
  }
}
```

## Services

### 1. Text Extraction Service
**File**: `backend/src/services/textExtraction.service.ts`

Extracts text from uploaded files:
- **PDF**: pdf-parse library
- **DOCX**: mammoth library
- **TXT**: UTF-8 decoding

```typescript
const { text, metadata } = await textExtractionService.extractText(
  fileBuffer,
  'pdf'
);
```

### 2. Chunking Service
**File**: `backend/src/services/chunking.service.ts`

Semantic text chunking with LangChain:
- **Chunk Size**: 800 characters (~200 tokens)
- **Overlap**: 200 characters (25%)
- **Separators**: `\n\n`, `\n`, `. `, `! `, `? `, `, `, ` `
- **Preserves**: Sentence boundaries, paragraphs

```typescript
const chunks = await chunkingService.chunkText(text, {
  chunkSize: 800,
  overlap: 200,
  metadata: { fileName: 'doc.pdf' }
});
```

### 3. Embeddings Service
**File**: `backend/src/services/embeddings.service.ts`

Generate OpenAI embeddings:
- **Model**: text-embedding-3-small
- **Dimensions**: 1536
- **Cost**: $0.02 per 1M tokens
- **Batch Support**: Up to 2048 texts per request

```typescript
const { embeddings, totalTokens, cost } =
  await embeddingsService.generateBatchEmbeddings(texts);
```

### 4. RAG Service
**File**: `backend/src/services/rag.service.ts`

RAG query pipeline:
- **Query Relevance Detection**: Skip KB for greetings/small talk
- **Vector Search**: MongoDB Atlas cosine similarity
- **Re-ranking**: Sort by relevance score
- **Context Limiting**: Max 3000 chars (~750 tokens)
- **Citation Formatting**: [1], [2], etc.

```typescript
const context = await ragService.queryKnowledgeBase(
  'What is the return policy?',
  agentId,
  { topK: 5, minScore: 0.7 }
);

const prompt = ragService.generateRAGPrompt(
  basePrompt,
  context,
  userQuery
);
```

## Phone Call Integration

### RAG in Voice Handler
**File**: `backend/src/websocket/handlers/exotelVoice.handler.ts`

RAG is automatically invoked during phone calls:

1. **User speaks** → Transcript
2. **Query Relevance Check** → Is this a KB-relevant question?
3. **Vector Search** → Find top 3 relevant chunks
4. **Context Injection** → Enhance system prompt
5. **LLM Response** → Context-aware answer with citations

#### Phone-Optimized Settings
```typescript
{
  topK: 3,                  // Only 3 chunks (vs 5 for chat)
  minScore: 0.7,           // High relevance threshold
  maxContextLength: 2000   // ~500 tokens (vs 3000 for chat)
}
```

**Why?**
- Phone conversations need brevity
- Less context = faster LLM response
- 3 chunks usually sufficient for phone answers

### Query Relevance Detection

The system intelligently detects if a query needs KB lookup:

**Relevant Queries** (searches KB):
- "What is your refund policy?"
- "How do I install the product?"
- "Tell me about pricing plans"
- "Where are you located?"

**Conversational Queries** (skips KB):
- "Hello"
- "Thanks"
- "Okay"
- "Yes"
- "Goodbye"

Logic in [rag.service.ts:268-297](backend/src/services/rag.service.ts#L268-L297)

## Configuration

### Chunking Settings
```typescript
// backend/src/services/chunking.service.ts
private readonly DEFAULT_CHUNK_SIZE = 800;      // ~200 tokens
private readonly DEFAULT_CHUNK_OVERLAP = 200;   // 25% overlap
```

**Tuning**:
- **Increase chunk size** (1000-1200): Better for long explanations
- **Decrease chunk size** (500-600): Better for Q&A, FAQs
- **Increase overlap** (300-400): Better context preservation
- **Decrease overlap** (100-150): Less redundancy

### Embeddings Settings
```typescript
// backend/src/services/embeddings.service.ts
private readonly MODEL = 'text-embedding-3-small';
private readonly DIMENSIONS = 1536;
private readonly COST_PER_1M_TOKENS = 0.02;
```

**Alternatives**:
- `text-embedding-3-large`: 3072 dims, 2x cost, better quality
- `text-embedding-ada-002`: 1536 dims, same cost, older model

### RAG Settings
```typescript
// backend/src/services/rag.service.ts
private readonly DEFAULT_TOP_K = 5;
private readonly DEFAULT_MIN_SCORE = 0.7;
private readonly DEFAULT_MAX_CONTEXT_LENGTH = 3000;  // ~750 tokens
```

**Phone optimizations** (in voice handler):
```typescript
topK: 3,                  // Fewer chunks
maxContextLength: 2000    // Shorter context
```

## Cost Analysis

### Embedding Generation
```
1000 documents × 5000 chars avg = 5M chars
≈ 1.25M tokens
Cost: $0.02 per 1M tokens × 1.25 = $0.025
```

### Storage
```
1 embedding = 1536 floats × 4 bytes = 6KB
1000 docs × 10 chunks avg = 10,000 embeddings
Total: ~60MB
```

### Query Cost
```
1 query embedding ≈ 50 tokens
Cost per query: $0.000001 (negligible)
```

### Total Monthly (1000 docs, 10K queries)
- Embedding generation: $0.025 (one-time)
- Query embeddings: $0.50/month
- MongoDB Atlas M10: $60/month
- **Total: ~$60.50/month**

## MongoDB Atlas Setup

**REQUIRED**: MongoDB Atlas M10+ cluster ($60+/month)

See detailed setup: [MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md)

**Quick Start**:
1. Create M10+ Atlas cluster
2. Navigate to Search → Create Index
3. Use JSON Editor with this config:

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

## Testing

### 1. Upload Test Document

```bash
curl -X POST http://localhost:5000/api/v1/knowledge-base/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-document.pdf" \
  -F "agentId=YOUR_AGENT_ID"
```

### 2. Check Processing Status

```bash
curl http://localhost:5000/api/v1/knowledge-base/YOUR_AGENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Wait for `status: "ready"`

### 3. Test RAG Query

```bash
curl -X POST http://localhost:5000/api/v1/knowledge-base/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the refund policy?",
    "agentId": "YOUR_AGENT_ID",
    "topK": 5
  }'
```

### 4. Test in Phone Call

1. Upload knowledge base document
2. Wait for processing to complete
3. Make phone call to agent
4. Ask question related to document
5. Agent should respond with KB-informed answer

Check logs for:
```
🔍 RAG: Query is relevant, searching knowledge base
✅ RAG: Found relevant context { chunks: 3, maxScore: '0.891' }
```

## Troubleshooting

### No results from RAG query

**Possible causes**:
1. Documents not processed (check status)
2. Vector index not created in Atlas
3. Query not relevant (check `isQueryRelevantForKB`)
4. minScore too high (try 0.6)

**Debug**:
```bash
# Check document status
curl http://localhost:5000/api/v1/knowledge-base/stats/YOUR_AGENT_ID

# Test query with lower threshold
curl -X POST .../query -d '{"minScore": 0.5, ...}'
```

### Slow processing

**Causes**:
- Large file (>5MB)
- Many chunks (>100)
- Slow OpenAI API

**Solutions**:
- Reduce chunk size (fewer chunks)
- Use batch embedding (already implemented)
- Process asynchronously (already implemented)

### RAG not triggering in calls

**Check**:
1. Query relevance detection (`isQueryRelevantForKB`)
2. Knowledge base has ready documents
3. Vector index is active
4. Logs show RAG skip reason

**Debug logs**:
```
RAG: Query not relevant for KB (conversational/greeting)
⚠️ RAG: No relevant context found
❌ RAG: Failed to query knowledge base
```

## Best Practices

### Document Preparation
- ✅ Clean, well-formatted text
- ✅ Remove irrelevant headers/footers
- ✅ Use section headings
- ✅ Break into logical sections
- ❌ Avoid scanned images (use OCR first)
- ❌ Avoid tables (convert to text)

### Optimal File Size
- Small files (< 1MB): Fast processing
- Medium files (1-5MB): Balanced
- Large files (5-10MB): Slow but supported

### Chunk Size Tuning
- **Q&A / FAQs**: 500-700 chars
- **Documentation**: 800-1000 chars
- **Long articles**: 1000-1500 chars

### Context Length
- **Phone calls**: 2000 chars max (fast responses)
- **Chat**: 3000-4000 chars (detailed answers)
- **API**: 5000+ chars (comprehensive context)

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Upload document | ~0-50ms | Async processing |
| Text extraction | ~200-500ms | Per document |
| Chunking | ~50-100ms | Per document |
| Embedding generation | ~500-1500ms | Batch of 10-50 chunks |
| Full processing | ~2-5s | Per 5-page document |
| RAG query | ~150-350ms | Per query |
| - Query embedding | ~100-200ms | OpenAI API |
| - Vector search | ~50-150ms | MongoDB Atlas |

## Roadmap

- [ ] Support for more file types (Excel, CSV, JSON)
- [ ] OCR support for scanned PDFs
- [ ] Table extraction and parsing
- [ ] Multi-modal RAG (images, diagrams)
- [ ] Citation links in responses
- [ ] Document versioning
- [ ] Hybrid search (vector + keyword)
- [ ] Re-ranking with cross-encoder

## Related Documentation

- [MongoDB Atlas Vector Search Setup](./MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md)
- [Latency Optimizations V4](./LATENCY_OPTIMIZATIONS_V4.md)
- [LLM Model Comparison](./LLM_MODEL_COMPARISON.md)

## Support

For issues or questions:
1. Check logs: `pm2 logs backend`
2. Review this documentation
3. Check MongoDB Atlas index status
4. Test with `/api/v1/knowledge-base/query` endpoint
