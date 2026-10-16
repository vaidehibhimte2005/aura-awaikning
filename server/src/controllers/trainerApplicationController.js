import crypto from 'crypto';
import { Trainer, TrainerApplication, User } from '../models/index.js';
import { ApiError, asyncHandler, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { notify, staffIds } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';
import { assertIdentityFree, finishRegistration } from './authController.js';

const newApplicationId = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `AA-TR-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

/** Maps the flat application form onto the Trainer document. */
function profileFromForm(b) {
  const out = {
    displayName: b.displayName,
    title: b.title,
    shortBio: b.shortBio,
    bio: b.bio ?? b.shortBio,
    photo: b.photo || '',
    specialties: b.specialties,
    experienceYears: b.experienceYears,
    languages: b.languages,
    qualifications: b.qualifications,
    organization: b.organization || '',
    location: { country: b.country, state: b.state, city: b.city },
    gender: b.gender || '',
    dateOfBirth: b.dateOfBirth,
    socials: b.socials || {},
    teachingCategories: b.teachingCategories,
    topics: b.topics,
    teachingFormat: b.teachingFormat,
    sessionDuration: b.sessionDuration || '',
    sessionType: b.sessionType,
    introVideoUrl: b.introVideoUrl || '',
    methodology: b.methodology,
    targetAudience: b.targetAudience,
  };
  // Undefined keys must not overwrite stored data on partial resubmission.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

const STAFF_LINK = '/manager/trainer-applications';
const reviewers = () => staffIds(['manager', 'admin']);

/** POST /api/trainer-applications — public trainer onboarding form. */
export const submitApplication = asyncHandler(async (req, res) => {
  const b = req.body;
  await assertIdentityFree({ email: b.email, phone: b.phone });
  const now = new Date();

  let user;
  let trainer;
  let application;
  try {
    user = await User.create({
      name: b.name,
      email: b.email,
      phone: b.phone,
      password: b.password,
      role: 'trainer', // fixed server-side; staff roles can never be self-assigned
      trainerStatus: 'PENDING',
      avatar: b.photo || '',
      location: { country: b.country, state: b.state, city: b.city },
      consents: { terms: now, privacy: now, trainerAgreement: now },
      authProviders: [{ provider: 'password' }],
    });
    trainer = await Trainer.create({
      ...profileFromForm(b),
      user: user._id,
      slug: await uniqueSlug(Trainer, b.displayName),
      isPublished: false, // hidden from learners until approved
    });
    application = await TrainerApplication.create({
      applicationId: newApplicationId(),
      user: user._id,
      trainer: trainer._id,
      status: 'PENDING',
      submittedAt: now,
      history: [{ to: 'PENDING', by: user._id, reason: 'Application submitted', at: now }],
    });
  } catch (err) {
    // Roll back partial records so the applicant can retry.
    if (application) await TrainerApplication.deleteOne({ _id: application._id });
    if (trainer) await Trainer.deleteOne({ _id: trainer._id });
    if (user) await User.deleteOne({ _id: user._id });
    if (err.code === 11000) throw ApiError.conflict('An account with this email or mobile number already exists');
    throw err;
  }

  await logActivity({
    actor: user,
    action: 'trainer_application.submitted',
    entityType: 'trainer_application',
    entity: application,
    entityLabel: application.applicationId,
    to: 'PENDING',
  });
  await notify(await reviewers(), {
    type: 'trainer_application',
    title: 'New trainer application',
    message: `${user.name} (${application.applicationId}) applied to teach.`,
    link: STAFF_LINK,
    related: { type: 'trainer_application', id: application._id },
    idempotencyKey: `trainer_app:submitted:${application._id}`,
  }, { channels: ['email'] });

  await finishRegistration(req, res, user, {
    application: { applicationId: application.applicationId, status: application.status, submittedAt: application.submittedAt },
  });
});

const applicantView = (a) => ({
  _id: a._id,
  applicationId: a.applicationId,
  status: a.status,
  submittedAt: a.submittedAt,
  resubmittedAt: a.resubmittedAt,
  reviewedAt: a.reviewedAt,
  decisionReason: a.decisionReason,
  history: (a.history || []).map((h) => ({ from: h.from, to: h.to, reason: h.reason, at: h.at })),
});

/** GET /api/trainer-applications/me — the applicant's own status page data. */
export const myApplication = asyncHandler(async (req, res) => {
  const a = await TrainerApplication.findOne({ user: req.user._id }).populate('trainer');
  if (!a) throw ApiError.notFound('No trainer application found for this account');
  ok(res, { application: applicantView(a), profile: a.trainer });
});

/** PATCH /api/trainer-applications/me — correct and resubmit when more info / a fix is needed. */
export const resubmitApplication = asyncHandler(async (req, res) => {
  const a = await TrainerApplication.findOne({ user: req.user._id });
  if (!a) throw ApiError.notFound('No trainer application found for this account');
  if (!['NEEDS_INFORMATION', 'REJECTED'].includes(a.status)) {
    throw ApiError.badRequest('This application can only be edited when more information is requested or it was rejected');
  }
  const b = req.body;
  const patch = profileFromForm(b);
  if (Object.keys(patch).length) {
    await Trainer.updateOne({ _id: a.trainer }, { $set: patch });
  }
  const from = a.status;
  a.status = 'PENDING';
  a.resubmittedAt = new Date();
  a.reviewedBy = undefined;
  a.reviewedAt = undefined;
  a.history.push({ from, to: 'PENDING', by: req.user._id, reason: 'Application updated and resubmitted', at: new Date() });
  await a.save();
  await User.updateOne({ _id: req.user._id }, { trainerStatus: 'PENDING' });
  await logActivity({ actor: req.user, action: 'trainer_application.resubmitted', entityType: 'trainer_application', entity: a, entityLabel: a.applicationId, from, to: 'PENDING' });
  await notify(await reviewers(), {
    type: 'trainer_application',
    title: 'Trainer application resubmitted',
    message: `${req.user.name} (${a.applicationId}) updated their application.`,
    link: STAFF_LINK,
    related: { type: 'trainer_application', id: a._id },
    idempotencyKey: `trainer_app:resubmitted:${a._id}:${a.resubmittedAt.getTime()}`,
  });
  ok(res, { application: applicantView(a) });
});

// ─── Staff ────────────────────────────────────────────────

/** GET /api/trainer-applications?q=&status=&from=&to= */
export const listApplications = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status).toUpperCase();
  if (req.query.from || req.query.to) {
    filter.submittedAt = {};
    if (req.query.from) filter.submittedAt.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.submittedAt.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
  }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    const userIds = await User.find({ role: 'trainer', $or: [{ name: rx }, { email: rx }, { phone: rx }] }).distinct('_id');
    filter.$or = [{ applicationId: rx }, { user: { $in: userIds } }];
  }
  const [items, total, counts] = await Promise.all([
    TrainerApplication.find(filter)
      .sort({ submittedAt: -1 })
      .skip(pg.skip)
      .limit(pg.limit)
      .populate('user', 'name email phone avatar')
      .populate('trainer', 'displayName title specialties experienceYears')
      .populate('reviewedBy', 'name'),
    TrainerApplication.countDocuments(filter),
    TrainerApplication.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) });
});

/** GET /api/trainer-applications/:id — full profile + history + internal notes. */
export const getApplication = asyncHandler(async (req, res) => {
  const a = await TrainerApplication.findById(req.params.id)
    .select('+internalNotes')
    .populate('user', 'name email phone avatar location createdAt emailVerified')
    .populate('trainer')
    .populate('reviewedBy', 'name email')
    .populate('history.by', 'name role')
    .populate('internalNotes.by', 'name role');
  if (!a) throw ApiError.notFound('Application not found');
  const trainer = await Trainer.findById(a.trainer?._id).select('+gender +dateOfBirth');
  ok(res, { application: a, profile: trainer });
});

// from-states each decision is allowed in, and the resulting state
const DECISIONS = {
  start_review: { from: ['PENDING', 'NEEDS_INFORMATION'], to: 'UNDER_REVIEW', action: 'under_review' },
  approve: { from: ['PENDING', 'UNDER_REVIEW'], to: 'APPROVED', action: 'approved' },
  reject: { from: ['PENDING', 'UNDER_REVIEW'], to: 'REJECTED', action: 'rejected', reasonRequired: true },
  request_information: { from: ['PENDING', 'UNDER_REVIEW'], to: 'NEEDS_INFORMATION', action: 'information_requested', reasonRequired: true },
};

/** POST /api/trainer-applications/:id/review — authorised server-side by trainers:review. */
export const reviewApplication = asyncHandler(async (req, res) => {
  if (!can(req.user, PERMISSIONS.TRAINERS_REVIEW)) throw ApiError.forbidden('You are not allowed to review trainer applications');
  const { decision, reason = '' } = req.body;
  const rule = DECISIONS[decision];
  if (rule.reasonRequired && !reason.trim()) throw ApiError.badRequest('A reason is required for this decision');

  const existing = await TrainerApplication.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Application not found');
  if (existing.user.equals(req.user._id)) throw ApiError.forbidden('You cannot review your own application');

  // Atomic transition: only succeeds if still in an allowed state (no double decisions).
  const now = new Date();
  const a = await TrainerApplication.findOneAndUpdate(
    { _id: existing._id, status: { $in: rule.from } },
    {
      $set: {
        status: rule.to,
        reviewedBy: req.user._id,
        reviewedAt: now,
        decisionReason: ['reject', 'request_information'].includes(decision) ? reason.trim() : '',
      },
      $push: { history: { from: existing.status, to: rule.to, by: req.user._id, reason: reason.trim(), at: now } },
    },
    { new: true },
  );
  if (!a) throw ApiError.conflict(`This application is ${existing.status.toLowerCase().replace('_', ' ')} and cannot be changed that way`);

  await User.updateOne({ _id: a.user }, { trainerStatus: rule.to });
  await Trainer.updateOne({ _id: a.trainer }, { isPublished: rule.to === 'APPROVED' });

  await logActivity({
    actor: req.user,
    action: `trainer_application.${rule.action}`,
    entityType: 'trainer_application',
    entity: a,
    entityLabel: a.applicationId,
    from: existing.status,
    to: rule.to,
    reason: reason.trim() || undefined,
  });

  const key = `trainer_app:${rule.action}:${a._id}:${now.getTime()}`;
  const copy = {
    under_review: { title: 'Your application is under review', message: 'A manager has started reviewing your trainer application.' },
    approved: { title: 'Your trainer application is approved', message: 'Welcome aboard! You can now log in to your trainer dashboard.' },
    rejected: { title: 'Your trainer application was not approved', message: `Reason: ${reason.trim()}` },
    information_requested: { title: 'More information needed', message: `Please update your application: ${reason.trim()}` },
  }[rule.action];
  await notify(a.user, {
    type: 'trainer_application',
    ...copy,
    link: rule.to === 'APPROVED' ? '/trainer' : '/trainer/application',
    related: { type: 'trainer_application', id: a._id },
    idempotencyKey: `${key}:trainer`,
  }, { channels: ['email'] });
  // Admins stay informed of every decision (managers already know — they made it).
  const applicant = await User.findById(a.user).select('name');
  await notify(await staffIds(['admin']), {
    type: 'trainer_application',
    title: `Trainer application ${rule.to.toLowerCase().replace('_', ' ')}`,
    message: `${applicant?.name || 'Applicant'} (${a.applicationId}) — ${rule.to.toLowerCase().replace('_', ' ')} by ${req.user.name}.`,
    link: '/admin/trainer-applications',
    related: { type: 'trainer_application', id: a._id },
    idempotencyKey: `${key}:admin`,
  });

  ok(res, applicantView(a));
});

/** POST /api/trainer-applications/:id/notes — staff-only internal note. */
export const addNote = asyncHandler(async (req, res) => {
  const a = await TrainerApplication.findByIdAndUpdate(
    req.params.id,
    { $push: { internalNotes: { by: req.user._id, text: req.body.text, at: new Date() } } },
    { new: true },
  );
  if (!a) throw ApiError.notFound('Application not found');
  await logActivity({ actor: req.user, action: 'trainer_application.note_added', entityType: 'trainer_application', entity: a, entityLabel: a.applicationId });
  ok(res, { added: true });
});
