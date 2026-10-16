import { ActivityLog } from '../models/index.js';
import { asyncHandler, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';

/** GET /api/activity-logs?entityType=&action=&entityId=&q= (audit:read) */
export const listActivity = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 30 });
  const filter = {};
  if (req.query.entityType) filter.entityType = String(req.query.entityType);
  if (req.query.entityId && /^[a-f\d]{24}$/i.test(req.query.entityId)) filter.entityId = req.query.entityId;
  if (req.query.action) filter.action = new RegExp(`^${escapeRegex(String(req.query.action).slice(0, 60))}`);
  if (req.query.q) filter.entityLabel = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('actor', 'name role'),
    ActivityLog.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});
