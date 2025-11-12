# Fix Vector Index - Add Filter Fields

## Problem

The vector search is failing with this error:
```
Path 'agentId' needs to be indexed as filter
```

This means the vector index needs to include fields that are used in the filter (agentId and isActive).

## Solution

Update your vector search index in MongoDB Atlas to include filter fields.

---

## Step-by-Step Fix

### 1. Go to MongoDB Atlas

- URL: https://cloud.mongodb.com/
- Navigate to your cluster
- Click on the **"Search"** tab

### 2. Edit the Existing Index

- Find the index named: `knowledgechunks`
- Click the **"Edit"** button (or the **"..."** menu → **"Edit Index"**)

### 3. Replace the Configuration

**Current configuration (incomplete):**
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

**New configuration (with filter fields):**
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
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
    }
  ]
}
```

### 4. Save the Changes

- Click **"Save"** button
- Wait for the index to rebuild (should be quick, < 1 minute)
- Status will show: **Building** → **READY**

---

## What This Does

### Vector Field
```json
{
  "type": "vector",
  "path": "embedding",
  "numDimensions": 1536,
  "similarity": "cosine"
}
```
- Enables semantic/similarity search on the embedding field
- Uses cosine similarity to find similar vectors

### Filter Fields
```json
{
  "type": "filter",
  "path": "agentId"
},
{
  "type": "filter",
  "path": "isActive"
}
```
- Allows filtering results by agentId (so each agent only sees their own documents)
- Allows filtering by isActive (so only active chunks are returned)
- **Required** for any field used in the `filter` parameter of `$vectorSearch`

---

## Testing After Fix

Once the index shows **READY** status:

```bash
# SSH into server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73
cd ~/calling-agent

# Test vector search
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
```

**Expected output:**
```
✅ Found 5 results

1. Score: 0.8542 - WhatsApp Edited File Info.docx
   Text: "WhatsApp marketing is the bulk messaging service..."

2. Score: 0.8231 - WhatsApp Edited File Info.docx
   Text: "Price Breakup: 10 Lac Messages would cost you..."
```

---

## Complete Index Configuration Reference

```json
{
  "name": "knowledgechunks",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
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
      }
    ]
  }
}
```

---

## Visual Guide

### In MongoDB Atlas UI:

**1. Click "Search" tab** → Find your `knowledgechunks` index

**2. Click "Edit"** (or **"..."** → **"Edit Index"**)

**3. You'll see the JSON editor with your current configuration**

**4. Add the two filter fields:**
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {                           ← ADD THIS
      "type": "filter",         ← ADD THIS
      "path": "agentId"         ← ADD THIS
    },                          ← ADD THIS
    {                           ← ADD THIS
      "type": "filter",         ← ADD THIS
      "path": "isActive"        ← ADD THIS
    }                           ← ADD THIS
  ]
}
```

**5. Click "Save"**

**6. Wait for status:** Building → READY

---

## Why This is Needed

When you use `$vectorSearch` with a filter like this:

```javascript
{
  $vectorSearch: {
    index: 'knowledgechunks',
    path: 'embedding',
    queryVector: [/* embedding array */],
    filter: {
      agentId: ObjectId("..."),  // ← agentId needs to be indexed
      isActive: true             // ← isActive needs to be indexed
    }
  }
}
```

MongoDB Atlas needs to know that `agentId` and `isActive` should be indexed as filterable fields. Without this, it can't efficiently filter the results by these fields.

---

## Alternative: Visual Editor

If you prefer using the Visual Editor:

1. Click "Edit Index"
2. Switch to **"Visual Editor"**
3. The vector field should already be there
4. Click **"Add Field"**
5. Configure:
   - Field name: `agentId`
   - Data type: Select **"Filter"**
6. Click **"Add Field"** again
7. Configure:
   - Field name: `isActive`
   - Data type: Select **"Filter"**
8. Click **"Save"**

---

## Verification Checklist

After updating the index:

- [ ] Index status shows **"READY"**
- [ ] `test-vector-search.js` returns results ✅
- [ ] Results have similarity scores
- [ ] `test-kb-simple.js` shows chunks with scores > 0.7 ✅
- [ ] Made test call - agent uses KB information ✅
- [ ] Logs show: `✅ RAG: Found relevant context` ✅

---

## Common Issues

### "Index is still building"
- **Solution:** Wait 1-2 minutes, then test again

### "Cannot edit index"
- **Solution:** Delete the old index and create a new one with the complete configuration above

### Test still fails after update
- **Solution:** Wait 2-3 minutes for propagation, verify index name is exactly `knowledgechunks`

---

## Summary

**What was wrong:** Vector index was missing filter field definitions

**What to do:** Add `agentId` and `isActive` as filter fields in the index

**Time required:** 2 minutes to edit + 1 minute for index to rebuild

**After fix:** Vector search will work perfectly! 🎉
