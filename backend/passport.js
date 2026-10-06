import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { config } from './config.js';
import { store, revokedKey } from './cache.js';

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwtSecret,
  passReqToCallback: true,
};

passport.use(
  new JwtStrategy(opts, async (req, payload, done) => {
    try {
      // Check if token JTI has been revoked via /auth/logout
      if (payload.jti) {
        const isRevoked = await store.get(revokedKey(payload.jti));
        if (isRevoked) {
          return done(null, false);
        }
      }

      const user = {
        id: payload.sub,
        role: payload.role,
        departmentCode: payload.departmentCode ?? null,
      };

      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  })
);

export default passport;