import { ActivityLog } from '../models/index.js';

/**
 * Records an audit entry. Never throws — auditing must not break the action it
 * describes — but failures are logged. Do not put secrets or full PII in `meta`.
 */
export async function logActivity({ actor, action, entityType, entity, entityLabel, from, to, reason, meta }) {
  try {
    await ActivityLog.create({
      actor: actor?._id || actor,
      actorRole: actor?.role,
      action,
      entityType,
      entityId: entity?._id || entity,
      entityLabel,
      from,
      to,
      reason,
      meta,
    });
  } catch (err) {
    console.error('logActivity failed', err.message);
  }
}
