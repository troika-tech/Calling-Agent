# Quick Fix: MongoDB Vector Search Index Error

## The Error
```
VectorValuesField "$type:knnVector/chunks.embedding" appears more than once in this document
```

## Why It Happens
The vector index is configured incorrectly for an **array field**. It's trying to index multiple embeddings in one document as if it's a single embedding.

## Quick Fix (5 Steps)

### Step 1: Go to MongoDB Atlas
Open [https://cloud.mongodb.com/](https://cloud.mongodb.com/)

### Step 2: Delete Old Index
1. Click your cluster
2. Go to **"Search"** tab (NOT "Indexes")
3. Find **"vector_index"**
4. Click trash icon → Delete → Confirm

### Step 3: Create New Index
1. Still in **"Search"** tab
2. Click **"Create Search Index"**
3. Choose **"JSON Editor"**
4. Set:
   - **Database**: Your database name
   - **Collection**: `knowledgebases`
   - **Index Name**: `vector_index`

### Step 4: Paste This Configuration

**Important**: MongoDB Atlas uses this syntax for vector indexes:

```json
{
  "fields": [{
    "type": "vector",
    "path": "chunks.embedding",
    "numDimensions": 1536,
    "similarity": "cosine"
  }]
}
```

**Note**: MongoDB Atlas Vector Search automatically handles arrays. The `chunks.embedding` path will index each embedding in the `chunks` array separately.

### Step 5: Create and Wait
1. Click **"Create Search Index"**
2. Wait 2-5 minutes for status to become **"Active"** (green)
3. Done! ✅

## Test It Works

Make a test query:
```bash
POST http://localhost:5000/api/v1/knowledge-base/query
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "agentId": "YOUR_AGENT_ID",
  "query": "test",
  "topK": 3
}
```

Should return results (not an error).

## What's the Issue?

The error happens because MongoDB Atlas Vector Search needs to be properly configured. The issue is likely:

1. **Stale Index**: Old index configuration causing replication errors
2. **Oplog Issue**: Index fell off the oplog and needs rebuild

## The Fix

Simply **delete and recreate** the index with the correct syntax:

```json
{
  "fields": [{
    "type": "vector",
    "path": "chunks.embedding",
    "numDimensions": 1536,
    "similarity": "cosine"
  }]
}
```

MongoDB Atlas automatically handles the `chunks` array - it will index each embedding in the array individually.

## That's It!

The error should be gone and vector search should work. 🎉

For more details, see [MONGODB_VECTOR_INDEX_FIX.md](MONGODB_VECTOR_INDEX_FIX.md)
