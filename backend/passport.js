import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { config } from './config.js';
import { store, revokedKey } from './cache.js';
import { isStaff } from './constants.js';

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwtSecret,
  passReqToCallback: true,
};

passport.use(
  new JwtStrategy(opts, async (req, payload, done) => {
    try {
      if (!payload.sub || !payload.role || !payload.type) {
        return done(null, false, { message: 'Malformed token payload' });
      }
      if (payload.jti) {
        const revoked = await store.get(revokedKey(payload.jti));
        if (revoked) return done(null, false, { message: 'Token has been revoked' });
      }

      const user = {
        id: String(payload.sub),
        type: payload.type,
        role: payload.role,
        departmentCode: payload.departmentCode ?? null,
        isStaff: isStaff({ role: payload.role }),
      };
      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  })
);

export default passport;