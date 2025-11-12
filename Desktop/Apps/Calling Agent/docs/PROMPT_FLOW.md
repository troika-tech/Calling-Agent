# Prompt Flow - Visual Guide

## Quick Overview

```
USER SPEAKS → TRANSCRIBE → BUILD PROMPT → LLM → STREAM RESPONSE → USER HEARS
```

## Detailed Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCOMING PHONE CALL                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  User speaks: "What's your refund policy?"                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Deepgram STT → Transcript: "What's your refund policy?"        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PROMPT BUILDING (Voice Handler)                                 │
│                                                                   │
│  1. Load Agent from DB                                           │
│     ├─ Get persona: agent.config.persona                        │
│     └─ Get LLM settings: agent.config.llm                       │
│                                                                   │
│  2. Check if RAG Needed                                          │
│     ├─ Is query relevant? ✅ Yes (knowledge-seeking)            │
│     ├─ Query embedding: [0.123, -0.456, ...]                   │
│     ├─ Vector search in MongoDB Atlas                           │
│     ├─ Top 3 chunks found (score > 0.7)                         │
│     └─ Format with citations [1], [2], [3]                      │
│                                                                   │
│  3. Build System Prompt                                          │
│     ├─ Global Rules (phone behavior)                            │
│     ├─ + Agent Persona (who you are)                            │
│     └─ + RAG Context (knowledge)                                │
│                                                                   │
│  4. Get Conversation History                                     │
│     └─ Previous 5-10 messages from this call                    │
│                                                                   │
│  5. Construct Messages Array                                     │
│     ├─ [0] System: Combined prompt                              │
│     ├─ [1-N] History: Previous messages                         │
│     └─ [N+1] User: Current question                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SEND TO LLM                                                     │
│                                                                   │
│  Model: gpt-4o-mini (or Claude 3.5 Haiku)                       │
│  Temperature: 0.7                                                │
│  Stream: true                                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  LLM STREAMS RESPONSE                                            │
│                                                                   │
│  Chunk 1: "We offer a 30-day"                                   │
│  Chunk 2: " money-back guarantee"                               │
│  Chunk 3: " on all products [1]."                               │
│  [SENTENCE END DETECTED]                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SENTENCE-BY-SENTENCE TTS                                        │
│                                                                   │
│  Sentence 1: "We offer a 30-day money-back guarantee..."        │
│  → Deepgram TTS (streaming)                                     │
│  → Audio chunks sent immediately to Exotel                      │
│  → User hears response while LLM still generating!              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  USER HEARS NATURAL RESPONSE                                     │
│                                                                   │
│  "We offer a 30-day money-back guarantee on all products [1].   │
│   Just email support with your order number and we'll process   │
│   your refund within a week [2]. Have you made a purchase yet?" │
└─────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Agent Configuration (Database)

```javascript
Agent {
  _id: "agent_123",
  name: "Sales Agent Sarah",
  config: {
    // Agent-specific persona
    persona: `You are Sarah, a friendly sales rep for TechCorp.
              Help customers with products, pricing, and demos.`,

    // LLM settings
    llm: {
      model: "gpt-4o-mini",
      temperature: 0.7
    },

    // Voice settings
    voice: {
      provider: "deepgram",
      voiceId: "aura-asteria-en"
    }
  }
}
```

### 2. Global System Prompt (Code)

```typescript
// backend/src/config/systemPrompt.ts
const GLOBAL_SYSTEM_PROMPT = `
  You are on a PHONE CALL. CRITICAL RULES:
  1. Maximum 2-3 SHORT sentences per response
  2. NEVER use numbered lists or bullet points
  3. Be conversational like a real person on the phone
  ...
`;
```

### 3. Knowledge Base (MongoDB Atlas)

```javascript
KnowledgeBase {
  agentId: "agent_123",
  fileName: "refund-policy.pdf",
  status: "ready",
  chunks: [
    {
      text: "We offer a 30-day money-back guarantee...",
      embedding: [0.123, -0.456, 0.789, ...],  // 1536 dims
      chunkIndex: 0,
      metadata: { pageNumber: 2 }
    },
    // ... more chunks
  ]
}
```

### 4. RAG Query Process

```
User Query
    ↓
Generate Embedding (OpenAI)
    ↓
Vector Search (MongoDB Atlas)
    ↓
┌────────────────────────────────────┐
│ Query: "refund policy"             │
│ Embedding: [0.123, -0.456, ...]   │
│                                    │
│ Search Results:                    │
│ [1] Score: 0.89 - "30-day..."     │
│ [2] Score: 0.82 - "5-7 days..."   │
│ [3] Score: 0.78 - "contact..."    │
└────────────────────────────────────┘
    ↓
Format with Citations
    ↓
Add to System Prompt
```

### 5. Complete Prompt Structure

```
┌──────────────────────────────────────────────────────────┐
│ SYSTEM MESSAGE                                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │ 1. GLOBAL SYSTEM PROMPT                          │    │
│ │    - Phone call rules                            │    │
│ │    - Brevity requirements                        │    │
│ │    - Conversational style                        │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │ 2. AGENT PERSONA                                 │    │
│ │    - Who you are (Sarah, sales rep)              │    │
│ │    - Your role and responsibilities              │    │
│ │    - Company context                             │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
│ ┌──────────────────────────────────────────────────┐    │
│ │ 3. KNOWLEDGE BASE CONTEXT (if relevant)          │    │
│ │    [1] Source: refund-policy.pdf                 │    │
│ │        "We offer a 30-day guarantee..."          │    │
│ │    [2] Source: shipping.pdf                      │    │
│ │        "Processing takes 5-7 days..."            │    │
│ └──────────────────────────────────────────────────┘    │
│                                                           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ CONVERSATION HISTORY                                      │
├──────────────────────────────────────────────────────────┤
│ User: "Hi, I need help"                                  │
│ Assistant: "I'd be happy to help! What do you need?"    │
│ User: "Tell me about your products"                      │
│ Assistant: "We sell enterprise software. Interested?"   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ CURRENT USER MESSAGE                                      │
├──────────────────────────────────────────────────────────┤
│ User: "What's your refund policy?"                       │
└──────────────────────────────────────────────────────────┘
```

## Multi-Agent Setup

### Scenario: Company with 3 Agents

```
┌────────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                        │
├────────────────────────────────────────────────────────────────┤
│ • Global System Prompt (phone rules)                           │
│ • MongoDB Atlas (vector search)                                │
│ • RAG Pipeline (embeddings, retrieval)                         │
│ • Voice Handler (call management)                              │
└────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  AGENT 1     │      │  AGENT 2     │      │  AGENT 3     │
│  Sales       │      │  Support     │      │  Scheduling  │
├──────────────┤      ├──────────────┤      ├──────────────┤
│ Persona:     │      │ Persona:     │      │ Persona:     │
│ "Sarah,      │      │ "Mike,       │      │ "Emma,       │
│  sales rep"  │      │  tech        │      │  scheduler"  │
│              │      │  support"    │      │              │
│ KB:          │      │ KB:          │      │ KB:          │
│ • products   │      │ • troublesh  │      │ • calendar   │
│ • pricing    │      │ • FAQs       │      │ • policies   │
│ • demos      │      │ • guides     │      │ • hours      │
│              │      │              │      │              │
│ Phone:       │      │ Phone:       │      │ Phone:       │
│ +1-555-0101  │      │ +1-555-0102  │      │ +1-555-0103  │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Performance Metrics

```
┌─────────────────────────────────────────────────────────┐
│ LATENCY BREAKDOWN (Per Request)                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 1. STT (Deepgram)                    ~200ms             │
│ 2. RAG Query (if needed)             ~200ms             │
│    ├─ Generate embedding             ~100ms             │
│    └─ Vector search                  ~100ms             │
│ 3. LLM First Token (GPT-4o-mini)     ~300ms             │
│ 4. LLM Streaming (per token)         ~20ms              │
│ 5. TTS First Chunk (Deepgram)        ~150ms             │
│ 6. TTS Streaming (continuous)        ~50ms/chunk        │
│                                                          │
│ TOTAL TIME TO FIRST AUDIO:           ~850ms             │
│ (STT + RAG + LLM TTFT + TTS)                           │
│                                                          │
│ BASELINE (no RAG):                   ~650ms             │
│ WITH RAG:                            ~850ms             │
│                                                          │
│ NOTE: Sentence-by-sentence streaming means user        │
│       hears response while LLM still generating!        │
└─────────────────────────────────────────────────────────┘
```

## Example: Complete Call Flow

### Call to Sales Agent

```
TIME    EVENT                               DETAIL
─────────────────────────────────────────────────────────────
0:00    Call starts                         Agent: Sarah (Sales)
0:01    Greeting sent                       "Hi! I'm Sarah..."
0:05    User speaks                         "Tell me about pricing"
0:06    STT complete                        Transcript ready
0:06    RAG query                           "pricing" → relevant
0:06    Vector search                       3 chunks found
0:06    Prompt built                        Global + Persona + KB
0:07    LLM streaming                       "Our standard plan..."
0:07    TTS streaming                       Audio sent to phone
0:10    User speaks                         "What about refunds?"
0:11    STT complete                        Transcript ready
0:11    RAG query                           "refunds" → relevant
0:11    Vector search                       3 chunks found
0:11    Prompt built                        Global + Persona + KB
0:12    LLM streaming                       "We offer 30-day..."
0:12    TTS streaming                       Audio sent to phone
0:15    User speaks                         "Thanks, goodbye!"
0:16    STT complete                        Transcript ready
0:16    RAG query                           "goodbye" → NOT relevant
0:16    Prompt built                        Global + Persona only
0:16    LLM streaming                       "You're welcome..."
0:17    TTS streaming                       Audio sent to phone
0:18    Call ends                           Transcript saved
```

## Configuration Examples

### Example 1: Simple Sales Agent

```javascript
// Agent config
{
  "name": "Sales Bot",
  "config": {
    "persona": "You are a sales representative. Help customers learn about our products.",
    "llm": { "model": "gpt-4o-mini" }
  }
}

// Prompt sent to LLM:
// [Global Rules] + [Persona] + [History] + [Current Message]
// No RAG context (no KB uploaded yet)
```

### Example 2: Knowledge-Enhanced Support Agent

```javascript
// Agent config
{
  "name": "Support Bot",
  "config": {
    "persona": "You are a technical support specialist. Help users troubleshoot issues.",
    "llm": { "model": "gpt-4o-mini" }
  }
}

// Knowledge base:
// - troubleshooting-guide.pdf (50 pages)
// - faq.pdf (20 pages)
// - api-docs.pdf (100 pages)

// Prompt sent to LLM when user asks "How do I reset my password?":
// [Global Rules] + [Persona] + [3 KB chunks about password reset] + [History] + [Current Message]
```

### Example 3: Multi-Persona Agent (Advanced)

```javascript
// Agent config
{
  "name": "Adaptive Agent",
  "config": {
    "persona": `You are an adaptive assistant.

    When handling sales queries: Act as a friendly sales rep
    When handling support: Act as a patient tech specialist
    When scheduling: Act as an efficient coordinator

    Always maintain professionalism and phone etiquette.`,
    "llm": { "model": "claude-3-5-haiku-20241022" }
  }
}

// Knowledge base includes:
// - products.pdf
// - troubleshooting.pdf
// - calendar-policies.pdf

// Agent adapts based on query type and KB context
```

## Summary

### Key Principles

1. **Separation of Concerns**
   - Global rules → phone behavior
   - Persona → agent identity
   - Knowledge base → factual info

2. **Dynamic Context**
   - RAG only when relevant
   - History maintained per call
   - Prompt built per request

3. **Scalability**
   - Unlimited agents
   - Each with own KB and persona
   - Shared infrastructure

4. **Performance**
   - Streaming at every level
   - Sentence-by-sentence TTS
   - Sub-1-second response times

### Quick Checklist

Creating a new agent? ✓
- [ ] Define persona (2-3 paragraphs)
- [ ] Set LLM model (gpt-4o-mini recommended)
- [ ] Upload knowledge base documents
- [ ] Wait for processing (2-5 seconds per doc)
- [ ] Test with phone call
- [ ] Verify RAG context appears in logs
- [ ] Monitor response quality

Done! 🎉
