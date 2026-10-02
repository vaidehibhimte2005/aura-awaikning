import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/http.js';

const MAX_SESSIONS = 8;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

export const REFRESH_COOKIE = 'aa_refresh';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.accessExpires,
  });
}

/**
 * Issues an opaque-ish refresh JWT and stores only its SHA-256 hash, so a
 * leaked database cannot be used to mint sessions. Tokens rotate on every use.
 */
export async function issueRefreshToken(user, userAgent = '') {
  const token = jwt.sign({ sub: user._id.toString(), jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: `${env.jwt.refreshDays}d`,
  });
  const expiresAt = new Date(Date.now() + env.jwt.refreshDays * 86400000);
  const doc = await User.findById(user._id).select('+refreshTokens');
  const now = Date.now();
  doc.refreshTokens = doc.refreshTokens
    .filter((t) => t.expiresAt.getTime() > now)
    .slice(-(MAX_SESSIONS - 1));
  doc.refreshTokens.push({ tokenHash: hash(token), expiresAt, userAgent: userAgent.slice(0, 200) });
  await doc.save({ validateModifiedOnly: true });
  return { token, expiresAt };
}

export async function rotateRefreshToken(token, userAgent) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Session expired — please log in again');
  }
  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');
  const h = hash(token);
  const exists = user.refreshTokens.some((t) => t.tokenHash === h);
  if (!exists) {
    // Token reuse detected → revoke every session for safety.
    user.refreshTokens = [];
    await user.save({ validateModifiedOnly: true });
    throw ApiError.unauthorized('Session is no longer valid — please log in again');
  }
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== h);
  await user.save({ validateModifiedOnly: true });
  const refresh = await issueRefreshToken(user, userAgent);
  return { user, accessToken: signAccessToken(user), refresh };
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.jwt.refreshSecret, { ignoreExpiration: true });
    await User.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: { tokenHash: hash(token) } } });
  } catch {
    /* ignore malformed tokens on logout */
  }
}

export function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/api/auth',
    expires: expiresAt,
  };
}
