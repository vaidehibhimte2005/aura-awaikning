import { Enrollment, Payment, Trainer, User } from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';

export const listUsers = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    User.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  const [enrollments, payments] = await Promise.all([
    Enrollment.find({ user: user._id }).populate('course', 'title slug').sort({ createdAt: -1 }),
    Payment.find({ user: user._id }).populate('course', 'title').sort({ createdAt: -1 }).limit(20),
  ]);
  ok(res, { user, enrollments, payments });
});

async function ensureTrainerProfile(user) {
  if (user.role !== 'trainer') return;
  if (await Trainer.exists({ user: user._id })) return;
  await Trainer.create({ user: user._id, displayName: user.name, slug: await uniqueSlug(Trainer, user.name), isPublished: false });
}

export const createUser = asyncHandler(async (req, res) => {
  if (!req.body.password) throw ApiError.badRequest('Password is required for new users');
  if (await User.exists({ email: req.body.email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create(req.body);
  await ensureTrainerProfile(user);
  created(res, user);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  const isSelf = user._id.equals(req.user._id);
  if (isSelf && (req.body.role && req.body.role !== 'admin')) throw ApiError.badRequest('You cannot remove your own admin role');
  if (isSelf && req.body.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');
  if (user.role === 'admin' && req.body.role && req.body.role !== 'admin') {
    const admins = await User.countDocuments({ role: 'admin', isActive: true });
    if (admins <= 1) throw ApiError.badRequest('At least one active admin is required');
  }
  user.set(req.body);
  if (req.body.isActive === false) {
    await User.updateOne({ _id: user._id }, { refreshTokens: [] });
  }
  await user.save();
  await ensureTrainerProfile(user);
  ok(res, user);
});

/** Soft delete: deactivation keeps orders, payments and certificates intact. */
export const deactivateUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot deactivate your own account');
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false, refreshTokens: [] }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  ok(res, user);
});
