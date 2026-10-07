import { ZodError } from 'zod';

export const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

export function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    hint: `No route matches ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large', hint: 'Maximum upload size is 5 MB.' });
    }
    return res.status(400).json({ error: 'Invalid file upload', hint: err.message });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(409).json({ error: 'Referenced record does not exist' });
  }

  if (err.status) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.hint ? { hint: err.hint } : {}),
    });
  }

  console.error(`[${req.id ?? '-'}] Unhandled error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}