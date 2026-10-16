import { Booking, Feedback, Trainer } from '../models/index.js';
import { ApiError, asyncHandler, created, ok } from '../utils/http.js';
import { notify } from '../services/notificationService.js';

async function trainerByKey(key) {
  const filter = /^[a-f\d]{24}$/i.test(key) ? { $or: [{ _id: key }, { user: key }] } : { slug: key };
  const t = await Trainer.findOne({ ...filter, isPublished: true });
  if (!t) throw ApiError.notFound('Trainer not found');
  return t;
}

const shortName = (n = '') => {
  const [first, ...rest] = n.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first || 'Learner';
};

/** Public: ratings and comments for a trainer (learner names are shortened). */
export const trainerFeedback = asyncHandler(async (req, res) => {
  const t = await trainerByKey(req.params.trainer);
  const [items, agg] = await Promise.all([
    Feedback.find({ trainer: t.user }).sort({ createdAt: -1 }).limit(50).populate('learner', 'name'),
    Feedback.aggregate([{ $match: { trainer: t.user } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
  ]);
  ok(res, {
    average: agg[0] ? Math.round(agg[0].avg * 10) / 10 : null,
    count: agg[0]?.count || 0,
    items: items.map((f) => ({ _id: f._id, rating: f.rating, comment: f.comment, createdAt: f.createdAt, learner: shortName(f.learner?.name) })),
  });
});

/** The signed-in learner's own sessions with this trainer, and whether each has feedback. */
export const mySessionsWithTrainer = asyncHandler(async (req, res) => {
  const t = await trainerByKey(req.params.trainer);
  const bookings = await Booking.find({ learner: req.user._id, trainer: t.user }).sort({ startAt: -1 }).limit(50).select('startAt endAt status durationMin outcome');
  const fb = await Feedback.find({ booking: { $in: bookings.map((b) => b._id) } });
  const byBooking = new Map(fb.map((f) => [String(f.booking), f]));
  ok(res, bookings.map((b) => ({ ...b.toObject(), feedback: byBooking.get(String(b._id)) || null })));
});

export const submitFeedback = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const booking = await Booking.findOne({ _id: bookingId, learner: req.user._id });
  if (!booking) throw ApiError.notFound('Session not found');
  if (booking.status !== 'completed') throw ApiError.badRequest('You can leave feedback after a session has been completed.');
  try {
    const fb = await Feedback.create({ booking: booking._id, learner: req.user._id, trainer: booking.trainer, rating, comment: comment || '' });
    await notify(booking.trainer, {
      type: 'session', title: 'New feedback', message: `${shortName(req.user.name)} rated a session ${rating}/5${comment ? `: “${comment.slice(0, 120)}”` : ''}.`,
      link: '/trainer', related: { type: 'booking', id: booking._id }, idempotencyKey: `feedback:${booking._id}`,
    });
    created(res, fb);
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already given feedback for this session.');
    throw err;
  }
});
