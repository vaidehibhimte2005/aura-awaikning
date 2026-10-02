import { ApiError } from '../utils/http.js';

/**
 * Validates req[source] against a zod schema and replaces it with the parsed
 * (stripped / coerced) value so controllers only ever see clean input.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(ApiError.badRequest(errors[0]?.message || 'Invalid input', errors));
  }
  if (source === 'query') {
    // req.query is a getter in some Express versions — mutate instead of reassigning.
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, result.data);
  } else {
    req[source] = result.data;
  }
  return next();
};
