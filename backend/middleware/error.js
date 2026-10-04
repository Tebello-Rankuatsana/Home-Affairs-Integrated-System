import { ZodError } from 'zod';

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? res.status(413).json({ error: 'File is too large (5 MB maximum)' })
      : res.status(400).json({ error: 'Invalid file upload' });
  }
  if (err.code === 'P2002') return res.status(409).json({ error: 'A record with these details already exists' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
