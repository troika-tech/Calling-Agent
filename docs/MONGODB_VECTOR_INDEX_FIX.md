# MongoDB Vector Search Index Fix

## Problem

MongoDB Atlas is showing this error:
```
VectorValuesField "$type:knnVector/chunks.embedding" appears more than once in this document
```

**Root Cause**: The vector index is configured incorrectly for an array field. Each document has multiple chunks (array), and each chunk has an embedding. MongoDB Vector Search needs special configuration to index array fields.

## Solution

You need to **delete the current index** and **recreate it with the correct configuration**.

---

## Step 1: Delete the Stale Index

### Via MongoDB Atlas UI:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Click on your cluster
3. Click **"Search"** tab (not Indexes)
4. Find the index named **"vector_index"**
5. Click the **trash icon** to delete it
6. Confirm deletion

### Via MongoDB Compass:

1. Open MongoDB Compass
2. Connect to your cluster
3. Select the `knowledgebases` collection
4. Click **"Search Indexes"** tab
5. Find **"vector_index"**
6. Click **"Drop Index"**
7. Confirm

---

## Step 2: Create the Correct Vector Search Index

### Option A: MongoDB Atlas UI (Recommended)

1. Go to MongoDB Atlas → Your Cluster
2. Click **"Search"** tab
3. Click **"Create Search Index"**
4. Select **"JSON Editor"**
5. **Index Name**: `vector_index`
6. **Collection**: `knowledgebases`
7. Paste this JSON configuration:

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

8. Click **"Create Search Index"**
9. Wait for index to build (usually 1-5 minutes for small collections)

**Note**: MongoDB Atlas automatically handles the `chunks` array - it will index each embedding in the array individually.

### Option B: Using MongoDB Shell

```javascript
db.knowledgebases.createSearchIndex(
  "vector_index",
  {
    "mappings": {
      "fields": {
        "chunks": {
          "type": "embeddedDocuments",
          "fields": {
            "embedding": {
              "type": "knnVector",
              "dimensions": 1536,
              "similarity": "cosine"
            }
          }
        },
        "agentId": {
          "type": "objectId"
        },
        "isActive": {
          "type": "boolean"
        },
        "status": {
          "type": "string"
        }
      }
    }
  }
)
```

### Option C: Using Mongoose (Programmatic)

**Note**: This requires MongoDB Atlas API access. Not recommended for production.

---

## Step 3: Verify Index Creation

### Check Index Status

1. Go to MongoDB Atlas → Search tab
2. Find **"vector_index"**
3. Status should show **"Active"** (green)
4. If status is **"Building"**, wait a few minutes

### Test the Index

Run this test query in MongoDB Compass or Shell:

```javascript
db.knowledgebases.aggregate([
  {
    $search: {
      index: "vector_index",
      exists: {
        path: "chunks.embedding"
      }
    }
  },
  { $limit: 1 }
])
```

If this returns a document, the index is working!

---

## Step 4: Test Vector Search from Backend

### Test Query

Make a POST request to test RAG:

```bash
POST http://localhost:5000/api/v1/knowledge-base/query
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "agentId": "YOUR_AGENT_ID",
  "query": "test query",
  "topK": 5,
  "minScore": 0.7
}
```

**Expected Response** (if working):
```json
{
  "success": true,
  "data": {
    "query": "test query",
    "chunks": [
      {
        "text": "...",
        "score": 0.92,
        "fileName": "document.pdf"
      }
    ],
    "totalChunks": 5
  }
}
```

**Error Response** (if index not ready):
```json
{
  "success": false,
  "error": "No vector index found"
}
```

---

## Understanding the Configuration

### Why `embeddedDocuments`?

```json
{
  "chunks": {
    "type": "embeddedDocuments",  // ← CRITICAL
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 1536,
        "similarity": "cosine"
      }
    }
  }
}
```

**Explanation**:
- `chunks` is an **array** of subdocuments
- Each subdocument has an `embedding` field
- `embeddedDocuments` tells Atlas to index **each array element separately**
- Without this, Atlas tries to index the whole array as one vector (ERROR!)

### Filter Fields

```json
{
  "type": "filter",
  "path": "agentId"
}
```

**Purpose**:
- Allows filtering by `agentId`, `isActive`, `status` during vector search
- Improves query performance
- Ensures only relevant documents are searched

---

## Correct Index Definition (Complete)

### Full Atlas Search Index JSON

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "chunks": {
        "type": "embeddedDocuments",
        "dynamic": false,
        "fields": {
          "embedding": {
            "type": "knnVector",
            "dimensions": 1536,
            "similarity": "cosine"
          },
          "text": {
            "type": "string"
          },
          "chunkIndex": {
            "type": "number"
          }
        }
      },
      "agentId": {
        "type": "objectId"
      },
      "userId": {
        "type": "objectId"
      },
      "isActive": {
        "type": "boolean"
      },
      "status": {
        "type": "string"
      },
      "fileName": {
        "type": "string"
      },
      "fileType": {
        "type": "string"
      }
    }
  }
}
```

### Simplified Version (Recommended for Most Cases)

```json
{
  "mappings": {
    "fields": {
      "chunks": {
        "type": "embeddedDocuments",
        "fields": {
          "embedding": {
            "type": "knnVector",
            "dimensions": 1536,
            "similarity": "cosine"
          }
        }
      },
      "agentId": {
        "type": "objectId"
      },
      "isActive": {
        "type": "boolean"
      },
      "status": {
        "type": "string"
      }
    }
  }
}
```

---

## Troubleshooting

### Issue 1: "Index is building" for a long time

**Cause**: Large collection or slow cluster

**Solution**:
- Wait 5-10 minutes
- Check cluster performance
- Reduce collection size if needed

### Issue 2: "No results found" after index is active

**Possible Causes**:
1. No documents with `status: 'ready'`
2. Query embedding format incorrect
3. Similarity threshold too high

**Solutions**:
```javascript
// Check ready documents
db.knowledgebases.countDocuments({ status: 'ready' })

// Lower similarity threshold
{
  "minScore": 0.5  // Instead of 0.7
}

// Check embedding format
db.knowledgebases.findOne(
  { status: 'ready' },
  { 'chunks.embedding': 1 }
)
```

### Issue 3: Vector search query fails

**Error**: `No vector search index found`

**Cause**: Index not created or wrong name

**Solution**:
1. Verify index name is exactly `vector_index`
2. Check index is in `knowledgebases` collection
3. Ensure index status is "Active"

### Issue 4: Replication still failing after index recreation

**Cause**: Stale documents with old structure

**Solution**:
```javascript
// Find problematic documents
db.knowledgebases.find({
  $expr: {
    $gt: [{ $size: { $ifNull: ["$chunks", []] } }, 0]
  }
}).forEach(doc => {
  // Check embedding structure
  if (doc.chunks && doc.chunks[0]) {
    print("Document:", doc._id);
    print("First chunk embedding length:", doc.chunks[0].embedding?.length);
  }
});

// If you find invalid documents, delete and re-upload
db.knowledgebases.deleteMany({
  status: 'failed'
})
```

---

## Prevention

To prevent this issue in the future:

1. **Always use `embeddedDocuments`** for array fields with vectors
2. **Test index configuration** in staging before production
3. **Monitor index health** in Atlas dashboard
4. **Keep Atlas SDK updated** for latest features

---

## Alternative: Flat Structure (Not Recommended)

If you want to avoid `embeddedDocuments`, you could restructure the schema:

**Current (Array)**:
```json
{
  "_id": "...",
  "agentId": "...",
  "fileName": "doc.pdf",
  "chunks": [
    { "text": "...", "embedding": [0.1, 0.2, ...] },
    { "text": "...", "embedding": [0.3, 0.4, ...] }
  ]
}
```

**Alternative (Flat - One document per chunk)**:
```json
// Document 1
{
  "_id": "...",
  "agentId": "...",
  "fileName": "doc.pdf",
  "chunkIndex": 0,
  "text": "...",
  "embedding": [0.1, 0.2, ...]
}

// Document 2
{
  "_id": "...",
  "agentId": "...",
  "fileName": "doc.pdf",
  "chunkIndex": 1,
  "text": "...",
  "embedding": [0.3, 0.4, ...]
}
```

**Index would be**:
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",  // ← Direct path, no array
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

**Pros**:
- Simpler index configuration
- No array handling

**Cons**:
- More documents in collection
- Harder to manage (delete all chunks when deleting document)
- Not recommended for this use case

---

## Summary

### What to Do Right Now

1. ✅ **Delete** the current `vector_index` in MongoDB Atlas
2. ✅ **Create new index** using the configuration above
3. ✅ **Wait** for index to become "Active"
4. ✅ **Test** with a query endpoint
5. ✅ **Verify** no replication errors

### Correct Configuration

```json
{
  "mappings": {
    "fields": {
      "chunks": {
        "type": "embeddedDocuments",  ← KEY PART
        "fields": {
          "embedding": {
            "type": "knnVector",
            "dimensions": 1536,
            "similarity": "cosine"
          }
        }
      },
      "agentId": { "type": "objectId" },
      "isActive": { "type": "boolean" },
      "status": { "type": "string" }
    }
  }
}
```

### Expected Result

After fixing:
- ✅ No replication errors
- ✅ Index shows "Active" status
- ✅ Vector search queries work
- ✅ RAG returns relevant chunks during calls

---

## Quick Fix Command (Atlas Search Index JSON)

Copy and paste this into Atlas Search Index creator:

```json
{
  "mappings": {
    "fields": {
      "chunks": {
        "type": "embeddedDocuments",
        "fields": {
          "embedding": {
            "type": "knnVector",
            "dimensions": 1536,
            "similarity": "cosine"
          }
        }
      },
      "agentId": {
        "type": "objectId"
      },
      "isActive": {
        "type": "boolean"
      },
      "status": {
        "type": "string"
      }
    }
  }
}
```

**Index Name**: `vector_index`
**Collection**: `knowledgebases`

Done! ✅
