import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { store, otpKey, otpAttemptsKey, otpCooldownKey, revokedKey, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { enqueueDelivery } from '../queue.js';

const router = Router();

//Helper to generate signed JWT tokens with unique JTI claim
function generateToken(payload) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn || '8h',
  });
  return { token, jti };
}

// Allows new citizens to register and creates authentication credentias
router.post('/register', async (req, res, next) => {
  try {
    const { nationalIdNumber, firstName, lastName, email, phoneNumber, password } = req.body;

    if (!nationalIdNumber || !firstName || !lastName || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        hint: 'nationalIdNumber, firstName, lastName, and password are required.',
      });
    }

    // Check if citizen already exists
    const existing = await prisma.citizen.findUnique({
      where: { national_id_number: nationalIdNumber },
    });

    if (existing) {
      return res.status(400).json({
        error: 'Registration failed',
        hint: 'A user with this National ID already exists.',
      });
    }

    // Hash password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Atomic creation of Citizen and Credentials record
    const newCitizen = await prisma.$transaction(async (tx) => {
      const citizen = await tx.citizen.create({
        data: {
          national_id_number: nationalIdNumber,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone_number: phoneNumber || null,
        },
      });

      await tx.authentication_credentials.create({
        data: {
          citizen_id: citizen.citizen_id,
          credential_type: 'PASSWORD',
          credential_hash: passwordHash,
          active_status: true,
        },
      });

      return citizen;
    });

    // Cache citizen identity in Redis (TTL: 1 hour)
    await store.set(
      identityCacheKey(nationalIdNumber),
      JSON.stringify({
        id: newCitizen.citizen_id.toString(),
        name: `${firstName} ${lastName}`,
      }),
      3600
    );

    // Write audit log
    await audit(
      req,
      {
        action: 'CITIZEN_REGISTER',
        resourceType: 'citizen',
        resourceId: newCitizen.citizen_id.toString(),
      },
      { id: newCitizen.citizen_id.toString(), role: 'CITIZEN', departmentCode: null }
    );

    // Auto-generate JWT token on registration
    const payload = {
      sub: newCitizen.citizen_id.toString(),
      role: 'CITIZEN',
      nationalId: newCitizen.national_id_number,
    };
    const { token } = generateToken(payload);

    return res.status(201).json({
      message: 'Citizen registered successfully',
      token,
      role: 'CITIZEN',
      user: {
        id: newCitizen.citizen_id.toString(),
        nationalId: newCitizen.national_id_number,
        firstName: newCitizen.first_name,
        lastName: newCitizen.last_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

//Standard Citizen Password Login
router.post('/login', async (req, res, next) => {
  try {
    const { nationalIdNumber, password } = req.body;

    if (!nationalIdNumber || !password) {
      return res.status(400).json({
        error: 'nationalIdNumber and password are required',
        hint: 'Provide both your National ID and account password.',
      });
    }

    const citizen = await prisma.citizen.findUnique({
      where: { national_id_number: nationalIdNumber },
    });

    if (!citizen) {
      return res.status(401).json({ error: 'Invalid credentials', hint: 'Check your National ID and password.' });
    }

    const credential = await prisma.authentication_credentials.findFirst({
      where: {
        citizen_id: citizen.citizen_id,
        credential_type: 'PASSWORD',
        active_status: true,
      },
    });

    const hash = credential?.credential_hash;
    const isValidPassword = hash ? await bcrypt.compare(password, hash) : false;

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials', hint: 'Check your National ID and password.' });
    }

    const payload = {
      sub: citizen.citizen_id.toString(),
      role: 'CITIZEN',
      nationalId: citizen.national_id_number,
    };
    const { token } = generateToken(payload);

    await audit(
      req,
      {
        action: 'CITIZEN_LOGIN',
        resourceType: 'citizen',
        resourceId: citizen.citizen_id.toString(),
      },
      { id: citizen.citizen_id.toString(), role: 'CITIZEN', departmentCode: null }
    );

    return res.json({
      token,
      role: 'CITIZEN',
      user: {
        id: citizen.citizen_id.toString(),
        nationalId: citizen.national_id_number,
        firstName: citizen.first_name,
        lastName: citizen.last_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

//request (Citizens OTP Request)
 
router.post('/otp/request', async (req, res, next) => {
  try {
    const { nationalId } = req.body;
    if (!nationalId) {
      return res.status(400).json({
        error: 'nationalId is required',
        hint: 'Provide a valid citizen national ID number.',
      });
    }

    // Check cooldown
    const cooldown = await store.get(otpCooldownKey(nationalId));
    if (cooldown) {
      return res.status(429).json({
        error: 'Too many requests',
        hint: 'Please wait before requesting another OTP.',
      });
    }

    // Lookup citizen
    const citizen = await prisma.citizen.findUnique({
      where: { national_id_number: nationalId },
    });

    // Prevent identity enumeration: always return 200 OK even if citizen does not exist
    if (!citizen) {
      return res.json({ message: 'If the National ID exists, an OTP has been sent.' });
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in cache with TTL and reset attempts
    await store.set(otpKey(nationalId), code, config.otpTtlSeconds || 300);
    await store.set(otpCooldownKey(nationalId), '1', config.otpCooldownSeconds || 60);
    await store.del(otpAttemptsKey(nationalId));

    // Dispatch background delivery job via BullMQ / fallback
    await enqueueDelivery(code);

    const response = { message: 'If the National ID exists, an OTP has been sent.' };

    
    if (!config.isProd || config.demoMode) {
      response.devOtp = code;
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

//verify (Citizens OTP Verification)
router.post('/otp/verify', async (req, res, next) => {
  try {
    const { nationalId, code } = req.body;
    if (!nationalId || !code) {
      return res.status(400).json({
        error: 'nationalId and code are required',
        hint: 'Provide both fields.',
      });
    }

    // Track attempt counts
    const attempts = await store.incr(otpAttemptsKey(nationalId), config.otpTtlSeconds || 300);
    if (attempts > (config.otpMaxAttempts || 5)) {
      await store.del(otpKey(nationalId));
      return res.status(429).json({
        error: 'Too many failed attempts',
        hint: 'Please request a new OTP.',
      });
    }

    const storedCode = await store.get(otpKey(nationalId));
    if (!storedCode || storedCode !== code) {
      return res.status(401).json({
        error: 'Invalid or expired OTP',
        hint: 'Check the code or request a new one.',
      });
    }

    // Fetch citizen details
    const citizen = await prisma.citizen.findUnique({
      where: { national_id_number: nationalId },
    });

    if (!citizen) {
      return res.status(401).json({
        error: 'Citizen record not found',
        hint: 'Ensure citizen registration is complete.',
      });
    }

    // Clear OTP from cache upon successful login
    await store.del(otpKey(nationalId));
    await store.del(otpAttemptsKey(nationalId));

    // Generate JWT
    const payload = {
      sub: citizen.citizen_id.toString(),
      role: 'CITIZEN',
      nationalId: citizen.national_id_number,
    };
    const { token } = generateToken(payload);

    await audit(
      req,
      {
        action: 'CITIZEN_LOGIN',
        resourceType: 'citizen',
        resourceId: citizen.citizen_id.toString(),
      },
      { id: citizen.citizen_id.toString(), role: 'CITIZEN', departmentCode: null }
    );

    return res.json({
      token,
      role: 'CITIZEN',
      user: {
        id: citizen.citizen_id.toString(),
        nationalId: citizen.national_id_number,
        firstName: citizen.first_name,
        lastName: citizen.last_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/staff/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        error: 'email and password are required',
        hint: 'Provide valid credentials.',
      });
    }

    // Find staff member with department and role relations
    const staffMember = await prisma.staff.findUnique({
      where: { email },
      include: {
        department: true,
        staff_role_staff_role_staff_idTostaff: {
          include: { role: true },
        },
      },
    });

    if (!staffMember) {
      return res.status(401).json({ error: 'Invalid credentials', hint: 'Check email and password.' });
    }

    // Find active password authentication credential
    const credential = await prisma.authentication_credentials.findFirst({
      where: {
        citizen_id: staffMember.staff_id,
        active_status: true,
      },
    });

    const hash = credential?.credential_hash;
    const isValidPassword = hash ? await bcrypt.compare(password, hash) : false;

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials', hint: 'Check email and password.' });
    }

    // Determine primary staff role
    const primaryRole =
      staffMember.staff_role_staff_role_staff_idTostaff[0]?.role?.role_name || 'DEPARTMENT_STAFF';

    const payload = {
      sub: staffMember.staff_id.toString(),
      role: primaryRole,
      departmentCode: staffMember.department?.department_code ?? null,
      email: staffMember.email,
    };

    const { token } = generateToken(payload);

    await audit(
      req,
      {
        action: 'STAFF_LOGIN',
        resourceType: 'staff',
        resourceId: staffMember.staff_id.toString(),
      },
      {
        id: staffMember.staff_id.toString(),
        role: primaryRole,
        departmentCode: staffMember.department?.department_code ?? null,
      }
    );

    return res.json({
      token,
      role: primaryRole,
      user: {
        id: staffMember.staff_id.toString(),
        email: staffMember.email,
        departmentCode: staffMember.department?.department_code ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});


router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token', hint: 'Provide a valid Bearer token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token);

    if (decoded && decoded.jti) {
      // Calculate remaining TTL until expiration
      const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
      if (ttl > 0) {
        await store.set(revokedKey(decoded.jti), '1', ttl);
      }
    }

    return res.json({ message: 'Successfully logged out' });
  } catch (err) {
    next(err);
  }
});

export default router;