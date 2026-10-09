import passport from '../passport.js';
import { audit } from '../audit.js';

export const authenticate = passport.authenticate('jwt', { session: false });

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (roles.includes(req.user.role)) return next();

    audit(req, {
      action: 'ACCESS_DENIED',
      resourceType: 'Route',
      resourceId: `${req.method} ${req.originalUrl}`,
      details: { requiredRoles: roles, actualRole: req.user.role },
    })
      .catch((err) => console.error('audit failed', err))
      .finally(() =>
        res.status(403).json({
          error: 'Forbidden',
          hint: `This endpoint requires one of: ${roles.join(', ')}.`,
        })
      );
  };