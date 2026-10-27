// constants.js

export const HOME_AFFAIRS = 'HOME_AFFAIRS';
export const CITIZEN_ROLE = 'CITIZEN';
export const ADMIN_ROLE = 'ADMIN';

export const IDENTITY_FIELDS = ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'];

export const APPLICATION_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'MORE_INFO_NEEDED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
];

export const STAFF_SETTABLE_STATUSES = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFO_NEEDED'];

export const STATUS_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'MORE_INFO_NEEDED', 'WITHDRAWN'],
  MORE_INFO_NEEDED: ['UNDER_REVIEW', 'WITHDRAWN'],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const TERMINAL_APPLICATION_STATUSES = ['APPROVED', 'REJECTED', 'WITHDRAWN'];

export const DOCUMENT_TYPES = [
  'NATIONAL_ID',
  'BIRTH_CERTIFICATE',
  'PROOF_OF_RESIDENCE',
  'PHOTO',
  'PROOF_OF_INCOME',
  'OTHER',
];

export const DOCUMENT_REVIEW_DECISIONS = ['APPROVED', 'REJECTED', 'NEEDS_RESUBMISSION'];

export const PAYMENT_METHODS = [
  'CREDIT_CARD',
  'DEBIT_CARD',
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'CASH',
  'MPESA',
  'ECO-CASH',
];

export const RECEIPT_TYPES = ['SUBMISSION', 'PAYMENT', 'COMPLETION'];

export const STAFF_ROLES = ['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF'];
export const isStaff = (user) => Boolean(user) && STAFF_ROLES.includes(user.role);

export const APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
export const ACTIVE_APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN'];

// --- NEW: self-registration & temporary IDs ---

// The citizen status values used by the frontend's eligibility filter.
export const CITIZEN_STATUS = {
  ACTIVE: 'ACTIVE',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  DISABLED: 'DISABLED',
};

// Services a temporary-ID holder can apply for. Must match core.jsx SELF_SERVICE.
export const SELF_SERVICE_CODES = ['ID_APPLICATION', 'BIRTH_CERTIFICATE'];

// How long a temporary ID stays valid.
export const TEMPORARY_ID_TTL_DAYS = 20;

// Service access levels.
export const SERVICE_ACCESS_LEVELS = {
  ANY_ID: 'ANY_ID',
  FULL_ID: 'FULL_ID',
  STAFF_ONLY: 'STAFF_ONLY',
};

// Credential types stored in authentication_credentials.
export const CREDENTIAL_TYPES = {
  PASSWORD: 'PASSWORD',
  OTP: 'OTP',
  RECOVERY_TOKEN: 'RECOVERY_TOKEN',
};