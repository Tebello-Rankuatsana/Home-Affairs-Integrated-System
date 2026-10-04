export const HOME_AFFAIRS = 'HOME_AFFAIRS';

export const IDENTITY_FIELDS = ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'];

export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_NEEDED', 'APPROVED', 'REJECTED'];

// Staff-driven transitions (MORE_INFO_NEEDED -> UNDER_REVIEW happens when the citizen responds)
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

// Home Affairs officers and department staff both belong to a department
export const STAFF_ROLES = ['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF'];
export const isStaff = (user) => STAFF_ROLES.includes(user.role);

// Appointments that occupy a slot
export const ACTIVE_APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN', 'COMPLETED'];
