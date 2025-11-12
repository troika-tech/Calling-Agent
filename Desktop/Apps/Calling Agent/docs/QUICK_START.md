# Quick Start Guide

## 🚨 ONE THING TO DO

**Create MongoDB Atlas Vector Index** (5 minutes)

```
📖 Follow: VECTOR_INDEX_QUICK_GUIDE.md
```

This is the ONLY thing preventing your knowledge base from working!

---

## ✅ Already Done

- ✅ Transcription fix deployed
- ✅ Test scripts ready
- ✅ Documentation complete
- ✅ Everything working except vector search

---

## 🧪 Quick Test Commands

```bash
# SSH into server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@13.127.214.73
cd ~/calling-agent

# List agents
node list-agents-simple.js

# Test vector search (will show error until index is created)
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"

# Test KB (will work after vector index is created)
node test-kb-simple.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"

# Check logs
pm2 logs calling-agent
```

---

## 📋 Vector Index Quick Setup

1. Go to: https://cloud.mongodb.com/
2. Click: Your Cluster → **Search** tab
3. Click: **[+ Create Search Index]**
4. Use JSON Editor:
   - Database: *(your database)*
   - Collection: `knowledgechunks`
   - Index Name: `vector_index_chunks`
   - Configuration:
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
5. Click: **[Create Search Index]**
6. Wait for status: **Active** ✅

---

## ✅ Verify It Works

```bash
# After vector index is Active
node test-vector-search.js 6901dadc921a728c0e2e5fd9 "What is WhatsApp?"

# Should show:
# ✅ Found 5 results
# 1. Score: 0.8542 - WhatsApp Edited File Info.docx
```

---

## 📚 Need More Details?

- **Vector Index Setup:** [VECTOR_INDEX_QUICK_GUIDE.md](VECTOR_INDEX_QUICK_GUIDE.md)
- **Troubleshooting:** [FIX_VECTOR_INDEX.md](FIX_VECTOR_INDEX.md)
- **Complete Summary:** [SETUP_COMPLETE_SUMMARY.md](SETUP_COMPLETE_SUMMARY.md)
- **Testing Guide:** [KB_TEST_README.md](KB_TEST_README.md)

---

## 🎯 Success Checklist

- [ ] Created vector index in MongoDB Atlas
- [ ] Index status shows "Active"
- [ ] `test-vector-search.js` returns results
- [ ] Made test call - agent responds to speech
- [ ] Made test call - agent uses KB information
- [ ] Logs show: `✅ RAG: Found relevant context`

---

**🚀 Start here: [VECTOR_INDEX_QUICK_GUIDE.md](VECTOR_INDEX_QUICK_GUIDE.md)**
