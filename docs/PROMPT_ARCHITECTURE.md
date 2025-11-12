# Prompt Architecture - Multi-Agent System

## Overview

The system uses a **modular prompt architecture** where each agent has its own knowledge base and persona, while sharing a common system prompt for phone call behavior.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM REQUEST STRUCTURE                     │
└─────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ 1. GLOBAL SYSTEM PROMPT (Same for all agents)             │
│    - Phone call rules (brevity, no lists, conversational) │
│    - Maximum 2-3 sentences per response                   │
│    - Natural conversation flow                            │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│ 2. AGENT PERSONA (Agent-specific)                         │
│    - Character description                                 │
│    - Role definition                                       │
│    - Business context                                      │
│    - Tone and style                                        │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│ 3. RAG CONTEXT (Dynamic, query-dependent)                 │
│    - Knowledge base chunks (3 most relevant)              │
│    - Citations [1], [2], [3]                              │
│    - Only included if query is relevant                   │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│ 4. CONVERSATION HISTORY                                    │
│    - Previous messages in this call                        │
│    - User and assistant alternating                        │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│ 5. CURRENT USER MESSAGE                                    │
│    - Latest transcribed user speech                        │
└────────────────────────────────────────────────────────────┘
                            ↓
                    LLM GENERATES RESPONSE
```

## 1. Global System Prompt

**Location**: [backend/src/config/systemPrompt.ts](backend/src/config/systemPrompt.ts)

**Purpose**: Define phone call behavior that applies to ALL agents

**Content**:
```typescript
export const GLOBAL_SYSTEM_PROMPT = `You are on a PHONE CALL. CRITICAL RULES:

1. Maximum 2-3 SHORT sentences per response
2. NEVER use numbered lists or bullet points
3. Be conversational like a real person on the phone
4. Give ONE piece of info at a time, then ask a follow-up question
5. If asked what you can do, pick ONE capability and mention it briefly

Good example: "I can help you with that! What specifically would you like to know?"
BAD example: "I can help with: 1. Task A, 2. Task B, 3. Task C..."

Remember: Keep responses brief, natural, and conversational - you're on a phone call!`;
```

**Why Global?**
- Ensures consistent phone behavior across all agents
- Prevents verbose responses that frustrate callers
- Easy to update behavior for all agents at once

## 2. Agent Persona

**Location**: `Agent.config.persona` or `Agent.config.prompt` (backward compatible)

**Purpose**: Define agent-specific character, role, and context

**Example Personas**:

### Sales Agent
```
You are Sarah, a friendly sales representative for TechCorp.

Your role:
- Help customers understand our products
- Answer questions about pricing and features
- Schedule product demos
- Maintain a professional yet warm tone

Company info:
- TechCorp sells enterprise software solutions
- Flagship product: CloudManager Pro
- Pricing: $299/month for standard, $599/month for enterprise
```

### Support Agent
```
You are Mike, a technical support specialist for AppSupport Inc.

Your role:
- Troubleshoot customer technical issues
- Guide users through step-by-step solutions
- Escalate complex issues when needed
- Be patient and empathetic

Support guidelines:
- Always ask for account details first
- Verify issue before providing solutions
- Offer to create tickets for unresolved issues
```

### Appointment Scheduler
```
You are Emma, an appointment coordinator for HealthCare Clinic.

Your role:
- Schedule patient appointments
- Confirm availability with the calendar system
- Collect patient information
- Handle rescheduling requests

Clinic info:
- Available hours: Mon-Fri 8AM-6PM, Sat 9AM-2PM
- Closed on Sundays and holidays
- New patient appointments take 60 minutes
- Follow-up appointments take 30 minutes
```

## 3. RAG Context

**Dynamic**: Only included when query is relevant

**Purpose**: Provide factual information from knowledge base

**Format**:
```markdown
# Knowledge Base Information

[1] Source: refund-policy.pdf (Page 2)
We offer a 30-day money-back guarantee on all products. To initiate a refund,
contact support@company.com with your order number.

[2] Source: shipping-info.pdf
Standard shipping takes 5-7 business days. Express shipping (2-3 days) is
available for an additional $15.

---

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
- If the answer is not in the knowledge base, say so clearly
- Do not make up information not provided above
```

**Filtering**:
- Only triggered for knowledge-seeking queries
- Skipped for: greetings, confirmations, small talk
- Top 3 most relevant chunks (phone-optimized)
- Max 2000 characters (~500 tokens)

## 4. Conversation History

**Source**: Current call's transcript from database

**Format**:
```typescript
[
  { role: 'user', content: 'Hi, I need help with my order' },
  { role: 'assistant', content: 'I\'d be happy to help! What\'s your order number?' },
  { role: 'user', content: 'It\'s ORDER-12345' },
  { role: 'assistant', content: 'Thanks! Let me look that up for you.' }
]
```

**Purpose**:
- Maintain conversation context
- Enable follow-up questions
- Track what information has been shared

## 5. Current User Message

**Source**: Latest transcribed speech from user

**Example**: `"What's your refund policy?"`

## Implementation

### Agent Model Update

**File**: [backend/src/models/Agent.ts](backend/src/models/Agent.ts)

```typescript
config: {
  prompt: string;      // Backward compatibility
  persona?: string;    // New: Agent-specific persona
  // ... other config
}
```

**Migration**:
- Old agents: Use `config.prompt` as persona
- New agents: Use `config.persona` (preferred)
- System falls back to `prompt` if `persona` not set

### Voice Handler Integration

**File**: [backend/src/websocket/handlers/exotelVoice.handler.ts](backend/src/websocket/handlers/exotelVoice.handler.ts)

**Key Changes** (lines 483-550):

```typescript
// 1. Get agent persona
const agentPersona = session.agent.config.persona || session.agent.config.prompt;

// 2. Query knowledge base if relevant
let ragContextFormatted: string | undefined;
if (ragService.isQueryRelevantForKB(transcript)) {
  const ragContext = await ragService.queryKnowledgeBase(transcript, agentId, {...});
  ragContextFormatted = ragService.formatContextForLLM(ragContext);
}

// 3. Build complete system prompt
const systemPrompt = buildLLMPrompt({
  agentPersona,
  ragContext: ragContextFormatted
});

// 4. Create messages array
const messages: ChatMessage[] = [
  { role: 'system', content: systemPrompt },
  ...conversationHistory,
  { role: 'user', content: transcript }
];

// 5. Send to LLM
const streamGenerator = isClaude
  ? anthropicService.getChatCompletionStream(messages, { systemPrompt })
  : openaiService.getChatCompletionStream(messages, {...});
```

### System Prompt Builder

**File**: [backend/src/config/systemPrompt.ts](backend/src/config/systemPrompt.ts)

```typescript
export function buildLLMPrompt(params: {
  agentPersona?: string;
  ragContext?: string;
}): string {
  const parts: string[] = [GLOBAL_SYSTEM_PROMPT];

  if (params.agentPersona) {
    parts.push('\n---\n');
    parts.push('# YOUR PERSONA AND ROLE');
    parts.push(params.agentPersona);
  }

  if (params.ragContext) {
    parts.push('\n---\n');
    parts.push(params.ragContext);
  }

  return parts.join('\n');
}
```

## Example: Complete Prompt

For a query: **"What's your refund policy?"**

With Agent: **Sales Agent (Sarah)**

**Final Prompt Sent to LLM**:

```
You are on a PHONE CALL. CRITICAL RULES:

1. Maximum 2-3 SHORT sentences per response
2. NEVER use numbered lists or bullet points
3. Be conversational like a real person on the phone
4. Give ONE piece of info at a time, then ask a follow-up question
5. If asked what you can do, pick ONE capability and mention it briefly

Good example: "I can help you with that! What specifically would you like to know?"
BAD example: "I can help with: 1. Task A, 2. Task B, 3. Task C..."

Remember: Keep responses brief, natural, and conversational - you're on a phone call!

---

# YOUR PERSONA AND ROLE
You are Sarah, a friendly sales representative for TechCorp.

Your role:
- Help customers understand our products
- Answer questions about pricing and features
- Schedule product demos
- Maintain a professional yet warm tone

Company info:
- TechCorp sells enterprise software solutions
- Flagship product: CloudManager Pro
- Pricing: $299/month for standard, $599/month for enterprise

---

# Knowledge Base Information

[1] Source: refund-policy.pdf (Page 2)
We offer a 30-day money-back guarantee on all products. To initiate a refund,
contact support@company.com with your order number. No questions asked.

[2] Source: terms-of-service.pdf (Page 5)
Refunds are processed within 5-7 business days. The amount will be credited
back to your original payment method.

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
- If the answer is not in the knowledge base, say so clearly
- Do not make up information not provided above

---

[Previous conversation history would appear here]

User: What's your refund policy?
```

**Expected Response**:
```
We offer a 30-day money-back guarantee on all TechCorp products [1]. If you're
not satisfied, just email support@company.com with your order number and we'll
process your refund within a week [2]. Have you already made a purchase, or are
you considering one?
```

## Benefits of This Architecture

### 1. **Consistency**
- All agents follow same phone etiquette
- No agent can be verbose or use lists

### 2. **Flexibility**
- Easy to create new agents with different personas
- Each agent can have its own knowledge base
- Global rules updated once, apply everywhere

### 3. **Context-Aware**
- Relevant knowledge automatically injected
- Citations provided for transparency
- Conversation history maintained

### 4. **Scalability**
- Create unlimited agents
- Each agent isolated (separate KB, persona)
- Shared infrastructure (system prompt, RAG pipeline)

### 5. **Maintainability**
- Global prompt in one file
- Agent personas in database
- Easy to debug and improve

## Configuration Guide

### Creating a New Agent

1. **Define Persona**:
```json
{
  "name": "CustomerSupportBot",
  "config": {
    "persona": "You are Alex, a customer support specialist...",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    },
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-asteria-en"
    }
  }
}
```

2. **Upload Knowledge Base**:
```bash
curl -X POST /api/v1/knowledge-base/upload \
  -F "file=@support-docs.pdf" \
  -F "agentId=AGENT_ID"
```

3. **Test**:
- Make call to agent
- Ask knowledge-based questions
- Verify responses use KB + persona

### Updating Global Prompt

Edit [backend/src/config/systemPrompt.ts](backend/src/config/systemPrompt.ts):

```typescript
export const GLOBAL_SYSTEM_PROMPT = `...new rules...`;
```

Rebuild and restart server:
```bash
npm run build
pm2 restart backend
```

### Updating Agent Persona

Via API:
```bash
curl -X PUT /api/v1/agents/AGENT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "persona": "Updated persona description..."
    }
  }'
```

Changes take effect immediately (no rebuild needed).

## Testing

### Test Prompt Construction

```typescript
import { buildLLMPrompt } from './config/systemPrompt';

const prompt = buildLLMPrompt({
  agentPersona: 'You are a sales agent...',
  ragContext: '[1] Source: product-info.pdf\nOur product costs $99.'
});

console.log(prompt);
```

### Test with Logging

Enable debug logs:
```bash
# In voice handler logs
🤖 Building LLM prompt { hasPersona: true, personaLength: 245 }
🔍 RAG: Query is relevant, searching knowledge base
✅ RAG: Found relevant context { chunks: 3, maxScore: '0.891' }
System prompt built { totalLength: 1542, hasRAG: true }
```

## Best Practices

### Global Prompt
- ✅ Keep concise and clear
- ✅ Focus on phone-specific rules
- ✅ Test with multiple agents
- ❌ Don't include agent-specific info
- ❌ Don't include knowledge base content

### Agent Persona
- ✅ Be specific about role and context
- ✅ Include relevant business info
- ✅ Define tone and style
- ❌ Don't repeat global rules
- ❌ Don't include knowledge base content
- ❌ Don't make persona too long (< 500 words)

### Knowledge Base
- ✅ Organize by topic (one doc per topic)
- ✅ Keep documents current
- ✅ Use clear, factual language
- ❌ Don't duplicate persona info
- ❌ Don't include conversation examples

## Troubleshooting

### Agent ignores persona
- Check `config.persona` is set
- Verify it's not empty
- Check logs for "Building LLM prompt"

### No RAG context
- Verify documents uploaded and processed
- Check `status: 'ready'`
- Test query is relevant (not greeting)
- Check MongoDB Atlas vector index

### Verbose responses
- Review global system prompt
- Test with different models
- Consider lowering temperature
- Check persona doesn't encourage verbosity

## Migration from Old System

**Old Structure**:
```typescript
config.prompt = "You are on a phone call. You are Sarah, a sales agent...";
```

**New Structure**:
```typescript
config.persona = "You are Sarah, a sales agent...";
// Global prompt automatically prepended
```

**Backward Compatibility**:
- Existing agents continue working
- System falls back to `config.prompt`
- Gradually migrate to `config.persona`

## Related Documentation

- [Knowledge Base System](./KNOWLEDGE_BASE_SYSTEM.md)
- [RAG Implementation](./KNOWLEDGE_BASE_IMPLEMENTATION_SUMMARY.md)
- [Voice Handler Implementation](./LATENCY_OPTIMIZATIONS_V4.md)
