import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, refreshLimiter } from '../middleware/rateLimit.js';
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../validators/schemas.js';

const r = Router();
r.post('/register', authLimiter, validate(registerSchema), c.register);
r.post('/login', authLimiter, validate(loginSchema), c.login);
r.post('/verify-email', authLimiter, validate(verifyEmailSchema), c.verifyEmail);
r.post('/resend-verification', authLimiter, validate(emailOnlySchema), c.resendVerification);
r.post('/forgot-password', authLimiter, validate(emailOnlySchema), c.forgotPassword);
r.post('/reset-password', authLimiter, validate(resetPasswordSchema), c.resetPassword);
r.post('/refresh', refreshLimiter, c.refresh);
r.post('/logout', c.logout);
r.get('/me', protect, c.me);
r.patch('/me', protect, validate(updateProfileSchema), c.updateMe);
r.post('/change-password', protect, authLimiter, validate(changePasswordSchema), c.changePassword);
// Future-ready providers (same User collection, linked via user.authProviders)
r.post('/otp/request', c.notYetAvailable('Mobile OTP'));
r.post('/otp/verify', c.notYetAvailable('Mobile OTP'));
r.post('/google', c.notYetAvailable('Google'));
r.post('/apple', c.notYetAvailable('Apple'));
export default r;
