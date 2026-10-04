import passport from 'passport';
import pjwt from 'passport-jwt';
import { config } from './config.js';
import { prisma } from './db.js';

const { Strategy: JwtStrategy, ExtractJwt } = pjwt;

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
    },
    async (payload, done) => {
      try {
        // Load the user on every request so deactivation and role changes take effect immediately
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          include: { department: true },
        });
        if (!user || !user.active) return done(null, false);
        return done(null, {
          id: user.id,
          role: user.role,
          departmentId: user.departmentId,
          departmentCode: user.department?.code ?? null,
        });
      } catch (err) {
        return done(err, false);
      }
    },
  ),
);

export default passport;
