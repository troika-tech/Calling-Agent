# AI Calling Agent - Frontend

Modern React-based admin dashboard for managing AI calling agents.

## Features

- **Authentication**: Secure login and registration
- **Agent Management**: Create, edit, and manage AI calling agents
- **Call Logs**: View detailed call history and transcripts
- **Dashboard**: Real-time analytics and statistics
- **Responsive Design**: Mobile-friendly interface built with Tailwind CSS

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **React Router** for routing
- **Zustand** for state management
- **Axios** for API calls
- **Tailwind CSS** for styling
- **React Hook Form** for form management
- **React Icons** for icons
- **date-fns** for date formatting

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your backend API URL:
```
VITE_API_URL=http://localhost:5000/api
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Create production build:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   ├── agents/         # Agent management
│   ├── calls/          # Call logs and details
│   ├── dashboard/      # Dashboard widgets
│   └── layout/         # Layout components
├── services/           # API service layer
├── store/              # Zustand state management
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── App.tsx             # Main app component
```

## Key Features

### Agent Management
- Create and configure AI agents with custom:
  - System prompts
  - Voice settings (ElevenLabs)
  - LLM configuration (GPT-4)
  - Language settings
  - End call phrases

### Call Logs
- View all call history
- Filter by status and agent
- Detailed call transcripts
- Call analytics and statistics

### Dashboard
- Real-time statistics
- Active agents overview
- Recent calls
- Performance metrics

## API Integration

The frontend communicates with the backend API through Axios interceptors that handle:
- Authentication token management
- Automatic token refresh
- Error handling
- Request/response logging

## Environment Variables

- `VITE_API_URL`: Backend API base URL (default: `http://localhost:5000/api`)

## Development Notes

- The app uses protected routes to ensure authentication
- State management is handled by Zustand for simplicity
- All API calls go through the centralized `api.ts` service
- Forms use React Hook Form for validation and state management
