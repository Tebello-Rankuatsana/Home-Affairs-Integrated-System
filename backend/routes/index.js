import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.js';
import { authLimiter, publicLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import * as auth from '../controllers/authController.js';
import * as citizens from '../controllers/citizenController.js';
import * as identity from '../controllers/identityController.js';
import * as catalog from '../controllers/catalogController.js';
import * as applications from '../controllers/applicationController.js';
import * as documents from '../controllers/documentController.js';
import * as appointments from '../controllers/appointmentController.js';
import * as notifications from '../controllers/notificationController.js';
import * as receipts from '../controllers/receiptController.js';
import * as admin from '../controllers/adminController.js';
import * as audit from '../controllers/auditController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.upload.maxBytes, files: 1 } });

const CITIZEN = requireRole('CITIZEN');
const STAFF = requireRole('DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER');
const DEPT_STAFF = requireRole('DEPARTMENT_STAFF');
const HOME_AFFAIRS = requireRole('HOME_AFFAIRS_OFFICER');
const ADMIN = requireRole('ADMIN');

const router = Router();


router.post('/auth/otp/request', authLimiter, auth.requestOtp);
router.post('/auth/otp/verify', authLimiter, auth.verifyOtp);
router.post('/auth/staff/login', authLimiter, auth.staffLogin);


router.get('/receipts/verify/:receiptNumber', publicLimiter, receipts.verify);


router.use(authenticate);

// logout (authenticated)
router.post('/auth/logout', auth.logout);

// catalog and departments (public)
router.get('/services', catalog.services);
router.get('/departments', catalog.departments);

// citizen and identity
router.get('/me', CITIZEN, citizens.me);
router.patch('/citizens/:nationalId', HOME_AFFAIRS, citizens.update);
router.post('/identity/verify', STAFF, identity.verify);

// applications
router.post('/applications', CITIZEN, applications.submit);
router.get('/applications', applications.list);
router.get('/applications/:id', applications.get);
router.patch('/applications/:id/status', DEPT_STAFF, applications.changeStatus);
router.post('/applications/:id/respond', CITIZEN, applications.respond);
router.post('/applications/:id/documents/:documentId', CITIZEN, documents.attach);

// documents
router.post('/documents', CITIZEN, upload.single('file'), documents.upload);
router.get('/documents', CITIZEN, documents.list);
router.get('/documents/:id/download', requireRole('CITIZEN', 'DEPARTMENT_STAFF'), documents.download);
router.delete('/documents/:id', CITIZEN, documents.remove);

// queuing and appointments
router.get('/appointments/slots', appointments.slots);
router.post('/appointments', CITIZEN, appointments.book);
router.get('/appointments', requireRole('CITIZEN', 'DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER', 'ADMIN'), appointments.list);
router.post('/appointments/:id/cancel', requireRole('CITIZEN', 'DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER'), appointments.cancel);
router.post('/appointments/:id/check-in', STAFF, appointments.checkIn);
router.post('/appointments/:id/complete', STAFF, appointments.complete);
router.post('/appointments/:id/no-show', STAFF, appointments.noShow);
router.get('/appointments/:id/queue-position', CITIZEN, appointments.queuePosition);
router.get('/queue', STAFF, appointments.queue);

// notifications and receipts
router.get('/notifications', CITIZEN, notifications.list);
router.patch('/notifications/:id/read', CITIZEN, notifications.markRead);
router.get('/receipts', CITIZEN, receipts.list);
router.get('/receipts/:id', CITIZEN, receipts.get);

// admin
router.get('/admin/users', ADMIN, admin.listUsers);
router.post('/admin/users', ADMIN, admin.createStaff);
router.patch('/admin/users/:id', ADMIN, admin.updateUser);
router.get('/admin/departments/:code/scopes', ADMIN, admin.getScopes);
router.put('/admin/departments/:code/scopes', ADMIN, admin.setScopes);
router.get('/audit-logs', ADMIN, audit.list);

export default router;