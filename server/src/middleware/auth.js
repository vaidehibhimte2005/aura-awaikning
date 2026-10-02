import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { can, permissionsFor } from '../config/permissions.js';

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

async function loadUser(token) {
  const payload = jwt.verify(token, env.jwt.secret);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');
  return user;
}

/** Requires a valid access token. Sets req.user. */
export const protect = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized();
  try {
    req.user = await loadUser(token);
    req.permissions = permissionsFor(req.user);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token');
  }
  next();
});

/** Attaches req.user if a valid token is present; never blocks. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      req.user = await loadUser(token);
      req.permissions = permissionsFor(req.user);
    } catch {
      req.user = undefined;
    }
  }
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  return next();
};

/** Passes when the user holds ANY of the listed permissions. */
export const requirePermission = (...perms) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!perms.some((p) => can(req.user, p))) return next(ApiError.forbidden());
  return next();
};
