# Fix Vector Search - Create MongoDB Atlas Vector Index

## Problem

The vector search is not working because **the vector index is not configured in MongoDB Atlas**.

Test results show:
- ✅ MongoDB connection: Working
- ✅ Knowledge base documents: Found (2 documents, 65 chunks)
- ✅ Embeddings: Present (1536 dimensions)
- ❌ Vector search: **NOT WORKING** (no results returned)

## Root Cause

MongoDB Atlas requires a **Search Index** to be manually created for vector search operations. This index tells MongoDB how to perform similarity searches on the embedding field.

## Solution: Create Vector Search Index

### Step 1: Access MongoDB Atlas

1. Go to https://cloud.mongodb.com/
2. Log in to your MongoDB Atlas account
3. Select your project
4. Click on your cluster

### Step 2: Navigate to Search Indexes

1. In your cluster view, click on the **"Search"** tab (or "Atlas Search")
2. Click **"Create Search Index"**

### Step 3: Configure the Index

**Index Configuration:**

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

**Important Settings:**
- **Database name**: Check your MongoDB URI for the database name (usually in the connection string)
- **Collection name**: `knowledgechunks` (exactly this, all lowercase)
- **Index name**: `vector_index_chunks` (exactly this)

### Step 4: Visual Guide

#### Option A: JSON Editor (Recommended)

1. Click **"Create Search Index"**
2. Select **"JSON Editor"**
3. Choose your database
4. Collection: `knowledgechunks`
5. Index name: `vector_index_chunks`
6. Paste the JSON configuration above
7. Click **"Create Search Index"**

#### Option B: Visual Editor

1. Click **"Create Search Index"**
2. Select **"Visual Editor"**
3. Choose your database
4. Collection: `knowledgechunks`
5. Index name: `vector_index_chunks`
6. Click **"Add Field"**
7. Configure:
   - Field name: `embedding`
   - Data type: `vector`
   - Dimensions: `1536`
   - Similarity: `cosine`
8. Click **"Create Search Index"**

### Step 5: Wait for Index to Build

- The index will show status: **"Building..."** → **"Active"**
- This usually takes **1-5 minutes** depending on the number of chunks
- You have 65 chunks, so it should be very quick (< 1 minute)

### Step 6: Verify the Index

Once the index shows **"Active"** status:

```bash
# SSH into your server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73
cd ~/calling-agent

# Run the test
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
```

**Expected Output After Fix:**
```
Test 1: Vector search WITHOUT score filter (get top 5)
────────────────────────────────────────────────────────────
✅ Found 5 results

1. Score: 0.8542 - WhatsApp Edited File Info.docx
   Text: "WhatsApp marketing is the bulk messaging service..."

2. Score: 0.8231 - WhatsApp Edited File Info.docx
   Text: "Price Breakup: 10 Lac Messages would cost you..."
```

## Complete Configuration Reference

### Correct Index Configuration

```json
{
  "name": "vector_index_chunks",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 1536,
        "similarity": "cosine"
      }
    ]
  }
}
```

### Common Mistakes to Avoid

❌ **Wrong collection name**
- Wrong: `knowledgeChunks`, `KnowledgeChunks`, `knowledge_chunks`
- Correct: `knowledgechunks` (all lowercase)

❌ **Wrong index name**
- Wrong: `vector_index`, `chunks_vector`, `embedding_index`
- Correct: `vector_index_chunks` (exactly this)

❌ **Wrong field path**
- Wrong: `embeddings`, `vector`, `embedding.value`
- Correct: `embedding` (singular, top-level field)

❌ **Wrong dimensions**
- Wrong: 768, 512, 1024
- Correct: 1536 (for OpenAI text-embedding-3-small)

❌ **Wrong similarity function**
- Wrong: `euclidean`, `dotProduct`
- Correct: `cosine` (best for OpenAI embeddings)

## Troubleshooting

### Index Creation Fails

**Error: "Collection not found"**
- Solution: Make sure you're in the correct database
- Check your MongoDB connection string for the database name

**Error: "Invalid configuration"**
- Solution: Use the exact JSON configuration provided above
- Make sure dimensions is exactly `1536`

### Index Shows "Failed" Status

- Delete the index
- Double-check the configuration
- Make sure collection name is exactly `knowledgechunks`
- Try creating again

### Index is Active but Search Still Fails

1. Wait an additional 2-3 minutes (propagation time)
2. Verify the index name in the code matches exactly: `vector_index_chunks`
3. Check if you have multiple databases - make sure index is in the correct one

## Testing After Fix

### Test 1: Quick Vector Search Test
```bash
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
```

Should return results with similarity scores.

### Test 2: Full KB Test
```bash
node test-kb-simple.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
```

Should find and display relevant chunks with scores > 0.7.

### Test 3: Make a Real Call

1. Call your agent
2. Ask: "What is WhatsApp?"
3. Check logs:
   ```bash
   pm2 logs calling-agent | grep -i "RAG"
   ```
4. Should see: `✅ RAG: Found relevant context`

## Why This is Needed

MongoDB Atlas Vector Search is a **separate feature** from regular MongoDB indexes:

1. **Regular Index**: For exact matches, ranges, sorting
   - Created automatically or via `createIndex()`
   - Example: `{ agentId: 1, isActive: 1 }`

2. **Vector Search Index**: For similarity/semantic search
   - **Must be created manually in Atlas UI**
   - Uses special algorithms (approximate nearest neighbor)
   - Enables `$vectorSearch` aggregation operator

## Alternative: Check Existing Indexes

If you're not sure if the index exists:

1. MongoDB Atlas → Your Cluster
2. Click **"Search"** tab
3. Look for index named `vector_index_chunks` on collection `knowledgechunks`
4. Status should be **"Active"** (green)

## Quick Reference

| Setting | Value |
|---------|-------|
| **Collection** | `knowledgechunks` |
| **Index Name** | `vector_index_chunks` |
| **Field Path** | `embedding` |
| **Type** | `vector` |
| **Dimensions** | `1536` |
| **Similarity** | `cosine` |

## After Creating the Index

Once the vector index is active and working:

1. ✅ KB retrieval will work during phone calls
2. ✅ Test scripts will return results with similarity scores
3. ✅ Agent will be able to answer questions using your documents
4. ✅ You'll see `✅ RAG: Found relevant context` in logs

## Need Help?

If you still have issues after creating the index:

1. Verify index status is "Active" in Atlas
2. Wait 2-3 minutes after it becomes active
3. Run: `node test-vector-search.js <agentId> "test query"`
4. Check if results are returned

The test script will give you specific error messages if something is wrong.
