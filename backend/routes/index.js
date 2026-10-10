import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.js';
import { authLimiter, otpLimiter, publicLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import * as auth from '../controllers/authController.js';
import * as citizens from '../controllers/citizenController.js';
import * as identity from '../controllers/identityController.js';
import * as catalog from '../controllers/catalogController.js';
import * as applications from '../controllers/applicationController.js';
import * as documents from '../controllers/documentController.js';
import * as payments from '../controllers/paymentController.js';
import * as appointments from '../controllers/appointmentController.js';
import * as notifications from '../controllers/notificationController.js';
import * as receipts from '../controllers/receiptController.js';
import * as admin from '../controllers/adminController.js';
import * as audit from '../controllers/auditController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxBytes, files: 1 },
});

const CITIZEN = requireRole('CITIZEN');
const STAFF = requireRole('DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER');
const DEPT_STAFF = requireRole('DEPARTMENT_STAFF');
const HOME_AFFAIRS = requireRole('HOME_AFFAIRS_OFFICER');
const ADMIN = requireRole('ADMIN');

const router = Router();

// Public endpoints

router.post('/auth/otp/request', otpLimiter, auth.requestOtp);
router.post('/auth/otp/verify', authLimiter, auth.verifyOtp);
router.post('/auth/staff/login', authLimiter, auth.staffLogin);
router.get('/receipts/verify/:receiptNumber', publicLimiter, receipts.verify);

// Public catalogue (matches /docs): anyone can browse services and departments.
router.get('/services', catalog.services);
router.get('/departments', catalog.departments);

// Everything below requires a valid bearer token

router.use(authenticate);

router.post('/auth/logout', auth.logout);

// Citizen profile and identity

router.get('/me', CITIZEN, citizens.me);
router.patch('/me', CITIZEN, citizens.updateSelf);
router.post('/citizens', HOME_AFFAIRS, citizens.create);
router.patch('/citizens/:nationalId', HOME_AFFAIRS, citizens.update);
router.post('/identity/verify', STAFF, identity.verify);

// Applications

router.post('/applications', CITIZEN, applications.submit);
router.get('/applications', applications.list);
router.get('/applications/:id', applications.get);
router.patch('/applications/:id/status', DEPT_STAFF, applications.changeStatus);
router.post('/applications/:id/assign', DEPT_STAFF, applications.assign);
router.post('/applications/:id/respond', CITIZEN, applications.respond);
router.post('/applications/:id/withdraw', CITIZEN, applications.withdraw);
router.post('/applications/:id/pay', CITIZEN, payments.pay);
router.post('/applications/:id/documents/:documentId', CITIZEN, documents.attach);
router.post('/applications/:id/documents/:documentId/review', DEPT_STAFF, documents.review);

// Payments

router.get('/payments', CITIZEN, payments.list);

// Documents

router.post('/documents', CITIZEN, upload.single('file'), documents.upload);
router.get('/documents', CITIZEN, documents.list);
router.get(
  '/documents/:id/download',
  requireRole('CITIZEN', 'DEPARTMENT_STAFF'),
  documents.download
);
router.delete('/documents/:id', CITIZEN, documents.remove);

// Appointments and queue

router.get(
  '/appointments/slots',
  requireRole('CITIZEN', 'DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER'),
  appointments.slots
);
router.post('/appointments', CITIZEN, appointments.book);
router.get(
  '/appointments',
  requireRole('CITIZEN', 'DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER', 'ADMIN'),
  appointments.list
);
router.post(
  '/appointments/:id/cancel',
  requireRole('CITIZEN', 'DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER'),
  appointments.cancel
);
router.post('/appointments/:id/check-in', STAFF, appointments.checkIn);
router.post('/appointments/:id/complete', STAFF, appointments.complete);
router.post('/appointments/:id/no-show', STAFF, appointments.noShow);
router.get('/appointments/:id/queue-position', CITIZEN, appointments.queuePosition);
router.get('/queue', STAFF, appointments.queue);
router.post('/queue/call-next', STAFF, appointments.callNext);

// Notifications

router.get('/notifications', CITIZEN, notifications.list);
router.patch('/notifications/read-all', CITIZEN, notifications.markAllRead);
router.patch('/notifications/:id/read', CITIZEN, notifications.markRead);

// Receipts

router.get('/receipts', CITIZEN, receipts.list);
router.get('/receipts/:id', CITIZEN, receipts.get);

// Admin

router.get('/admin/users', ADMIN, admin.listUsers);
router.post('/admin/users', ADMIN, admin.createStaff);
router.patch('/admin/users/:id', ADMIN, admin.updateUser);
router.post('/admin/departments', ADMIN, admin.createDepartment);
router.get('/admin/departments/:code/scopes', ADMIN, admin.getScopes);
router.put('/admin/departments/:code/scopes', ADMIN, admin.setScopes);
router.post('/admin/services', ADMIN, admin.createService);
router.patch('/admin/services/:code', ADMIN, admin.updateService);
router.get('/audit-logs', ADMIN, audit.list);

export default router;