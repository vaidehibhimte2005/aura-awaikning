import crypto from 'crypto';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { notify, sendEmail, staffIds } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';
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

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const VERIFY_HOURS = 24;
const RESET_MINUTES = 30;

/** Issues a one-time token; only its hash is stored. */
function oneTimeToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: sha256(token) };
}

/**
 * Sends the verification email. Without SMTP configured the link is printed to
 * the server console in development so the flow can still be exercised.
 */
export async function sendVerificationEmail(user) {
  const { token, hash } = oneTimeToken();
  await User.updateOne(
    { _id: user._id },
    { emailVerifyTokenHash: hash, emailVerifyExpires: new Date(Date.now() + VERIFY_HOURS * 3600000) },
  );
  const link = `${env.siteUrl}/verify-email?token=${token}`;
  const sent = await sendEmail({
    to: user.email,
    subject: 'Verify your Aura Awakening account',
    text: `Welcome to Aura Awakening, ${user.name}.\n\nConfirm your email address: ${link}\n\nThis link expires in ${VERIFY_HOURS} hours.`,
  });
  if (!sent && !env.isProd) console.log(`[dev] email verification link for ${user.email}: ${link}`);
  return sent;
}

/** Shared by learner + trainer registration: unique email / mobile number. */
export async function assertIdentityFree({ email, phone }) {
  const [byEmail, byPhone] = await Promise.all([User.exists({ email }), phone ? User.exists({ phone }) : null]);
  if (byEmail) throw ApiError.conflict('An account with this email already exists');
  if (byPhone) throw ApiError.conflict('An account with this mobile number already exists');
}

/** Starts a session, or asks the user to verify first when verification is enforced. */
export async function finishRegistration(req, res, user, extra = {}) {
  await sendVerificationEmail(user);
  if (env.requireEmailVerification) {
    return created(res, { verificationRequired: true, email: user.email, ...extra });
  }
  const accessToken = signAccessToken(user);
  const refresh = await issueRefreshToken(user, req.headers['user-agent']);
  const data = { user, accessToken, permissions: permissionsFor(user), verificationRequired: false, ...extra };
  if (isMobile(req)) data.refreshToken = refresh.token;
  else res.cookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions(refresh.expiresAt));
  return created(res, data);
}

/** Learner self-registration. The role is fixed server-side — never taken from the client. */
export const register = asyncHandler(async (req, res) => {
  const b = req.body;
  await assertIdentityFree({ email: b.email, phone: b.phone });
  const now = new Date();
  let user;
  try {
    user = await User.create({
      name: b.name,
      email: b.email,
      phone: b.phone,
      password: b.password,
      role: 'learner',
      location: { country: b.country, state: b.state, city: b.city },
      interests: b.interests,
      learningGoals: b.learningGoals || '',
      consents: { terms: now, privacy: now },
      authProviders: [{ provider: 'password' }],
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('An account with this email or mobile number already exists');
    throw err;
  }
  await logActivity({ actor: user, action: 'learner.registered', entityType: 'user', entity: user, entityLabel: user.name });
  await notify(user._id, {
    type: 'registration',
    title: 'Welcome to Aura Awakening',
    message: 'Your account is ready. Choose a training plan to get started — then book a session with a trainer.',
    link: '/dashboard/plans',
    related: { type: 'user', id: user._id },
    idempotencyKey: `welcome:${user._id}`,
  });
  await notify(await staffIds(['admin']), {
    type: 'registration',
    title: 'New learner enrolled',
    message: `${user.name} (${user.email}) registered.`,
    link: '/admin/learners',
    related: { type: 'user', id: user._id },
    idempotencyKey: `learner_registered:${user._id}`,
  });
  await finishRegistration(req, res, user);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    emailVerifyTokenHash: sha256(req.body.token),
    emailVerifyExpires: { $gt: new Date() },
  }).select('+emailVerifyTokenHash +emailVerifyExpires');
  if (!user) throw ApiError.badRequest('This verification link is invalid or has expired');
  user.emailVerified = true;
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpires = undefined;
  await user.save({ validateModifiedOnly: true });
  await notify(user._id, { type: 'account', title: 'Email verified', message: 'Your email address is confirmed.', idempotencyKey: `email_verified:${user._id}` });
  ok(res, { verified: true, role: user.role });
});

/** Always answers the same way so it can't be used to discover accounts. */
export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && !user.emailVerified) await sendVerificationEmail(user);
  ok(res, { sent: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email, isActive: true });
  if (user) {
    const { token, hash } = oneTimeToken();
    await User.updateOne(
      { _id: user._id },
      { passwordResetTokenHash: hash, passwordResetExpires: new Date(Date.now() + RESET_MINUTES * 60000) },
    );
    const link = `${env.siteUrl}/reset-password?token=${token}`;
    const sent = await sendEmail({
      to: user.email,
      subject: 'Reset your Aura Awakening password',
      text: `Use this link to choose a new password: ${link}\n\nIt expires in ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email.`,
    });
    if (!sent && !env.isProd) console.log(`[dev] password reset link for ${user.email}: ${link}`);
  }
  ok(res, { sent: true });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(req.body.token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires +refreshTokens');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  user.password = req.body.password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // sign out everywhere
  await user.save();
  await logActivity({ actor: user, action: 'user.password_reset', entityType: 'user', entity: user, entityLabel: user.name });
  ok(res, { reset: true });
});

/** email-or-mobile + password. One generic failure message for every bad-credential case. */
export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { phone: identifier.replace(/[\s\-().]/g, '') };
  const user = await User.findOne(query).select('+password');
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Incorrect email/mobile number or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled. Please contact support.');
  if (env.requireEmailVerification && !user.emailVerified && user.role === 'learner') {
    throw ApiError.forbidden('Please verify your email address first. Check your inbox for the verification link.');
  }
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
