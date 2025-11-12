# Vector Index - Final Fix (Restructured Data Model)

## The Problem

MongoDB Atlas Vector Search **cannot index multiple vectors in the same document**. The error you saw:

```
VectorValuesField "$type:knnVector/chunks.embedding" appears more than once in this document
```

This happened because our old structure stored chunks as an array:

```javascript
{
  "_id": "doc1",
  "fileName": "file.pdf",
  "chunks": [
    { "embedding": [...] },  // Vector 1
    { "embedding": [...] }   // Vector 2 ← ERROR: Multiple vectors!
  ]
}
```

## The Solution

**Restructured the data model** to store one vector per document. Now chunks are in a **separate collection**:

### Old Structure (Broken)
- `knowledgebases` collection with embedded `chunks` array
- Each document had multiple embeddings
- Vector index couldn't handle it

### New Structure (Working)
- `knowledgebases` collection - Document metadata only
- `knowledgechunks` collection - One chunk per document
- Each chunk document has exactly ONE embedding

## What Was Changed

### 1. New Model: KnowledgeChunk

Created `backend/src/models/KnowledgeChunk.ts`:

```typescript
{
  documentId: ObjectId,      // Reference to parent document
  agentId: ObjectId,         // For filtering
  userId: ObjectId,
  fileName: string,
  fileType: 'pdf' | 'docx' | 'txt',
  text: string,
  embedding: number[],       // THE VECTOR (only one!)
  chunkIndex: number,
  metadata: { pageNumber, section, ... },
  isActive: boolean
}
```

### 2. Updated KnowledgeBase Model

Removed `chunks` array from `KnowledgeBase` model. Now it only stores metadata:

```typescript
{
  agentId: ObjectId,
  userId: ObjectId,
  fileName: string,
  fileType: string,
  fileSize: number,
  status: 'processing' | 'ready' | 'failed',
  totalChunks: number,      // Count only
  totalTokens: number,
  totalCharacters: number,
  // ... no chunks array anymore!
}
```

### 3. Updated Processing Logic

When a document is uploaded:
1. Create `KnowledgeBase` document (metadata)
2. Extract text → Chunk → Generate embeddings
3. Create **multiple** `KnowledgeChunk` documents (one per chunk)
4. Update `KnowledgeBase` status to 'ready'

### 4. Updated Vector Search

Vector search now queries the `knowledgechunks` collection:

```typescript
KnowledgeChunk.vectorSearch(queryEmbedding, agentId, options)
```

### 5. Updated Delete Logic

When deleting a document:
- Soft delete the `KnowledgeBase` document
- Soft delete ALL associated `KnowledgeChunk` documents

## MongoDB Atlas Vector Index Setup

### Step 1: Delete Old Index

1. Go to MongoDB Atlas → Your Cluster
2. Click **"Search"** tab
3. Find `vector_index` (if it exists)
4. Delete it

### Step 2: Create New Vector Index

**Collection**: `knowledgechunks` (NEW collection)
**Index Name**: `vector_index_chunks`

**Configuration**:
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

**Key Point**: The path is now simply `"embedding"` (not `"chunks.embedding"`) because each document has only ONE embedding field.

###Step 3: Wait for Index to Build

- Status will change from "Building" to "Active"
- Usually takes 2-5 minutes
- No more replication errors!

## Testing

### 1. Clear Old Data (Optional but Recommended)

If you have old documents with the embedded chunks structure, delete them:

```javascript
// In MongoDB Compass or Shell
db.knowledgebases.deleteMany({})
```

### 2. Upload a New Document

1. Go to agent edit page
2. Upload a PDF/DOCX/TXT file
3. Wait for processing

### 3. Verify in Database

**Check KnowledgeBase document**:
```javascript
db.knowledgebases.findOne()
// Should have: fileName, status: 'ready', totalChunks: X
// Should NOT have: chunks array
```

**Check KnowledgeChunk documents**:
```javascript
db.knowledgechunks.find().limit(1)
// Should have: text, embedding (1536 numbers), chunkIndex, etc.
// Each chunk is a separate document!
```

### 4. Test Vector Search

Make a query:
```bash
POST http://localhost:5000/api/v1/knowledge-base/query
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "agentId": "YOUR_AGENT_ID",
  "query": "test question",
  "topK": 3
}
```

Should return relevant chunks with similarity scores.

### 5. Test During Call

1. Make a phone call to your agent
2. Ask a question related to uploaded document
3. Agent should respond with accurate information from the document

## Migration from Old Structure

If you have existing data in the old format, here's a migration script:

```javascript
// Run in MongoDB Shell or create a migration script

const knowledgeBases = db.knowledgebases.find({ chunks: { $exists: true, $ne: [] } });

knowledgeBases.forEach(doc => {
  // Create KnowledgeChunk documents from embedded chunks
  const chunkDocs = doc.chunks.map((chunk, index) => ({
    documentId: doc._id,
    agentId: doc.agentId,
    userId: doc.userId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    text: chunk.text,
    embedding: chunk.embedding,
    chunkIndex: index,
    metadata: chunk.metadata,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  // Insert chunks
  if (chunkDocs.length > 0) {
    db.knowledgechunks.insertMany(chunkDocs);
  }

  // Remove chunks from KnowledgeBase document
  db.knowledgebases.updateOne(
    { _id: doc._id },
    { $unset: { chunks: "" } }
  );
});

print("Migration complete!");
```

## Updated Architecture

```
┌─────────────────────────────────────────────┐
│  Agent Form (Upload Document)               │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│  KnowledgeBase Document (Metadata)          │
│  - fileName: "policy.pdf"                   │
│  - status: "processing"                     │
│  - totalChunks: 0                           │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│  Processing Pipeline                        │
│  1. Extract Text                            │
│  2. Chunk Text                              │
│  3. Generate Embeddings                     │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│  KnowledgeChunk Documents (Separate Docs)   │
│  ┌────────────────────────────────────────┐ │
│  │ Chunk 1: { embedding: [...] }         │ │
│  ├────────────────────────────────────────┤ │
│  │ Chunk 2: { embedding: [...] }         │ │
│  ├────────────────────────────────────────┤ │
│  │ Chunk 3: { embedding: [...] }         │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│  Vector Search Index: vector_index_chunks   │
│  Collection: knowledgechunks                │
│  Path: embedding                            │
└─────────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│  During Call: Vector Search Query           │
│  Returns: Top 5 most similar chunks         │
└─────────────────────────────────────────────┘
```

## Files Changed

### New Files
- ✅ `backend/src/models/KnowledgeChunk.ts` - NEW model

### Modified Files
- ✅ `backend/src/models/KnowledgeBase.ts` - Removed chunks array
- ✅ `backend/src/controllers/knowledgeBase.controller.ts` - Updated processing
- ✅ `backend/src/services/rag.service.ts` - Updated vector search

## Benefits of New Structure

1. ✅ **Fixes Vector Index Error**: Each document has only ONE embedding
2. ✅ **Better Performance**: Smaller documents, faster queries
3. ✅ **Scalability**: Can handle millions of chunks easily
4. ✅ **Flexibility**: Easier to update/delete individual chunks
5. ✅ **Standard Pattern**: Matches industry best practices

## Summary

### Before (Broken)
```
knowledgebases collection:
{
  fileName: "doc.pdf",
  chunks: [
    { embedding: [...]},  ← Multiple embeddings = ERROR!
    { embedding: [...]}
  ]
}
```

### After (Working)
```
knowledgebases collection:
{
  fileName: "doc.pdf",
  totalChunks: 2
}

knowledgechunks collection:
{ documentId: "...", embedding: [...] }  ← One embedding
{ documentId: "...", embedding: [...] }  ← One embedding
```

### Vector Index
```json
{
  "collection": "knowledgechunks",  ← NEW collection
  "indexName": "vector_index_chunks",
  "fields": [{
    "path": "embedding",  ← Direct path (no array!)
    "type": "vector",
    "numDimensions": 1536,
    "similarity": "cosine"
  }]
}
```

## Next Steps

1. ✅ Code changes complete (already done)
2. ✅ Build successful (already done)
3. ⏳ Create vector index in MongoDB Atlas
4. ⏳ Test document upload
5. ⏳ Test vector search
6. ⏳ Test during phone call

The code is ready! Just create the vector index in MongoDB Atlas and you're good to go! 🚀
