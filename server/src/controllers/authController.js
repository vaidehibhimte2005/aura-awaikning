import { User } from '../models/index.js';
import { ApiError, asyncHandler, created, ok } from '../utils/http.js';
import { permissionsFor } from '../config/permissions.js';
import {
  REFRESH_COOKIE,
  issueRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../services/tokenService.js';

/**
 * Browser clients receive the refresh token as an httpOnly cookie.
 * Native/mobile clients (header `X-Client: mobile`) receive it in the body and
 * send it back in the body — same API, same user database.
 */
const isMobile = (req) => String(req.headers['x-client'] || '').toLowerCase() === 'mobile';

async function sendSession(req, res, user, status = 200) {
  const accessToken = signAccessToken(user);
  const refresh = await issueRefreshToken(user, req.headers['user-agent']);
  const data = { user, accessToken, permissions: permissionsFor(user) };
  if (isMobile(req)) data.refreshToken = refresh.token;
  else res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions(refresh.expiresAt));
  return status === 201 ? created(res, data) : ok(res, data);
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create({ name, email, password, authProviders: [{ provider: 'password' }] });
  await sendSession(req, res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Incorrect email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled. Please contact support.');
  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });
  await sendSession(req, res, user);
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('No session');
  const { user, accessToken, refresh: next } = await rotateRefreshToken(token, req.headers['user-agent']);
  const data = { user, accessToken, permissions: permissionsFor(user) };
  if (isMobile(req)) data.refreshToken = next.token;
  else res.cookie(REFRESH_COOKIE, next.token, refreshCookieOptions(next.expiresAt));
  ok(res, data);
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
  ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user, permissions: req.permissions });
});

export const updateMe = asyncHandler(async (req, res) => {
  req.user.set(req.body);
  await req.user.save();
  ok(res, { user: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!(await user.comparePassword(req.body.currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  user.password = req.body.newPassword;
  user.refreshTokens = []; // sign out other devices
  await user.save();
  await sendSession(req, res, user);
});

/**
 * Placeholders for future providers. The User model already supports linking
 * via `authProviders`; implement token verification here and call sendSession().
 */
export const notYetAvailable = (provider) => asyncHandler(async () => {
  throw new ApiError(501, `${provider} sign-in is not enabled yet`);
});
