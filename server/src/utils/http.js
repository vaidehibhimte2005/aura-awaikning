/** Consistent API helpers — every response is { success, data } or { success, message }. */

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  static badRequest(msg = 'Bad request', details) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Please log in to continue') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'You do not have permission to do that') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'Conflict') {
    return new ApiError(409, msg);
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function ok(res, data = {}, status = 200, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data) => ok(res, data, 201);

/** Parse ?page & ?limit safely (limit capped to protect the DB). */
export function getPagination(query, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total, { page, limit }) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escape user input before using it inside a RegExp (prevents ReDoS / injection). */
export const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function pick(obj, keys) {
  return keys.reduce((acc, k) => {
    if (obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});
}
