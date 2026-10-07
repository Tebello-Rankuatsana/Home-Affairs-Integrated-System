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
        isStaff: isStaff({ role: payload.role }),
      };

      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  })
);

export default passport;