import mongoose from 'mongoose';
import { env } from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let errors = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = errors[0]?.message || 'Validation failed';
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `That ${field} is already in use`;
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request is too large';
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
  }

  if (status >= 500) {
    console.error('✖', req.method, req.originalUrl, err);
    // Never leak internals in production.
    if (env.isProd) message = 'Something went wrong';
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  res.status(status).json(body);
}
