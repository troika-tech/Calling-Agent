# Agent Creation Guide

Complete guide for creating AI voice agents with all required fields.

## Required Fields

When creating a new agent, you need to collect the following information from the user:

### 1. Agent Name
- **Field**: `name`
- **Type**: String
- **Required**: ✅ Yes
- **Length**: 1-100 characters
- **Description**: Display name for the agent
- **Example**: `"Sales Agent Sarah"`, `"Support Bot Mike"`

### 2. Description (Optional)
- **Field**: `description`
- **Type**: String
- **Required**: ❌ No
- **Length**: Max 500 characters
- **Description**: Brief description of agent's purpose
- **Example**: `"Handles inbound sales calls for enterprise software"`

### 3. Persona
- **Field**: `config.persona` (or `config.prompt` for backward compatibility)
- **Type**: String
- **Required**: ✅ Yes
- **Length**: 10-5000 characters
- **Description**: Agent's character, role, and personality
- **Example**:
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

### 4. Greeting Message
- **Field**: `config.greetingMessage`
- **Type**: String
- **Required**: ✅ Yes
- **Length**: 5-500 characters
- **Description**: First message when call starts
- **Example**: `"Hi! I'm Sarah from TechCorp. How can I help you today?"`

### 5. Model
- **Field**: `config.llm.model`
- **Type**: String (enum)
- **Required**: ✅ Yes
- **Options**:
  - `gpt-4o-mini` (Recommended - fastest & cheapest)
  - `gpt-4o` (Better quality, slower)
  - `gpt-4-turbo`
  - `gpt-4`
  - `gpt-3.5-turbo`
  - `claude-3-5-haiku-20241022` (Very fast, good quality)
  - `claude-3-5-sonnet-20241022` (Best quality, expensive)
- **Default**: `gpt-4o-mini`

### 6. Voice
- **Field**: `config.voice`
- **Type**: Object
- **Required**: ✅ Yes
- **Subfields**:
  - `provider`: `"openai"` | `"elevenlabs"` | `"cartesia"` | `"deepgram"`
  - `voiceId`: Voice identifier (provider-specific)
- **Examples**:

#### Deepgram (Recommended - Fastest)
```json
{
  "provider": "deepgram",
  "voiceId": "aura-asteria-en"
}
```

Available Deepgram voices:
- `aura-asteria-en` - Female, warm
- `aura-luna-en` - Female, calm
- `aura-stella-en` - Female, energetic
- `aura-athena-en` - Female, professional
- `aura-hera-en` - Female, confident
- `aura-orion-en` - Male, friendly
- `aura-arcas-en` - Male, professional
- `aura-perseus-en` - Male, warm
- `aura-angus-en` - Male, authoritative
- `aura-orpheus-en` - Male, soothing

#### OpenAI
```json
{
  "provider": "openai",
  "voiceId": "nova"
}
```

Available OpenAI voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

### 7. Language
- **Field**: `config.language`
- **Type**: String
- **Required**: ✅ Yes
- **Default**: `"en"`
- **Description**: Language code
- **Examples**: `"en"` (English), `"es"` (Spanish), `"fr"` (French), `"de"` (German)

### 8. End Call Phrases
- **Field**: `config.endCallPhrases`
- **Type**: Array of strings
- **Required**: ❌ No (has defaults)
- **Description**: Phrases that trigger automatic call ending
- **Default**: `["goodbye", "bye", "end call", "thank you goodbye", "talk to you later"]`
- **Example**: `["goodbye", "bye", "see you later", "hang up"]`

**How it works**:
- When user says any of these phrases, the agent will:
  1. Detect the phrase in the transcript
  2. Say a polite goodbye: "Thank you for calling! Have a great day. Goodbye!"
  3. Automatically end the call

## API Endpoint

**POST** `/api/v1/agents`

### Request Body

```json
{
  "name": "Sales Agent Sarah",
  "description": "Handles inbound sales inquiries for TechCorp",
  "config": {
    "persona": "You are Sarah, a friendly sales representative for TechCorp.\n\nYour role:\n- Help customers understand our products\n- Answer questions about pricing and features\n- Schedule product demos\n- Maintain a professional yet warm tone\n\nCompany info:\n- TechCorp sells enterprise software solutions\n- Flagship product: CloudManager Pro\n- Pricing: $299/month for standard, $599/month for enterprise",
    "greetingMessage": "Hi! I'm Sarah from TechCorp. How can I help you today?",
    "endCallPhrases": ["goodbye", "bye", "end call", "thanks bye"],
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-asteria-en"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    }
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "agent": {
      "_id": "67abc123...",
      "name": "Sales Agent Sarah",
      "description": "Handles inbound sales inquiries for TechCorp",
      "config": {
        "persona": "You are Sarah...",
        "greetingMessage": "Hi! I'm Sarah from TechCorp...",
        "endCallPhrases": ["goodbye", "bye", "end call", "thanks bye"],
        "voice": {
          "provider": "deepgram",
          "voiceId": "aura-asteria-en"
        },
        "language": "en",
        "llm": {
          "model": "gpt-4o-mini",
          "temperature": 0.7
        }
      },
      "isActive": true,
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-15T10:30:00Z"
    }
  }
}
```

## Frontend Form Example

### Minimal Form Fields

```html
<form>
  <!-- 1. Agent Name -->
  <div>
    <label>Agent Name *</label>
    <input
      type="text"
      name="name"
      required
      minlength="1"
      maxlength="100"
      placeholder="e.g., Sales Agent Sarah"
    />
  </div>

  <!-- 2. Description (Optional) -->
  <div>
    <label>Description</label>
    <textarea
      name="description"
      maxlength="500"
      placeholder="Brief description of agent's purpose"
      rows="2"
    ></textarea>
  </div>

  <!-- 3. Persona -->
  <div>
    <label>Persona *</label>
    <textarea
      name="persona"
      required
      minlength="10"
      maxlength="5000"
      placeholder="Describe the agent's role, personality, and context"
      rows="10"
    ></textarea>
    <small>
      Define who the agent is, their role, tone, and business context.
    </small>
  </div>

  <!-- 4. Greeting Message -->
  <div>
    <label>Greeting Message *</label>
    <input
      type="text"
      name="greetingMessage"
      required
      minlength="5"
      maxlength="500"
      placeholder="e.g., Hi! I'm Sarah. How can I help you today?"
    />
    <small>
      First message when the call starts.
    </small>
  </div>

  <!-- 5. Model -->
  <div>
    <label>LLM Model *</label>
    <select name="model" required>
      <option value="gpt-4o-mini" selected>GPT-4o Mini (Fastest, Recommended)</option>
      <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Very Fast)</option>
      <option value="gpt-4o">GPT-4o (Better Quality)</option>
      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Best Quality)</option>
    </select>
  </div>

  <!-- 6. Voice Provider -->
  <div>
    <label>Voice Provider *</label>
    <select name="voiceProvider" required onchange="updateVoiceOptions(this.value)">
      <option value="deepgram" selected>Deepgram (Fastest, Recommended)</option>
      <option value="openai">OpenAI</option>
      <option value="elevenlabs">ElevenLabs</option>
      <option value="cartesia">Cartesia</option>
    </select>
  </div>

  <!-- 7. Voice ID -->
  <div id="voiceIdSection">
    <label>Voice *</label>
    <select name="voiceId" required id="voiceIdSelect">
      <!-- Dynamically populated based on provider -->
      <option value="aura-asteria-en">Aura Asteria (Female, Warm)</option>
      <option value="aura-luna-en">Aura Luna (Female, Calm)</option>
      <option value="aura-orion-en">Aura Orion (Male, Friendly)</option>
    </select>
  </div>

  <!-- 8. Language -->
  <div>
    <label>Language *</label>
    <select name="language" required>
      <option value="en" selected>English</option>
      <option value="es">Spanish</option>
      <option value="fr">French</option>
      <option value="de">German</option>
    </select>
  </div>

  <!-- 9. End Call Phrases -->
  <div>
    <label>End Call Phrases</label>
    <input
      type="text"
      name="endCallPhrases"
      placeholder="goodbye, bye, end call"
      value="goodbye, bye, end call, thank you goodbye, talk to you later"
    />
    <small>
      Comma-separated phrases that will automatically end the call.
    </small>
  </div>

  <button type="submit">Create Agent</button>
</form>
```

### JavaScript Handler

```javascript
async function createAgent(formData) {
  // Parse end call phrases
  const endCallPhrases = formData.endCallPhrases
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const payload = {
    name: formData.name,
    description: formData.description,
    config: {
      persona: formData.persona,
      greetingMessage: formData.greetingMessage,
      endCallPhrases: endCallPhrases,
      voice: {
        provider: formData.voiceProvider,
        voiceId: formData.voiceId
      },
      language: formData.language,
      llm: {
        model: formData.model,
        temperature: 0.7
      }
    }
  };

  const response = await fetch('/api/v1/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (data.success) {
    console.log('Agent created:', data.data.agent);
    // Navigate to agent detail page or show success message
  } else {
    console.error('Failed to create agent:', data.error);
  }
}
```

## Example: Complete Agent Configurations

### Example 1: Sales Agent

```json
{
  "name": "Sales Agent Sarah",
  "description": "Handles inbound sales calls for enterprise software",
  "config": {
    "persona": "You are Sarah, a friendly sales representative for TechCorp.\n\nYour role:\n- Help customers understand our products\n- Answer pricing and feature questions\n- Schedule product demos\n- Be professional yet warm\n\nKey products:\n- CloudManager Pro: $299/month (standard), $599/month (enterprise)\n- DataSync Plus: $199/month\n- Analytics Dashboard: $399/month\n\nAlways ask qualifying questions to understand customer needs.",
    "greetingMessage": "Hi! I'm Sarah from TechCorp. Thanks for calling. How can I help you today?",
    "endCallPhrases": ["goodbye", "bye", "thanks bye", "talk later"],
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-asteria-en"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    }
  }
}
```

### Example 2: Support Agent

```json
{
  "name": "Support Agent Mike",
  "description": "Technical support for software troubleshooting",
  "config": {
    "persona": "You are Mike, a patient technical support specialist.\n\nYour role:\n- Troubleshoot technical issues\n- Guide users step-by-step\n- Escalate complex problems when needed\n- Be empathetic and understanding\n\nCommon issues:\n- Login problems: Reset password at app.techcorp.com/reset\n- Slow performance: Check internet connection, clear cache\n- Sync errors: Check account permissions\n\nAlways verify the issue before suggesting solutions.",
    "greetingMessage": "Hi! I'm Mike from TechCorp support. I'm here to help. What issue are you experiencing?",
    "endCallPhrases": ["problem solved", "goodbye", "bye", "thanks for your help"],
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-orion-en"
    },
    "language": "en",
    "llm": {
      "model": "claude-3-5-haiku-20241022",
      "temperature": 0.6
    }
  }
}
```

### Example 3: Appointment Scheduler

```json
{
  "name": "Scheduler Emma",
  "description": "Schedules appointments for healthcare clinic",
  "config": {
    "persona": "You are Emma, a friendly appointment coordinator for HealthCare Clinic.\n\nYour role:\n- Schedule patient appointments\n- Collect patient information\n- Handle rescheduling requests\n- Confirm appointment details\n\nClinic hours:\n- Mon-Fri: 8 AM - 6 PM\n- Sat: 9 AM - 2 PM\n- Closed Sundays\n\nAppointment types:\n- New patient: 60 minutes\n- Follow-up: 30 minutes\n- Lab work: 15 minutes\n\nAlways collect: Name, phone, reason for visit, preferred date/time.",
    "greetingMessage": "Hi! I'm Emma from HealthCare Clinic. I can help you schedule an appointment. May I have your name?",
    "endCallPhrases": ["appointment confirmed", "goodbye", "bye", "see you then"],
    "voice": {
      "provider": "deepgram",
      "voiceId": "aura-luna-en"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.8
    }
  }
}
```

## Validation Rules

### Backend Validation

All validation is handled by the Mongoose schema:

```typescript
// Name
name: {
  type: String,
  required: true,
  trim: true,
  minlength: 1,
  maxlength: 100
}

// Description
description: {
  type: String,
  trim: true,
  maxlength: 500
}

// Persona
persona: {
  type: String,
  minlength: 10,
  maxlength: 5000
}

// Greeting Message
greetingMessage: {
  type: String,
  required: true,
  trim: true,
  minlength: 5,
  maxlength: 500
}

// End Call Phrases
endCallPhrases: {
  type: [String],
  default: ['goodbye', 'bye', 'end call', 'thank you goodbye', 'talk to you later']
}

// Voice Provider
voice.provider: {
  type: String,
  required: true,
  enum: ['openai', 'elevenlabs', 'cartesia', 'deepgram']
}

// Language
language: {
  type: String,
  required: true,
  default: 'en'
}

// LLM Model
llm.model: {
  type: String,
  required: true,
  enum: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
  default: 'gpt-4o-mini'
}
```

### Frontend Validation

Recommended client-side validation:

```javascript
function validateAgentForm(formData) {
  const errors = [];

  // Name
  if (!formData.name || formData.name.trim().length === 0) {
    errors.push('Agent name is required');
  }
  if (formData.name && formData.name.length > 100) {
    errors.push('Agent name must be 100 characters or less');
  }

  // Description (optional)
  if (formData.description && formData.description.length > 500) {
    errors.push('Description must be 500 characters or less');
  }

  // Persona
  if (!formData.persona || formData.persona.trim().length < 10) {
    errors.push('Persona must be at least 10 characters');
  }
  if (formData.persona && formData.persona.length > 5000) {
    errors.push('Persona must be 5000 characters or less');
  }

  // Greeting Message
  if (!formData.greetingMessage || formData.greetingMessage.trim().length < 5) {
    errors.push('Greeting message must be at least 5 characters');
  }
  if (formData.greetingMessage && formData.greetingMessage.length > 500) {
    errors.push('Greeting message must be 500 characters or less');
  }

  // Voice
  if (!formData.voiceProvider) {
    errors.push('Voice provider is required');
  }
  if (!formData.voiceId) {
    errors.push('Voice is required');
  }

  // Language
  if (!formData.language) {
    errors.push('Language is required');
  }

  // Model
  if (!formData.model) {
    errors.push('LLM model is required');
  }

  return errors;
}
```

## Common Pitfalls & Solutions

### 1. Empty End Call Phrases
**Problem**: User deletes all end call phrases
**Solution**: Backend provides sensible defaults

### 2. Very Long Persona
**Problem**: User writes 10,000 character persona
**Solution**: Frontend limits to 5000 chars with character counter

### 3. Greeting Too Long
**Problem**: Greeting message is 2 paragraphs
**Solution**: Limit to 500 chars, suggest keeping it to 1-2 sentences

### 4. Wrong Voice ID for Provider
**Problem**: User selects OpenAI provider but uses Deepgram voice ID
**Solution**: Dynamically update voice options when provider changes

### 5. Missing Temperature
**Problem**: User doesn't set temperature
**Solution**: Backend defaults to 0.7

## Testing

### Test Agent Creation

```bash
curl -X POST http://localhost:5000/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Test Agent",
    "description": "For testing",
    "config": {
      "persona": "You are a helpful test agent for demonstration purposes.",
      "greetingMessage": "Hi! This is a test agent. How can I help?",
      "endCallPhrases": ["goodbye", "bye"],
      "voice": {
        "provider": "deepgram",
        "voiceId": "aura-asteria-en"
      },
      "language": "en",
      "llm": {
        "model": "gpt-4o-mini",
        "temperature": 0.7
      }
    }
  }'
```

### Test End Call Functionality

1. Create agent with end call phrases
2. Make phone call to agent
3. Say "goodbye" or another end call phrase
4. Agent should respond with goodbye and end call

**Expected logs**:
```
🔚 END CALL PHRASE DETECTED { transcript: 'goodbye', matchedPhrases: ['goodbye', 'bye', ...] }
🎤 SENDING FINAL MESSAGE { message: 'Thank you for calling! Have a great day. Goodbye!' }
✅ FINAL MESSAGE SENT
```

## Related Documentation

- [Prompt Architecture](./PROMPT_ARCHITECTURE.md) - How persona + system prompt work together
- [Knowledge Base System](./KNOWLEDGE_BASE_SYSTEM.md) - Upload documents to agent
- [Voice Handler Implementation](./LATENCY_OPTIMIZATIONS_V4.md) - Call flow details
