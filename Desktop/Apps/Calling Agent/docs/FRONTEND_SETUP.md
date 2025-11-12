# Frontend Setup Guide

## Overview

The frontend is a modern React application built with TypeScript, Vite, and Tailwind CSS. It provides a complete admin dashboard for managing AI calling agents, viewing call logs, and monitoring agent performance.

## Features

- **Authentication**: Secure login/registration with JWT
- **Agent Management**: Create, edit, delete AI agents
- **Agent Configuration**:
  - Custom system prompts
  - Voice selection (ElevenLabs)
  - LLM settings (GPT-4)
  - Language configuration
  - End call phrases
- **Call Logs**: View call history with detailed transcripts
- **Dashboard**: Real-time statistics and analytics
- **Responsive Design**: Mobile-first UI with Tailwind CSS

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (fast HMR)
- **Zustand** - Lightweight state management
- **React Router v6** - Client-side routing
- **Axios** - HTTP client with interceptors
- **React Hook Form** - Form validation
- **Tailwind CSS** - Utility-first CSS
- **React Icons** - Icon library
- **date-fns** - Date formatting

## Prerequisites

- Node.js 18+ and npm
- Backend API running (see backend README)

## Installation

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

For production:
```env
VITE_API_URL=https://calling-api.0804.in/api
```

## Development

### Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` with hot module replacement.

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── auth/           # Login, Register, ProtectedRoute
│   │   ├── layout/         # DashboardLayout, Navigation
│   │   ├── dashboard/      # Dashboard widgets
│   │   ├── agents/         # Agent management
│   │   └── calls/          # Call logs and details
│   ├── services/           # API service layer
│   │   ├── api.ts          # Axios instance with interceptors
│   │   ├── authService.ts  # Authentication API
│   │   ├── agentService.ts # Agent CRUD API
│   │   └── callService.ts  # Call logs API
│   ├── store/              # Zustand stores
│   │   └── authStore.ts    # Authentication state
│   ├── types/              # TypeScript definitions
│   │   └── index.ts        # Shared types
│   ├── utils/              # Utility functions
│   │   └── format.ts       # Date/time formatters
│   ├── App.tsx             # Main app component with routing
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles (Tailwind)
├── public/                 # Static assets
├── .env                    # Environment variables
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind CSS config
├── postcss.config.js       # PostCSS config
├── tsconfig.json           # TypeScript config
└── package.json            # Dependencies and scripts
```

## Key Components

### Authentication Flow

1. **Login/Register** (`components/auth/`)
   - Form validation with React Hook Form
   - JWT token storage in localStorage
   - Automatic redirect to dashboard

2. **Protected Routes** (`components/auth/ProtectedRoute.tsx`)
   - Checks authentication status
   - Redirects to login if not authenticated
   - Wraps dashboard routes

3. **Auth Store** (`store/authStore.ts`)
   - Manages user state
   - Handles login/register/logout
   - Auto-refreshes tokens

### API Integration

All API calls go through the centralized `services/api.ts` which provides:

- **Base URL configuration** from environment variables
- **Request interceptor** to add JWT tokens
- **Response interceptor** to handle token refresh
- **Error handling** with automatic retry

Example usage:

```typescript
import { agentService } from '../services/agentService';

// Get all agents
const agents = await agentService.getAgents();

// Create new agent
const newAgent = await agentService.createAgent({
  name: 'Sales Agent',
  config: {...}
});
```

### State Management

Using Zustand for simple, performant state management:

```typescript
// Define store
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: async (email, password) => {
    // Login logic
    set({ user, isAuthenticated: true });
  },
}));

// Use in components
function Component() {
  const { user, login } = useAuthStore();
  // ...
}
```

### Routing

Protected routes are wrapped with `ProtectedRoute` component:

```typescript
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />

  {/* Protected routes */}
  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/agents" element={<AgentList />} />
    <Route path="/agents/new" element={<AgentForm />} />
    <Route path="/calls" element={<CallList />} />
  </Route>
</Routes>
```

## Styling

The app uses Tailwind CSS for styling:

### Global Styles

Defined in `src/index.css`:

```css
@import "tailwindcss";
```

### Component Styling

Use Tailwind utility classes directly:

```tsx
<button className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg">
  Click Me
</button>
```

### Custom Theme

Customize colors in `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        50: '#eff6ff',
        // ... more shades
        900: '#1e3a8a',
      },
    },
  },
}
```

## TypeScript Types

Shared types are defined in `src/types/index.ts`:

```typescript
export interface Agent {
  _id: string;
  name: string;
  config: AgentConfig;
  isActive: boolean;
}

export interface CallLog {
  _id: string;
  agentId: Agent;
  transcript: TranscriptEntry[];
  status: string;
}
```

Import types with `type` keyword:

```typescript
import type { Agent } from '../types';
```

## Building for Production

### 1. Build the App

```bash
npm run build
```

### 2. Deploy to Server

Upload the `dist/` folder to your web server.

### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/calling-agent-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Enable HTTPS

```bash
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

### Build Errors

If you encounter PostCSS or Tailwind errors:

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### API Connection Issues

1. Check `VITE_API_URL` in `.env`
2. Ensure backend is running
3. Check browser console for CORS errors
4. Verify Vite proxy configuration in `vite.config.ts`

### Type Errors

Use type-only imports for TypeScript types:

```typescript
// ❌ Wrong
import { User } from '../types';

// ✅ Correct
import type { User } from '../types';
```

### Hot Reload Not Working

```bash
# Restart dev server
npm run dev
```

## Performance Optimization

### Code Splitting

React Router automatically splits routes:

```typescript
// Lazy load components
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
```

### Bundle Analysis

```bash
npm run build -- --mode analyze
```

### Image Optimization

Place images in `public/` folder and reference with absolute paths:

```tsx
<img src="/logo.png" alt="Logo" />
```

## Testing

### Manual Testing Checklist

- [ ] Login with valid credentials
- [ ] Register new account
- [ ] Create new agent
- [ ] Edit existing agent
- [ ] View call logs
- [ ] View call details
- [ ] Dashboard statistics load correctly
- [ ] Logout redirects to login

### Test User

For development, create a test user via backend:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

## Development Tips

1. **Use React DevTools** - Install browser extension for debugging
2. **Check Network Tab** - Monitor API requests/responses
3. **Use TypeScript** - Catch errors at compile time
4. **Follow Component Structure** - Keep components small and focused
5. **Use Zustand DevTools** - Debug state changes

## Resources

- [React Documentation](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [React Router Docs](https://reactrouter.com/)
- [Zustand Guide](https://docs.pmnd.rs/zustand/)
