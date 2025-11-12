# Development Guide

## Table of Contents
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Debugging](#debugging)
- [Git Workflow](#git-workflow)
- [Best Practices](#best-practices)

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- MongoDB 7.0+
- Redis 7.0+
- Git
- VS Code (recommended) or your preferred IDE

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-calling-platform.git
cd ai-calling-platform

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Setup environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit environment files with your API keys
```

### Running Development Servers

**Terminal 1 - Start MongoDB and Redis:**
```bash
# Using Docker Compose (recommended)
docker-compose up -d mongodb redis

# Or start services manually
# MongoDB
mongod --dbpath /path/to/data

# Redis
redis-server
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 4 - Expose webhooks (optional):**
```bash
ngrok http 5000
# Update WEBHOOK_BASE_URL in backend/.env
```

### Accessing the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Docs**: http://localhost:5000/api-docs (if Swagger is setup)

---

## Development Workflow

### Daily Workflow

1. **Pull latest changes**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes and test**
   ```bash
   # Make your changes
   npm run lint
   npm run test
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request**
   - Go to GitHub and create a PR from your branch to `develop`
   - Wait for code review and CI checks
   - Merge after approval

### Hot Reloading

Both backend and frontend support hot reloading:

- **Backend**: Uses `nodemon` to restart on file changes
- **Frontend**: Vite HMR (Hot Module Replacement)

Changes are automatically reflected without manual restart.

---

## Project Structure

### Backend Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── db.ts           # MongoDB connection
│   │   ├── redis.ts        # Redis connection
│   │   └── env.ts          # Environment variables
│   │
│   ├── models/             # Mongoose models
│   │   ├── User.ts
│   │   ├── Agent.ts
│   │   └── CallLog.ts
│   │
│   ├── controllers/        # Route controllers
│   │   ├── auth.controller.ts
│   │   ├── agent.controller.ts
│   │   └── call.controller.ts
│   │
│   ├── services/           # Business logic
│   │   ├── auth.service.ts
│   │   ├── exotel.service.ts
│   │   └── voice-pipeline.service.ts
│   │
│   ├── routes/             # API routes
│   │   ├── auth.routes.ts
│   │   └── index.ts
│   │
│   ├── middlewares/        # Express middlewares
│   │   ├── auth.middleware.ts
│   │   └── validation.middleware.ts
│   │
│   ├── utils/              # Utility functions
│   │   ├── logger.ts
│   │   └── validation.ts
│   │
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   │
│   ├── app.ts             # Express app setup
│   └── server.ts          # Server entry point
│
├── tests/                  # Test files
│   ├── unit/
│   └── integration/
│
├── .env.example           # Environment template
├── tsconfig.json          # TypeScript config
└── package.json
```

### Frontend Structure

```
frontend/
├── src/
│   ├── api/               # API client functions
│   │   ├── axios.ts
│   │   ├── auth.api.ts
│   │   └── agent.api.ts
│   │
│   ├── components/        # React components
│   │   ├── common/       # Reusable components
│   │   ├── layout/       # Layout components
│   │   └── agents/       # Feature-specific
│   │
│   ├── pages/            # Page components
│   │   ├── Dashboard.tsx
│   │   └── agents/
│   │
│   ├── store/            # Redux store
│   │   ├── store.ts
│   │   └── slices/
│   │
│   ├── hooks/            # Custom hooks
│   │   ├── useAuth.ts
│   │   └── useSocket.ts
│   │
│   ├── utils/            # Utility functions
│   │   └── formatters.ts
│   │
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   │
│   ├── App.tsx           # Main App component
│   └── main.tsx          # Entry point
│
├── public/               # Static assets
├── .env.example
└── package.json
```

---

## Coding Standards

### TypeScript Guidelines

**Use proper typing:**
```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  name: string;
}

const getUser = async (id: string): Promise<User> => {
  // ...
};

// ❌ Bad
const getUser = async (id: any): Promise<any> => {
  // ...
};
```

**Use enums for constants:**
```typescript
// ✅ Good
enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

// ❌ Bad
const USER_ROLE = 'user';
```

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Functions/Variables**: camelCase (`getUserById`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase with I prefix (`IUser`)
- **Types**: PascalCase (`UserRole`)

### Code Organization

**Services should be single-responsibility:**
```typescript
// ✅ Good - Focused service
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    // Email logic only
  }
}

// ❌ Bad - Too many responsibilities
class UserService {
  async createUser() { /* ... */ }
  async sendEmail() { /* ... */ }
  async processPayment() { /* ... */ }
}
```

### Error Handling

**Use custom error classes:**
```typescript
// utils/errors.ts
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// Usage
if (!user) {
  throw new NotFoundError('User not found');
}
```

### Environment Variables

**Always use type-safe config:**
```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  MONGODB_URI: z.string().url(),
  JWT_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
});

export const env = envSchema.parse(process.env);

// Usage
console.log(env.PORT); // Type-safe, validated
```

---

## Testing

### Unit Tests

**Test file naming:** `*.test.ts` or `*.spec.ts`

**Example unit test:**
```typescript
// services/auth.service.test.ts
import { AuthService } from './auth.service';
import { User } from '../models/User';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      const password = 'password123';
      const hashed = await authService.hashPassword(password);

      expect(hashed).not.toBe(password);
      expect(hashed.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'password123';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validatePassword', () => {
    it('should validate correct password', async () => {
      const password = 'password123';
      const hashed = await authService.hashPassword(password);
      const isValid = await authService.validatePassword(password, hashed);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'password123';
      const hashed = await authService.hashPassword(password);
      const isValid = await authService.validatePassword('wrong', hashed);

      expect(isValid).toBe(false);
    });
  });
});
```

**Run tests:**
```bash
# Backend
cd backend
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage

# Frontend
cd frontend
npm run test
npm run test:coverage
```

### Integration Tests

**Example API test:**
```typescript
// tests/integration/auth.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { User } from '../../src/models/User';

describe('Auth API', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.tokens.access).toBeDefined();
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
```

### Testing Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **Follow AAA pattern: Arrange, Act, Assert**
4. **Mock external services**
5. **Clean up after tests**

---

## Debugging

### Backend Debugging

**VS Code launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/src/server.ts",
      "preLaunchTask": "npm: dev",
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

**Console logging:**
```typescript
import { logger } from './utils/logger';

// Use logger instead of console.log
logger.info('User logged in', { userId: user.id });
logger.error('Error processing payment', { error, userId });
logger.debug('Processing request', { body: req.body });
```

### Frontend Debugging

**React DevTools:**
- Install React DevTools browser extension
- Inspect component props and state
- Profile component performance

**Redux DevTools:**
- Install Redux DevTools extension
- Track actions and state changes
- Time-travel debugging

**Chrome DevTools:**
```javascript
// Add breakpoints in code
debugger;

// Console logging
console.log('Component rendered', props);
console.table(users); // For arrays of objects
console.time('api-call');
// ... code
console.timeEnd('api-call');
```

### Network Debugging

**Backend request logging:**
```typescript
// middlewares/logger.middleware.ts
import morgan from 'morgan';

export const requestLogger = morgan('combined', {
  stream: {
    write: (message) => logger.http(message.trim())
  }
});
```

**Frontend API debugging:**
```typescript
// api/axios.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// Request interceptor
api.interceptors.request.use((config) => {
  console.log('API Request:', config.method, config.url, config.data);
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.data);
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);
```

---

## Git Workflow

### Branch Strategy

```
main (production)
  └── develop (development)
       ├── feature/user-authentication
       ├── feature/call-logging
       ├── bugfix/fix-login-error
       └── hotfix/critical-security-fix
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(auth): add JWT authentication"
git commit -m "fix(calls): resolve call disconnection issue"
git commit -m "docs(api): update API documentation"
git commit -m "refactor(services): extract email service"
```

### Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat: add feature"
   ```

3. **Push to remote**
   ```bash
   git push origin feature/your-feature
   ```

4. **Create PR on GitHub**
   - Provide clear description
   - Link related issues
   - Add screenshots if UI changes

5. **Code Review**
   - Address review comments
   - Push additional commits

6. **Merge**
   - Squash and merge (preferred)
   - Delete branch after merge

---

## Best Practices

### Backend Best Practices

**1. Use async/await instead of callbacks:**
```typescript
// ✅ Good
async function getUser(id: string) {
  const user = await User.findById(id);
  return user;
}

// ❌ Bad
function getUser(id: string, callback) {
  User.findById(id, (err, user) => {
    if (err) return callback(err);
    callback(null, user);
  });
}
```

**2. Handle errors properly:**
```typescript
// ✅ Good
try {
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
} catch (error) {
  logger.error('Error fetching user', { error, id });
  throw error;
}
```

**3. Validate input:**
```typescript
// Use Zod for validation
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  config: z.object({
    prompt: z.string().min(10).max(5000),
    voice: z.object({
      provider: z.enum(['openai', 'elevenlabs']),
      voiceId: z.string()
    })
  })
});

// In controller
const validated = createAgentSchema.parse(req.body);
```

**4. Use transactions for multiple DB operations:**
```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  const user = await User.create([{ email, password }], { session });
  await Agent.create([{ userId: user[0]._id, name }], { session });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### Frontend Best Practices

**1. Use custom hooks:**
```typescript
// hooks/useAuth.ts
export const useAuth = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);

  const login = async (email: string, password: string) => {
    const response = await authAPI.login(email, password);
    dispatch(setUser(response.data.user));
  };

  return { user, login };
};
```

**2. Memoize expensive computations:**
```typescript
import { useMemo } from 'react';

const CallLogs = ({ calls }) => {
  const stats = useMemo(() => {
    return calls.reduce((acc, call) => ({
      total: acc.total + 1,
      duration: acc.duration + call.durationSec
    }), { total: 0, duration: 0 });
  }, [calls]);

  return <div>{/* ... */}</div>;
};
```

**3. Lazy load routes:**
```typescript
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentList = lazy(() => import('./pages/agents/AgentList'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agents" element={<AgentList />} />
      </Routes>
    </Suspense>
  );
}
```

**4. Handle loading and error states:**
```typescript
const AgentList = () => {
  const { data, isLoading, error } = useGetAgentsQuery();

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;
  if (!data || data.length === 0) return <EmptyState />;

  return <div>{/* Render agents */}</div>;
};
```

### Performance Best Practices

**1. Database indexing:**
```typescript
// Ensure indexes are created
agentSchema.index({ userId: 1, createdAt: -1 });
agentSchema.index({ name: 'text' });
```

**2. Caching:**
```typescript
// Cache frequently accessed data
const getAgent = async (id: string) => {
  const cached = await redis.get(`agent:${id}`);
  if (cached) return JSON.parse(cached);

  const agent = await Agent.findById(id);
  await redis.setex(`agent:${id}`, 3600, JSON.stringify(agent));
  return agent;
};
```

**3. Pagination:**
```typescript
// Always paginate large datasets
const getCalls = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const calls = await CallLog.find()
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await CallLog.countDocuments();

  return { calls, total, page, pages: Math.ceil(total / limit) };
};
```

---

**Next:** See [INTEGRATIONS.md](INTEGRATIONS.md) for third-party service integration guides.
