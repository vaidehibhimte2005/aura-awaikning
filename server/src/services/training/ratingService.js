import { Feedback } from '../../models/index.js';

/** Map of trainer user id → { average, count } for the given trainers (one query). */
export async function ratingsFor(userIds) {
  const rows = await Feedback.aggregate([
    { $match: { trainer: { $in: userIds } } },
    { $group: { _id: '$trainer', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { average: Math.round(r.avg * 10) / 10, count: r.count }]));
}
