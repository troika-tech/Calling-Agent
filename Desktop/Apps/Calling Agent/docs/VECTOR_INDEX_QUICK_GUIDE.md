# MongoDB Atlas Vector Index - Quick Setup Guide

## 🎯 Goal
Create a vector search index to enable AI-powered knowledge base retrieval.

## ⏱️ Time Required
5 minutes (most of it is waiting for the index to build)

---

## 📋 Step-by-Step Instructions

### 1️⃣ Log in to MongoDB Atlas

```
🌐 https://cloud.mongodb.com/
```

- Use your MongoDB Atlas credentials
- Select your project
- Click on your cluster name

---

### 2️⃣ Open Search Tab

In the cluster view:
- Look for tabs: **Overview | Metrics | Performance Advisor | Search**
- Click on **"Search"** tab

---

### 3️⃣ Create Search Index

Click the button:
```
[+ Create Search Index]
```

---

### 4️⃣ Choose Configuration Method

You'll see two options:
- **Visual Editor** (easier for beginners)
- **JSON Editor** (faster if you know what you're doing)

**Recommended: Use JSON Editor**

---

### 5️⃣ Configure the Index

#### Using JSON Editor (Recommended):

**1. Select your database** from dropdown

**2. Collection:** `knowledgechunks` (type exactly this)

**3. Index Name:** `vector_index_chunks` (type exactly this)

**4. Paste this configuration:**

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

**5. Click:** `[Create Search Index]`

---

#### Alternative - Using Visual Editor:

**1. Select your database**

**2. Collection:** `knowledgechunks`

**3. Index Name:** `vector_index_chunks`

**4. Click:** `[Add Field]`

**5. Fill in:**
- **Field name:** `embedding`
- **Data type:** Select `vector` from dropdown
- **Dimensions:** `1536`
- **Similarity:** Select `cosine`

**6. Click:** `[Create Search Index]`

---

### 6️⃣ Wait for Index to Build

You'll see the index status:

```
🔄 Building... (yellow/orange)
```

Wait for it to change to:

```
✅ Active (green)
```

⏱️ This usually takes **30 seconds to 2 minutes** for 65 chunks.

---

### 7️⃣ Verify It Works

Once status is **Active**, test it:

```bash
# SSH into your server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73
cd ~/calling-agent

# Run test
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
```

**Expected Output:**
```
✅ Found 5 results

1. Score: 0.8542 - WhatsApp Edited File Info.docx
   Text: "WhatsApp marketing is the bulk messaging service..."
```

---

## ✅ Success Checklist

- [ ] Logged into MongoDB Atlas
- [ ] Opened Search tab in cluster view
- [ ] Created new search index
- [ ] Used collection name: `knowledgechunks` (exact spelling)
- [ ] Used index name: `vector_index_chunks` (exact spelling)
- [ ] Configured vector field: `embedding`, 1536 dimensions, cosine similarity
- [ ] Index status shows **"Active"** (green)
- [ ] Tested with `test-vector-search.js` - returns results ✅
- [ ] Tested with `test-kb-simple.js` - shows chunks with scores ✅

---

## 🔍 Quick Reference

| Setting | Value |
|---------|-------|
| Database | *(your database name from connection string)* |
| Collection | `knowledgechunks` |
| Index Name | `vector_index_chunks` |
| Field | `embedding` |
| Type | `vector` |
| Dimensions | `1536` |
| Similarity | `cosine` |

---

## ⚠️ Common Issues

### Issue 1: "Collection not found"
**Solution:** Make sure you selected the correct database name.

### Issue 2: Index creation fails
**Solution:** Double-check spelling of collection name: `knowledgechunks` (all lowercase, no spaces)

### Issue 3: Test still fails after index is Active
**Solution:** Wait 2-3 more minutes for propagation, then test again.

### Issue 4: Can't find Search tab
**Solution:** You might be in the wrong view. Make sure you're viewing your cluster (not the project overview).

---

## 🎉 What Happens After This?

Once the vector index is working:

1. **During phone calls:** When a user asks a question, the system will:
   - Generate an embedding for the question
   - Search your knowledge base using vector similarity
   - Find the most relevant chunks (with scores > 0.7)
   - Include that information in the AI's context
   - AI responds with accurate information from your documents

2. **In the logs:** You'll see messages like:
   ```
   🔍 RAG: Query is relevant, searching knowledge base
   ✅ RAG: Found relevant context (3 chunks, max score: 0.8542)
   ```

3. **Test scripts will work:** All KB testing scripts will return results with similarity scores.

---

## 🧪 Testing Checklist (After Index is Active)

Run these tests in order:

```bash
cd ~/calling-agent

# Test 1: Vector search works
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
# Should return 5 results with scores

# Test 2: KB retrieval works
node test-kb-simple.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"
# Should show chunks with scores > 0.7

# Test 3: Make a real call
# Call your agent and ask: "What is WhatsApp?"
# Then check logs:
pm2 logs calling-agent | grep -i "RAG"
# Should see: "✅ RAG: Found relevant context"
```

---

## 📞 Support

If you still have issues after following this guide:
1. Check that index status is "Active" (green) in Atlas
2. Wait 2-3 minutes after it becomes active
3. Run the test scripts above
4. Check the error messages - they will guide you

---

## 💡 Why We Need This

MongoDB Atlas Vector Search requires a **manual index creation** because:

1. It uses special algorithms (approximate nearest neighbor search)
2. It's a premium feature that needs explicit configuration
3. It's different from regular MongoDB indexes
4. It enables semantic/similarity search (not exact matches)

Regular MongoDB collections don't support `$vectorSearch` operator without this index!

---

## ⏭️ Next Steps

After the index is created and tested:

1. ✅ Your knowledge base is fully operational
2. ✅ Make test calls to verify AI uses your documents
3. ✅ Upload more documents as needed
4. ✅ Monitor KB usage in call logs

Done! 🎉
