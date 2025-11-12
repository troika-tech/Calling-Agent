# Agent Creation System - Quick Reference

## Quick Start

### Create New Agent
1. Navigate to `/agents/new`
2. Fill out 5 sections:
   - **Basic Info**: Name + Description
   - **Persona**: Character + Greeting
   - **AI Model**: Model + Settings
   - **Voice**: Provider + Voice
   - **Call**: Language + End Phrases
3. Click "Create Agent"

### Edit Existing Agent
1. Navigate to `/agents`
2. Click edit icon on agent card
3. Modify fields
4. Click "Update Agent"

---

## Field Reference

### Section 1: Basic Information

| Field | Required | Type | Max | Example |
|-------|----------|------|-----|---------|
| Name | ✅ Yes | text | 100 | "Sales Agent Sarah" |
| Description | ❌ No | text | 500 | "Friendly sales rep for TechCorp" |

---

### Section 2: Persona & Greeting

| Field | Required | Type | Min | Max | Example |
|-------|----------|------|-----|-----|---------|
| Persona | ✅ Yes | textarea | 10 | 5000 | "You are Sarah, a sales rep..." |
| Greeting | ✅ Yes | text | 5 | 500 | "Hi! I'm Sarah. How can I help?" |

**Persona Tips**:
- Start with "You are [name], a [role]"
- Define responsibilities with bullet points
- Include company context
- Keep under 500 words for best results

**Greeting Tips**:
- Keep to 1-2 sentences
- Include agent name
- Ask open question
- Be warm and professional

---

### Section 3: AI Model Settings

| Field | Required | Type | Range | Default | Recommended |
|-------|----------|------|-------|---------|-------------|
| Model | ✅ Yes | select | - | gpt-4o-mini | gpt-4o-mini or claude-3-5-haiku |
| Temperature | ✅ Yes | number | 0-2 | 0.7 | 0.5-0.8 |
| Max Tokens | ❌ No | number | - | auto | Leave empty or 300 |

**Model Options**:
- **gpt-4o-mini** ⭐ Fastest, cheapest, recommended
- **claude-3-5-haiku-20241022** Very fast, good quality
- **gpt-4o** Better quality, slower
- **claude-3-5-sonnet-20241022** Best quality, slowest

**Temperature Guide**:
- **0-0.4**: Focused, consistent, factual
- **0.5-0.8**: ⭐ Balanced (recommended)
- **0.9-1.5**: Creative, varied
- **1.6-2.0**: Very creative, unpredictable

---

### Section 4: Voice Settings

| Field | Required | Type | Default | Recommended |
|-------|----------|------|---------|-------------|
| Provider | ✅ Yes | select | deepgram | deepgram |
| Voice | ✅ Yes | select | aura-asteria-en | (varies) |

**Provider Options**:

1. **Deepgram** ⭐ Recommended
   - Fastest (real-time streaming)
   - 10 Aura voices
   - Male and female options
   - Best for phone calls

2. **OpenAI**
   - 6 voices
   - Good quality
   - Moderate speed

3. **ElevenLabs**
   - High quality
   - Custom voice cloning
   - Slower (non-streaming)

4. **Cartesia**
   - Ultra-low latency
   - Multiple voices
   - Good for real-time

**Popular Voices**:
- **Female, Warm**: aura-asteria-en (Deepgram)
- **Female, Calm**: aura-luna-en (Deepgram)
- **Female, Professional**: aura-athena-en (Deepgram)
- **Male, Friendly**: aura-orion-en (Deepgram)
- **Male, Professional**: aura-arcas-en (Deepgram)

---

### Section 5: Call Settings

| Field | Required | Type | Default | Example |
|-------|----------|------|---------|---------|
| Language | ✅ Yes | select | en | en |
| End Call Phrases | ❌ No | text | defaults | "goodbye, bye, end call" |

**Language Options**:
- en - English
- es - Spanish
- fr - French
- de - German
- hi - Hindi
- ja - Japanese
- ko - Korean
- zh - Chinese

**Default End Call Phrases**:
```
goodbye, bye, end call, thank you goodbye, talk to you later
```

**Custom Examples**:
- Sales: "not interested, no thanks, goodbye"
- Support: "that's all, problem solved, goodbye"
- Scheduler: "all set, thank you, goodbye"

---

## API Reference

### Create Agent
```bash
POST /api/v1/agents
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Agent Name",
  "description": "Optional description",
  "config": {
    "persona": "You are...",
    "greetingMessage": "Hi! I'm...",
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-asteria-en"
    },
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    },
    "language": "en",
    "endCallPhrases": ["goodbye", "bye"]
  }
}
```

### Update Agent
```bash
PUT /api/v1/agents/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Name",
  "description": "Updated description",
  "config": { ... }
}
```

### Get Agent
```bash
GET /api/v1/agents/:id
Authorization: Bearer <token>
```

### List Agents
```bash
GET /api/v1/agents
Authorization: Bearer <token>
```

---

## Validation Rules

### Backend Validation

```typescript
name: {
  required: true,
  minLength: 1,
  maxLength: 100
}

description: {
  required: false,
  maxLength: 500
}

persona: {
  required: false,  // But prompt is required
  minLength: 10,
  maxLength: 5000
}

greetingMessage: {
  required: true,
  minLength: 5,
  maxLength: 500
}

endCallPhrases: {
  required: false,
  default: ['goodbye', 'bye', 'end call', ...]
}
```

### Frontend Validation

```typescript
name: {
  required: "Agent name is required"
}

persona: {
  required: "Persona is required",
  minLength: { value: 10, message: "Persona must be at least 10 characters" },
  maxLength: { value: 5000, message: "Persona must be less than 5000 characters" }
}

greetingMessage: {
  required: "Greeting message is required",
  minLength: { value: 5, message: "Greeting must be at least 5 characters" },
  maxLength: { value: 500, message: "Greeting must be less than 500 characters" }
}

description: {
  maxLength: 500
}
```

---

## End Call Phrase Matching

### How It Works

The system uses **3 matching strategies**:

1. **Exact Match**
   - User: "goodbye"
   - Matches: ✅ "goodbye"

2. **Ends-With Match**
   - User: "okay goodbye"
   - Matches: ✅ "goodbye"

3. **Standalone Regex Match**
   - User: "I want to end call now"
   - Matches: ✅ "end call"

### Examples

```typescript
// Will trigger end call
"goodbye"
"Goodbye!"
"okay, goodbye"
"bye"
"bye bye"
"I want to end call"
"end call please"
"thank you goodbye"

// Will NOT trigger end call
"good morning"  // Contains "good" but not "goodbye"
"I'm buying something"  // Contains "buy" but not "bye"
"let's call it a day"  // Contains "call" but not "end call"
```

### Custom Phrases

You can configure agent-specific phrases:

**Sales Agent**:
```
not interested, no thanks, goodbye, bye
```

**Support Agent**:
```
that's all, problem solved, thank you, goodbye, bye
```

**Scheduler**:
```
all set, appointment confirmed, thank you, goodbye, bye
```

---

## Common Patterns

### Customer Service Agent
```json
{
  "name": "Customer Service Bot",
  "description": "Handles general customer inquiries",
  "config": {
    "persona": "You are a friendly customer service representative.\n\nYour role:\n- Answer customer questions\n- Provide product information\n- Handle complaints professionally\n- Escalate complex issues\n\nCompany: [Your Company]\nProducts: [Your Products]",
    "greetingMessage": "Hello! Thanks for calling [Company]. How can I help you today?",
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-asteria-en"
    },
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    },
    "language": "en",
    "endCallPhrases": ["goodbye", "bye", "that's all", "thank you"]
  }
}
```

### Sales Agent
```json
{
  "name": "Sales Agent",
  "description": "Handles sales inquiries and demos",
  "config": {
    "persona": "You are an enthusiastic sales representative.\n\nYour role:\n- Qualify leads\n- Explain product benefits\n- Schedule demos\n- Close sales\n\nProducts:\n- [Product 1]: [Price]\n- [Product 2]: [Price]",
    "greetingMessage": "Hi! I'm [Name] from [Company]. What brings you to us today?",
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-stella-en"  // Energetic
    },
    "llm": {
      "model": "gpt-4o",  // Better quality for sales
      "temperature": 0.8  // More creative
    },
    "language": "en",
    "endCallPhrases": ["not interested", "no thanks", "goodbye", "bye"]
  }
}
```

### Technical Support
```json
{
  "name": "Tech Support Bot",
  "description": "Provides technical assistance",
  "config": {
    "persona": "You are a patient technical support specialist.\n\nYour role:\n- Troubleshoot technical issues\n- Guide users step-by-step\n- Ask clarifying questions\n- Create tickets for complex issues\n\nProducts: [Software/Hardware]",
    "greetingMessage": "Hello! I'm here to help with technical issues. What seems to be the problem?",
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-orion-en"  // Male, calm
    },
    "llm": {
      "model": "claude-3-5-haiku-20241022",  // Good reasoning
      "temperature": 0.5  // Focused, accurate
    },
    "language": "en",
    "endCallPhrases": ["problem solved", "that's all", "thank you", "goodbye"]
  }
}
```

### Appointment Scheduler
```json
{
  "name": "Appointment Scheduler",
  "description": "Schedules and manages appointments",
  "config": {
    "persona": "You are an efficient appointment coordinator.\n\nYour role:\n- Schedule appointments\n- Check availability\n- Collect patient/customer info\n- Handle rescheduling\n\nHours: Mon-Fri 8AM-6PM, Sat 9AM-2PM",
    "greetingMessage": "Hello! I can help you schedule an appointment. What date works for you?",
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-athena-en"  // Professional
    },
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.6
    },
    "language": "en",
    "endCallPhrases": ["all set", "appointment confirmed", "thank you", "goodbye"]
  }
}
```

---

## Troubleshooting

### Issue: Agent not ending calls automatically

**Check**:
1. Are end call phrases configured?
2. Is user saying exact phrase?
3. Check logs for "END CALL PHRASE DETECTED"

**Solution**:
```typescript
// Add more variations
endCallPhrases: [
  "goodbye", "bye", "end call",
  "that's all", "thank you",
  "talk to you later"
]
```

### Issue: Character counter not working

**Check**:
1. Is `watch('persona')` set up?
2. Is state updating?

**Solution**: Already implemented in AgentForm.tsx

### Issue: Voice dropdown empty

**Check**:
1. Is voice provider selected?
2. Is `watch('voiceProvider')` working?

**Solution**: Select a provider first, then voice options appear

### Issue: Form not submitting

**Check**:
1. Are all required fields filled?
2. Check browser console for errors
3. Check validation messages

**Common causes**:
- Persona too short (< 10 chars)
- Persona too long (> 5000 chars)
- Greeting too short (< 5 chars)
- Name empty

---

## Performance Tips

### For Low Latency
- Use **Deepgram** voice provider
- Use **gpt-4o-mini** or **claude-3-5-haiku**
- Keep persona under 500 words
- Use temperature 0.5-0.7

### For Best Quality
- Use **ElevenLabs** voice provider
- Use **claude-3-5-sonnet** or **gpt-4o**
- Detailed persona (1000-2000 words)
- Use temperature 0.7-0.9

### For Balanced (Recommended)
- Use **Deepgram** voice provider
- Use **gpt-4o-mini**
- Persona 200-500 words
- Temperature 0.7
- This gives ~850ms response time with RAG

---

## File Locations

### Backend
- Model: `backend/src/models/Agent.ts`
- Voice Handler: `backend/src/websocket/handlers/exotelVoice.handler.ts`
- System Prompt: `backend/src/config/systemPrompt.ts`

### Frontend
- Form Component: `frontend/src/components/agents/AgentForm.tsx`
- Type Definitions: `frontend/src/types/index.ts`
- Agent Service: `frontend/src/services/agentService.ts`

### Documentation
- Creation Guide: `AGENT_CREATION_GUIDE.md`
- Update Summary: `AGENT_FORM_UPDATE_SUMMARY.md`
- Before/After: `BEFORE_AFTER_COMPARISON.md`
- This Reference: `QUICK_REFERENCE.md`
- Prompt Flow: `PROMPT_FLOW.md`
- Architecture: `PROMPT_ARCHITECTURE.md`

---

## Support

### Build Commands
```bash
# Backend
cd backend
npm run build  # Compile TypeScript
npm run dev    # Development server

# Frontend
cd frontend
npm run build  # Production build
npm run dev    # Development server
```

### Testing
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5173/agents/new`
4. Create test agent
5. Verify in database
6. Make test call

### Common Commands
```bash
# Check TypeScript errors
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# View logs
cd backend && tail -f logs/combined.log
pm2 logs backend
```

---

## Quick Checklist

Creating a new agent? ✓

- [ ] Choose meaningful name
- [ ] Write optional description
- [ ] Define clear persona (who, role, context)
- [ ] Create warm greeting (1-2 sentences)
- [ ] Select model (gpt-4o-mini recommended)
- [ ] Choose voice provider (Deepgram recommended)
- [ ] Pick voice that matches persona
- [ ] Set language
- [ ] Configure end call phrases
- [ ] Click "Create Agent"
- [ ] Test with phone call
- [ ] Verify greeting plays
- [ ] Test end call phrases work
- [ ] Upload knowledge base (if needed)

Done! 🎉
