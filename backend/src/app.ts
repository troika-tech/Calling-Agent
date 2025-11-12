import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { requestLogger, errorLogger } from './middlewares/requestLogger';
import { stream, logger } from './utils/logger';

// Import routes
import routes from './routes';

// Create Express app
const app: Application = express();

// Security middleware
app.use(helmet());

// CORS - Allow multiple origins (production and development)
const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parser
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// HTTP request logger (Morgan for detailed logs)
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream }));
} else {
  app.use(morgan('combined', { stream }));
}

// Custom request logger for structured logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

//test comment

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use(notFoundHandler);

// Error logger (must be before error handler)
app.use(errorLogger);

// Error handler (must be last)
app.use(errorHandler);

export default app;
