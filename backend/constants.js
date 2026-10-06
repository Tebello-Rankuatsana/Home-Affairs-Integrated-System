export const HOME_AFFAIRS = 'HOME_AFFAIRS';

export const IDENTITY_FIELDS = ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'];

export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_NEEDED', 'APPROVED', 'REJECTED'];

// Application statuses that department staff can manually change/set
export const STAFF_SETTABLE_STATUSES = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFO_NEEDED'];

// Staff-driven transitions
export const STATUS_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'MORE_INFO_NEEDED'],
  MORE_INFO_NEEDED: [],
  APPROVED: [],
  REJECTED: [],
};

export const DOCUMENT_TYPES = [
  'NATIONAL_ID',
  'BIRTH_CERTIFICATE',
  'PROOF_OF_RESIDENCE',
  'PHOTO',
  'PROOF_OF_INCOME',
  'OTHER',
];

// Document review decisions
export const DOCUMENT_REVIEW_DECISIONS = ['APPROVED', 'REJECTED', 'NEEDS_RESUBMISSION'];

// Payment methods supported across the system
export const PAYMENT_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'MPESA', 'ECO-CASH'];

// Staff roles
export const STAFF_ROLES = ['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF'];
export const isStaff = (user) => STAFF_ROLES.includes(user.role);

// Appointment statuses
export const APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'];
export const ACTIVE_APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN', 'COMPLETED'];