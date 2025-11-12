# Validation Schema Fix

## Issue

When trying to create an agent with the new form, the API was rejecting requests with validation errors:

```json
{
  "error": "Invalid enum value. Expected 'openai' | 'elevenlabs' | 'cartesia', received 'deepgram'"
}
```

```json
{
  "error": "Invalid enum value. Expected 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo', received 'gpt-4o-mini'"
}
```

## Root Cause

The Zod validation schemas in `backend/src/utils/validation.ts` were outdated and didn't include:
- **deepgram** voice provider
- **gpt-4o** and **gpt-4o-mini** models
- **claude-3-5-haiku-20241022** and **claude-3-5-sonnet-20241022** models
- New fields: **description**, **persona**, **greetingMessage**, **endCallPhrases**

## Fix Applied

Updated the Zod validation schemas to match the new agent structure:

### createAgentSchema

**Added to body validation**:
```typescript
description: z
  .string()
  .max(500, 'Description must not exceed 500 characters')
  .optional(),
```

**Added to config validation**:
```typescript
persona: z
  .string()
  .min(10, 'Persona must be at least 10 characters')
  .max(5000, 'Persona must not exceed 5000 characters')
  .optional(),

greetingMessage: z
  .string()
  .min(5, 'Greeting message must be at least 5 characters')
  .max(500, 'Greeting message must not exceed 500 characters')
  .optional(),

endCallPhrases: z.array(z.string()).optional(),
```

**Updated voice.provider enum**:
```typescript
provider: z.enum(['openai', 'elevenlabs', 'cartesia', 'deepgram']),
```

**Updated llm.model enum**:
```typescript
model: z.enum([
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-4-turbo',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022'
]),
```

### updateAgentSchema

Applied the same changes to the update schema to support editing existing agents with new fields.

## Files Modified

- ✅ [backend/src/utils/validation.ts](backend/src/utils/validation.ts:54-166)

## Testing

### Before Fix
```bash
POST /api/v1/agents
{
  "name": "Test Agent",
  "config": {
    "voice": { "provider": "deepgram", ... },
    "llm": { "model": "gpt-4o-mini", ... }
  }
}

Response: 400 Bad Request
{
  "error": "Invalid enum value..."
}
```

### After Fix
```bash
POST /api/v1/agents
{
  "name": "Test Agent",
  "description": "Testing Agent",
  "config": {
    "persona": "You are...",
    "greetingMessage": "Hello!",
    "voice": { "provider": "deepgram", "voiceId": "aura-asteria-en" },
    "llm": { "model": "gpt-4o-mini", "temperature": 0.7 },
    "endCallPhrases": ["goodbye", "bye"]
  }
}

Response: 201 Created
{
  "success": true,
  "data": { ... }
}
```

## Build Status

✅ Backend builds successfully: `npm run build`
✅ Backend server restarted with new validation
✅ All tests passing

## Supported Values

### Voice Providers
- openai
- elevenlabs
- cartesia
- **deepgram** ← NEW

### LLM Models
- gpt-4
- gpt-3.5-turbo
- gpt-4-turbo
- **gpt-4o** ← NEW
- **gpt-4o-mini** ← NEW
- **claude-3-5-haiku-20241022** ← NEW
- **claude-3-5-sonnet-20241022** ← NEW

### New Fields
- **description** (optional, max 500 chars)
- **persona** (optional, 10-5000 chars)
- **greetingMessage** (optional, 5-500 chars)
- **endCallPhrases** (optional, array of strings)

## Resolution

The validation error has been fixed. Users can now create agents with:
- Deepgram voice provider
- GPT-4o and GPT-4o-mini models
- Claude 3.5 models (Haiku and Sonnet)
- All new fields (description, persona, greeting, end call phrases)

## Next Steps

If you encounter similar validation errors in the future:
1. Check the error message to see which field/value is being rejected
2. Open `backend/src/utils/validation.ts`
3. Find the relevant schema (createAgentSchema, updateAgentSchema, etc.)
4. Add the missing value to the enum or add the new field validation
5. Rebuild: `cd backend && npm run build`
6. Restart server: Kill the old process and start new one

## Related Files

- Validation schemas: [backend/src/utils/validation.ts](backend/src/utils/validation.ts)
- Agent model: [backend/src/models/Agent.ts](backend/src/models/Agent.ts)
- Frontend form: [frontend/src/components/agents/AgentForm.tsx](frontend/src/components/agents/AgentForm.tsx)
- TypeScript types: [frontend/src/types/index.ts](frontend/src/types/index.ts)
