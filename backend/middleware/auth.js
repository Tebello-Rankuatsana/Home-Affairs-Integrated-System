import passport from '../passport.js';
import { audit } from '../audit.js';

export const authenticate = passport.authenticate('jwt', { session: false });

// RBAC: allow only the listed roles; denied attempts are audited
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    audit(req, {
      action: 'ACCESS_DENIED',
      resourceType: 'Route',
      resourceId: `${req.method} ${req.path}`,
    })
      .catch((err) => console.error('audit failed', err))
      .finally(() => res.status(403).json({ error: 'Forbidden' }));
  };
