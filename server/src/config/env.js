import 'dotenv/config';

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  // Fail fast: never boot with an insecure default secret.
  console.error(`✖ Missing required environment variables: ${missing.join(', ')}`);
  console.error('  Copy server/.env.example to server/.env and fill them in.');
  process.exit(1);
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 5000,
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`,
  siteUrl: process.env.SITE_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30,
  },
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase(),
    currency: process.env.DEFAULT_CURRENCY || 'INR',
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
  },
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM || 'Aura Awakening <hello@auraawakening.com>',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    maxMb: Number(process.env.UPLOAD_MAX_MB) || 5,
  },
};
