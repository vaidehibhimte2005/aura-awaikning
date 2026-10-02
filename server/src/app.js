import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.js';
import api from './routes/index.js';
import { webhook } from './controllers/paymentController.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { UPLOAD_DIR } from './services/storageService.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // correct client IPs behind a load balancer (rate limiting)
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow the SPA to load /uploads images
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / server-to-server / native apps (no Origin header) and listed web origins.
        if (!origin || env.clientUrls.includes(origin)) return cb(null, true);
        return cb(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  if (!env.isProd) app.use(morgan('dev'));

  // Webhooks need the untouched raw body for signature verification → mount before JSON parser.
  app.post('/api/payments/webhook/:provider', express.raw({ type: '*/*', limit: '1mb' }), webhook);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize()); // strips $ and . operators from user input (NoSQL injection)

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  app.use('/api', apiLimiter, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
