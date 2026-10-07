// backend/openapi.js
// OpenAPI 3 description of the API. Served as Swagger UI at /docs and raw JSON at /openapi.json.
//
// Conventions:
//   - Every error is `{ error, hint?, issues? }`.
//   - `roles` on an operation is documentation only; the router enforces it.
//   - Endpoints under `x-planned: true` are described here for stakeholders but are
//     NOT yet mounted on the router (see routes/index.js).

import {
  APPLICATION_STATUSES,
  STAFF_SETTABLE_STATUSES,
  DOCUMENT_TYPES,
  DOCUMENT_REVIEW_DECISIONS,
  IDENTITY_FIELDS,
  PAYMENT_METHODS,
  APPOINTMENT_STATUSES,
} from './constants.js';
import { SUPPORTED_LANGUAGES } from './i18n.js';

const bearer = [{ bearerAuth: [] }];

// ── tiny schema helpers ────────────────────────────────────────────────
const str  = (extra = {}) => ({ type: 'string', ...extra });
const uuid = str({ format: 'uuid' });
const int  = (extra = {}) => ({ type: 'integer', ...extra });
const num  = (extra = {}) => ({ type: 'number', ...extra });
const bool = (extra = {}) => ({ type: 'boolean', ...extra });
const date = str({ format: 'date', example: '1990-01-31' });
const dt   = str({ format: 'date-time' });

const obj = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length && { required }),
});

const arr = (items, extra = {}) => ({ type: 'array', items, ...extra });
const enumStr = (values, extra = {}) => str({ enum: values, ...extra });

const jsonBody  = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const pathParam = (name, description = '', schema = str()) => ({
  name, in: 'path', required: true, schema, description,
});
const queryParam = (name, schema = str(), description = '') => ({
  name, in: 'query', required: false, schema, description,
});

// ── reusable component schemas ─────────────────────────────────────────
const schemas = {
  Error: obj(
    {
      error: str({ example: 'Validation failed' }),
      hint:  str({ example: 'Provide a valid citizen national ID number.' }),
      issues: arr(obj({ path: str(), message: str() })),
    },
    ['error'],
  ),

  CitizenProfile: obj({
    id: uuid,
    nationalId: str({ example: '1990010100001' }),
    fullName: str(),
    dateOfBirth: date,
    citizenship: str(),
    address: str(),
    phone: str(),
    email: str({ format: 'email', nullable: true }),
    preferredLanguage: enumStr(SUPPORTED_LANGUAGES),
  }),

  Service: obj({
    id: uuid,
    code: str({ example: 'DRIVING_LICENCE' }),
    name: str(),
    feeAmount: num({ nullable: true }),
    currency: str({ example: 'LSL' }),
    processingTimeDays: int({ nullable: true }),
    requiredDocuments: arr(enumStr(DOCUMENT_TYPES)),
    department: obj({ code: str(), name: str() }),
  }),

  Department: obj({
    code: str({ example: 'TRAFFIC' }),
    name: str(),
    ministry: str({ nullable: true }),
  }),

  Application: obj({
    id: uuid,
    reference: str({ example: 'APP-1A2B3C4D' }),
    status: enumStr(APPLICATION_STATUSES),
    serviceType: obj({ code: str(), name: str() }),
    formData: { type: 'object', additionalProperties: true },
    createdAt: dt,
    updatedAt: dt,
    documents: arr(obj({
      id: uuid, type: enumStr(DOCUMENT_TYPES),
      originalName: str(), createdAt: dt,
    })),
    missingDocuments: arr(enumStr(DOCUMENT_TYPES)),
    receipts: arr(obj({
      id: uuid, receiptNumber: str(), type: str(), issuedAt: dt,
    })),
    history: arr(obj({
      fromStatus: enumStr(APPLICATION_STATUSES, { nullable: true }),
      toStatus: enumStr(APPLICATION_STATUSES),
      note: str({ nullable: true }),
      createdAt: dt,
    })),
  }),

  Appointment: obj({
    id: uuid,
    reference: str({ example: 'APT-1A2B3C4D' }),
    status: enumStr([...APPOINTMENT_STATUSES, 'NO_SHOW']),
    startsAt: dt,
    queueNumber: int({ nullable: true }),
    checkedInAt: dt({ nullable: true }),
    department: obj({ code: str(), name: str() }),
    serviceType: obj({ code: str(), name: str() }, ['code']).nullable,
  }),

  Slot: obj({
    startsAt: dt,
    available: int({ example: 2 }),
    bookable: bool,
  }),

  Document: obj({
    id: uuid,
    type: enumStr(DOCUMENT_TYPES),
    originalName: str(),
    mimeType: enumStr(['image/jpeg', 'image/png', 'application/pdf']),
    sizeBytes: int(),
    createdAt: dt,
  }),

  Notification: obj({
    id: uuid,
    type: str({ example: 'APPLICATION_STATUS' }),
    message: str(),
    readAt: dt({ nullable: true }),
    createdAt: dt,
  }),

  Receipt: obj({
    id: uuid,
    receiptNumber: str({ example: 'RCT-20261002-A1B2C3' }),
    type: enumStr(['SUBMISSION', 'PAYMENT', 'COMPLETION']),
    issuedAt: dt,
    summary: obj({
      applicationReference: str(),
      serviceCode: str(),
    }),
  }),

  QueueEntry: obj({
    id: uuid,
    queueNumber: int(),
    citizen: str(),
    checkedInAt: dt,
    reference: str(),
  }),

  QueuePosition: obj({
    status: enumStr([...APPOINTMENT_STATUSES, 'NO_SHOW']),
    queueNumber: int({ nullable: true }),
    peopleAhead: int({ nullable: true }),
    estimatedWaitMinutes: int({ nullable: true }),
  }),

  IdentityResult: obj({
    verified: bool(),
    source: str({ example: 'HOME_AFFAIRS' }),
    nationalId: str(),
    cache: enumStr(['hit', 'miss']),
    data: { type: 'object', additionalProperties: true, description: 'Only the fields released to the caller.' },
  }),

  DepartmentScopes: obj({
    department: str(),
    fields: arr(enumStr(IDENTITY_FIELDS)),
    availableFields: arr(enumStr(IDENTITY_FIELDS)),
  }),

  SafeUser: obj({
    id: uuid,
    email: str({ format: 'email' }),
    role: enumStr(['CITIZEN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']),
    active: bool(),
    createdAt: dt,
    department: obj({ code: str(), name: str() }).nullable,
  }),

  AuditLog: obj({
    id: uuid,
    actorId: uuid({ nullable: true }),
    actorRole: str({ nullable: true }),
    departmentCode: str({ nullable: true }),
    action: str({ example: 'APPLICATION_STATUS_CHANGE' }),
    resourceType: str(),
    resourceId: str({ nullable: true }),
    details: { type: 'object', additionalProperties: true, nullable: true },
    ip: str({ nullable: true }),
    createdAt: dt,
  }),

  Token: obj({
    token: str(),
    role: enumStr(['CITIZEN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']),
    department: str({ nullable: true }),
  }),

  Message: obj({ message: str() }),
};

// Reusable named responses
const ERRORS = {
  400: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  401: { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  402: { description: 'Payment could not be completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  403: { description: 'Your role is not allowed to do this', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  404: { description: 'Not found (also returned when the record belongs to someone else)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  409: { description: 'Conflicts with the current state', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  429: { description: 'Too many requests', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const okSchema = (schema, statusCode = 200, description = 'OK') => ({
  [statusCode]: { description, content: { 'application/json': { schema } } },
});

function op(tag, summary, {
  roles,
  auth = true,
  body: reqBody,
  params = [],
  query = [],
  okSchema: successSchema,
  okDesc = 'OK',
  statusCode = 200,
  errors = [400, 401, 403, 404],
  description = '',
  planned = false,
} = {}) {
  const codes = auth ? errors : errors.filter((c) => c !== 401 && c !== 403);
  return {
    tags: [tag],
    summary,
    description: [
      roles ? `**Allowed roles:** ${roles.join(', ')}.` : '',
      planned ? '> ⚠️ **Planned** — not yet mounted on the router.' : '',
      description,
    ].filter(Boolean).join('\n\n'),
    ...(auth && { security: bearer }),
    ...((params.length || query.length) && { parameters: [...params, ...query] }),
    ...(reqBody && { requestBody: reqBody }),
    ...(planned && { 'x-planned': true }),
    responses: {
      ...(successSchema ? okSchema(successSchema, statusCode, okDesc) : { [statusCode]: { description: okDesc } }),
      ...Object.fromEntries(codes.map((c) => [c, ERRORS[c]])),
    },
  };
}

const CIT   = ['CITIZEN'];
const STAFF = ['DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER'];
const DEPT  = ['DEPARTMENT_STAFF'];
const HA    = ['HOME_AFFAIRS_OFFICER'];
const ADM   = ['ADMIN'];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Government Services Platform API',
    version: '0.4.0',
    description: [
      'Home Affairs acts as the authoritative identity source; ministries retrieve only the fields they are authorised for.',
      '',
      '**Getting started**',
      '1. `POST /auth/otp/request` then `POST /auth/otp/verify` for citizens.',
      '2. `POST /auth/staff/login` for department staff and admins.',
      '3. Click **Authorize** and paste the returned `token`.',
      '',
      'Every error response is JSON: `{ error, hint?, issues? }`, where `hint` says what to do next.',
      '',
      'Operations marked **Planned** appear in this document but are not yet mounted on the router.',
    ].join('\n'),
    contact: { name: 'Platform team' },
    license: { name: 'ISC' },
  },
  servers: [
    { url: '/', description: 'Current host' },
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  tags: [
    { name: 'Health',                description: 'Liveness and API document.' },
    { name: 'Auth',                  description: 'Login, logout, and OTP.' },
    { name: 'Citizen & identity',    description: 'Profiles and identity verification.' },
    { name: 'Catalogue',             description: 'Services and departments.' },
    { name: 'Applications',          description: 'Service applications and their lifecycle.' },
    { name: 'Documents',             description: 'Upload, attach, download, and review supporting documents.' },
    { name: 'Payments',              description: 'Service fees and payment receipts.' },
    { name: 'Appointments & queue',  description: 'Bookings, check-in, and the live queue.' },
    { name: 'Notifications',         description: 'In-app messages.' },
    { name: 'Receipts',              description: 'Submission, payment, and completion receipts.' },
    { name: 'Admin',                 description: 'Users, departments, services, scopes, and audit.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `token` returned by any of the `/auth/*` endpoints.',
      },
    },
    schemas,
  },
  paths: {
    // ── Health & docs ────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'], summary: 'Liveness probe', security: [],
        responses: { 200: { description: 'Service is up', content: { 'application/json': { schema: obj({ status: str({ example: 'ok' }) }) } } } },
      },
    },
    '/openapi.json': {
      get: { tags: ['Health'], summary: 'Raw OpenAPI document', security: [], responses: { 200: { description: 'This document' } } },
    },

    // ── Auth ─────────────────────────────────────────────────────────
    '/auth/otp/request': {
      post: op('Auth', 'Request a one-time code (citizens)', {
        auth: false,
        body: jsonBody(obj({ nationalId: str({ example: '1990010100001' }) }, ['nationalId'])),
        okSchema: obj({
          message: str({ example: 'If this ID is registered, a one-time code has been sent.' }),
          devOtp: str({ description: 'Returned only outside production or when DEMO_MODE=true.', nullable: true }),
        }),
        errors: [400, 429],
        description: 'Always returns the same message regardless of whether the ID exists, to prevent enumeration.',
      }),
    },
    '/auth/otp/verify': {
      post: op('Auth', 'Exchange the code for a token (citizens)', {
        auth: false,
        body: jsonBody(obj({ nationalId: str(), code: str({ pattern: '^\\d{6}$' }) }, ['nationalId', 'code'])),
        okSchema: ref('Token'),
        errors: [400, 401, 429],
      }),
    },
    '/auth/staff/login': {
      post: op('Auth', 'Staff / admin login', {
        auth: false,
        body: jsonBody(obj({ email: str({ format: 'email' }), password: str({ minLength: 10 }) }, ['email', 'password'])),
        okSchema: ref('Token'),
        errors: [400, 401],
      }),
    },
    '/auth/logout': {
      post: op('Auth', 'Log out', {
        okSchema: ref('Message'),
        errors: [401],
        description: 'Revokes the bearer token via its JTI, so it stops working immediately.',
      }),
    },
    '/auth/register': {
      post: op('Auth', 'Register a citizen (password login)', {
        auth: false,
        planned: true,
        body: jsonBody(obj({
          nationalIdNumber: str(), firstName: str(), lastName: str(),
          email: str({ format: 'email' }), phoneNumber: str(), password: str({ minLength: 10 }),
        }, ['nationalIdNumber', 'firstName', 'lastName', 'password'])),
        okSchema: ref('Token'),
        errors: [400],
        description: 'Registered in `routes/auth.js` but that router is not mounted. Needs to be ported to `services/authService.js` before it is usable.',
      }),
    },
    '/auth/login': {
      post: op('Auth', 'Citizen password login', {
        auth: false, planned: true,
        body: jsonBody(obj({ nationalIdNumber: str(), password: str() }, ['nationalIdNumber', 'password'])),
        okSchema: ref('Token'),
        errors: [400, 401],
        description: 'Same caveat as `/auth/register`.',
      }),
    },

    // ── Citizen & identity ───────────────────────────────────────────
    '/me': {
      get: op('Citizen & identity', 'Own profile', { roles: CIT, okSchema: ref('CitizenProfile') }),
      patch: op('Citizen & identity', 'Update how you are contacted', {
        roles: CIT,
        body: body(obj({
          email: str({ format: 'email', nullable: true }),
          preferredLanguage: enumStr(SUPPORTED_LANGUAGES),
        })),
        okSchema: ref('CitizenProfile'),
        errors: [400, 401, 403],
        description: 'Name, address and phone are Home Affairs records; ask an officer to change those.',
      }),
    },
    '/citizens': {
      post: op('Citizen & identity', 'Register a citizen', {
        roles: HA,
        body: body(obj({
          nationalId: str(), fullName: str(), dateOfBirth: date,
          citizenship: str(), address: str(), phone: str(),
          email: str({ format: 'email' }),
          preferredLanguage: enumStr(SUPPORTED_LANGUAGES),
        }, ['nationalId', 'fullName', 'dateOfBirth', 'citizenship', 'phone'])),
        okSchema: ref('CitizenProfile'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 403, 409],
        description: 'Creates the login account and the identity record together.',
      }),
    },
    '/citizens/{nationalId}': {
      patch: op('Citizen & identity', 'Update a citizen record', {
        roles: HA,
        params: [pathParam('nationalId')],
        body: body(obj({ fullName: str(), address: str(), phone: str() })),
        okSchema: obj({ message: str(), fieldsChanged: arr(str()) }),
        description: 'Clears the cached copy of the identity record so the next verification reads fresh data.',
      }),
    },
    '/identity/verify': {
      post: op('Citizen & identity', 'Verify a citizen with Home Affairs', {
        roles: STAFF,
        body: body(obj({
          applicationId: uuid,
          nationalId: str(),
          reason: str({ minLength: 5, maxLength: 200 }),
        })),
        okSchema: ref('IdentityResult'),
        description: [
          'Department staff send `applicationId` (it must belong to their department).',
          `Home Affairs officers send \`nationalId\` and a \`reason\`. Possible fields: ${IDENTITY_FIELDS.join(', ')}.`,
          'Only the caller\'s permitted fields are returned; `cache` shows whether the answer came from Redis.',
        ].join('\n\n'),
      }),
    },

    // ── Catalogue ────────────────────────────────────────────────────
    '/services': {
      get: op('Catalogue', 'Service catalogue with required documents and fees', {
        auth: false, okSchema: arr(ref('Service')), errors: [],
      }),
    },
    '/departments': {
      get: op('Catalogue', 'Departments', {
        auth: false, okSchema: arr(ref('Department')), errors: [],
      }),
    },

    // ── Applications ─────────────────────────────────────────────────
    '/applications': {
      post: op('Applications', 'Submit an application', {
        roles: CIT,
        body: body(obj({
          serviceCode: str({ example: 'DRIVING_LICENCE' }),
          formData: { type: 'object', additionalProperties: true },
          documentIds: arr(uuid, { maxItems: 10 }),
        }, ['serviceCode'])),
        okSchema: obj({
          id: uuid,
          reference: str(),
          status: enumStr(APPLICATION_STATUSES),
          receiptNumber: str(),
          missingDocuments: arr(enumStr(DOCUMENT_TYPES)),
        }),
        statusCode: 201, okDesc: 'Created',
        description: 'Pass `documentIds` to reuse already-uploaded documents.',
      }),
      get: op('Applications', 'List applications', {
        query: [
          queryParam('status', enumStr(APPLICATION_STATUSES)),
          queryParam('assigned', enumStr(['me', 'unassigned']), 'Department staff only (planned)'),
          queryParam('reference', str(), 'Partial match, e.g. APP-1A2B'),
          queryParam('limit', int({ default: 100, maximum: 200 })),
          queryParam('offset', int({ default: 0 })),
        ],
        okSchema: arr(ref('Application')),
        description: 'Citizens see their own, department staff see their department queue, admins see all.',
      }),
    },
    '/applications/{id}': {
      get: op('Applications', 'Application detail, status history and outstanding items', {
        params: [pathParam('id', 'Application id', uuid)],
        okSchema: ref('Application'),
      }),
    },
    '/applications/{id}/status': {
      patch: op('Applications', 'Move an application through review', {
        roles: DEPT,
        params: [pathParam('id', 'Application id', uuid)],
        body: body(obj({
          status: enumStr(STAFF_SETTABLE_STATUSES),
          note: str({ maxLength: 500 }),
        }, ['status'])),
        okSchema: obj({ id: uuid, status: enumStr(APPLICATION_STATUSES), receiptNumber: str({ nullable: true }) }),
        errors: [400, 401, 403, 404, 409],
        description: [
          'Allowed transitions: SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / MORE_INFO_NEEDED.',
          'A note is required for REJECTED and MORE_INFO_NEEDED.',
          'UNDER_REVIEW requires the fee to be paid; APPROVED requires every required document to be verified, and issues a completion receipt.',
        ].join(' '),
      }),
    },
    '/applications/{id}/respond': {
      post: op('Applications', 'Answer a "more info needed" request', {
        roles: CIT,
        params: [pathParam('id', 'Application id', uuid)],
        body: body(obj({
          formData: { type: 'object', additionalProperties: true },
          note: str({ maxLength: 500 }),
        })),
        okSchema: obj({ id: uuid, status: enumStr(APPLICATION_STATUSES) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/applications/{id}/withdraw': {
      post: op('Applications', 'Withdraw an undecided application', {
        roles: CIT, planned: true,
        params: [pathParam('id', 'Application id', uuid)],
        body: body(obj({ note: str({ maxLength: 500 }) })),
        okSchema: obj({ id: uuid, status: enumStr(['WITHDRAWN']) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/applications/{id}/assign': {
      post: op('Applications', 'Claim or release an application', {
        roles: DEPT, planned: true,
        params: [pathParam('id', 'Application id', uuid)],
        body: body(obj({ assign: bool({ default: true }) })),
        okSchema: obj({ id: uuid, assignedTo: uuid({ nullable: true }) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/applications/{id}/pay': {
      post: op('Payments', 'Pay the service fee', {
        roles: CIT, planned: true,
        params: [pathParam('id', 'Application id', uuid)],
        body: body(obj({ method: enumStr(PAYMENT_METHODS) }, ['method'])),
        okSchema: ref('Receipt'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 402, 403, 404, 409],
        description: 'Uses a stand-in payment gateway until a real provider is connected.',
      }),
    },
    '/applications/{id}/documents/{documentId}': {
      post: op('Documents', 'Attach an existing document to an application', {
        roles: CIT,
        params: [pathParam('id', 'Application id', uuid), pathParam('documentId', 'Document id', uuid)],
        okSchema: obj({ applicationId: uuid, documentId: uuid, attached: bool() }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/applications/{id}/documents/{documentId}/review': {
      post: op('Documents', 'Verify or reject an attached document', {
        roles: DEPT, planned: true,
        params: [pathParam('id', 'Application id', uuid), pathParam('documentId', 'Document id', uuid)],
        body: body(obj({
          decision: enumStr(DOCUMENT_REVIEW_DECISIONS),
          note: str({ maxLength: 500 }),
        }, ['decision'])),
        okSchema: obj({ id: uuid, decision: enumStr(DOCUMENT_REVIEW_DECISIONS) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },

    // ── Payments ─────────────────────────────────────────────────────
    '/payments': {
      get: op('Payments', 'My payments', {
        roles: CIT, planned: true,
        okSchema: arr(ref('Receipt')),
        errors: [401, 403],
      }),
    },

    // ── Documents ────────────────────────────────────────────────────
    '/documents': {
      post: op('Documents', 'Upload a document (PDF, JPEG or PNG, max 5 MB)', {
        roles: CIT,
        body: {
          required: true,
          content: { 'multipart/form-data': { schema: obj({
            file: str({ format: 'binary' }),
            type: enumStr(DOCUMENT_TYPES),
            applicationId: uuid,
          }, ['file', 'type']) } },
        },
        okSchema: ref('Document'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 403, 404, 409, 413],
        description: 'The file\'s magic bytes are checked, not just the declared MIME type.',
      }),
      get: op('Documents', 'List my documents', { roles: CIT, okSchema: arr(ref('Document')) }),
    },
    '/documents/{id}': {
      delete: op('Documents', 'Delete a document that is not attached to any application', {
        roles: CIT,
        params: [pathParam('id', 'Document id', uuid)],
        okSchema: obj({ id: uuid, deleted: bool() }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/documents/{id}/download': {
      get: op('Documents', 'Download a document', {
        roles: ['CITIZEN (owner)', 'DEPARTMENT_STAFF (only if attached to an application of their department; audited)'],
        params: [pathParam('id', 'Document id', uuid)],
        okDesc: 'Raw file bytes',
        errors: [400, 401, 403, 404],
      }),
    },

    // ── Appointments & queue ─────────────────────────────────────────
    '/appointments/slots': {
      get: op('Appointments & queue', 'Available slots for a department and date', {
        query: [
          queryParam('departmentCode', str({ example: 'TRAFFIC' })),
          queryParam('date', str({ example: '2026-10-12' }), 'YYYY-MM-DD, weekdays only'),
        ],
        okSchema: obj({
          department: str(),
          date: date,
          slotMinutes: int({ example: 30 }),
          slots: arr(ref('Slot')),
        }),
        errors: [400, 401, 404],
      }),
    },
    '/appointments': {
      post: op('Appointments & queue', 'Book an appointment', {
        roles: CIT,
        body: body(obj({
          departmentCode: str(),
          serviceCode: str(),
          startsAt: dt,
        }, ['departmentCode', 'startsAt'])),
        okSchema: obj({
          id: uuid, reference: str(), department: str(), startsAt: dt,
          status: enumStr([...APPOINTMENT_STATUSES, 'NO_SHOW']),
        }),
        statusCode: 201, okDesc: 'Created',
        description: '`startsAt` must match a slot from `/appointments/slots`.',
        errors: [400, 401, 403, 404, 409],
      }),
      get: op('Appointments & queue', 'List appointments', {
        query: [
          queryParam('date', date),
          queryParam('status', enumStr([...APPOINTMENT_STATUSES, 'NO_SHOW'])),
        ],
        okSchema: arr(ref('Appointment')),
        errors: [400, 401, 403],
      }),
    },
    '/appointments/{id}/cancel': {
      post: op('Appointments & queue', 'Cancel an appointment', {
        params: [pathParam('id', 'Appointment id', uuid)],
        okSchema: obj({ id: uuid, status: enumStr(['CANCELLED']) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/appointments/{id}/check-in': {
      post: op('Appointments & queue', 'Check a citizen in and assign a queue number', {
        roles: STAFF,
        params: [pathParam('id', 'Appointment id', uuid)],
        okSchema: obj({ id: uuid, status: enumStr(['CHECKED_IN']), queueNumber: int() }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/appointments/{id}/complete': {
      post: op('Appointments & queue', 'Mark a checked-in appointment as completed', {
        roles: STAFF,
        params: [pathParam('id', 'Appointment id', uuid)],
        okSchema: obj({ id: uuid, status: enumStr(['COMPLETED']) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/appointments/{id}/no-show': {
      post: op('Appointments & queue', 'Mark an appointment as no-show', {
        roles: STAFF,
        params: [pathParam('id', 'Appointment id', uuid)],
        okSchema: obj({ id: uuid, status: enumStr(['NO_SHOW']) }),
        errors: [400, 401, 403, 404, 409],
      }),
    },
    '/appointments/{id}/queue-position': {
      get: op('Appointments & queue', 'My place in the queue, who is being served, and estimated wait', {
        roles: CIT,
        params: [pathParam('id', 'Appointment id', uuid)],
        okSchema: ref('QueuePosition'),
        errors: [400, 401, 403, 404],
      }),
    },
    '/queue': {
      get: op('Appointments & queue', "Today's line for my department", {
        roles: STAFF,
        query: [queryParam('date', date)],
        okSchema: obj({ date: date, waiting: arr(ref('QueueEntry')) }),
        errors: [400, 401, 403],
      }),
    },
    '/queue/call-next': {
      post: op('Appointments & queue', 'Call the next person in line', {
        roles: STAFF, planned: true,
        body: body(obj({ date: date })),
        okSchema: obj({ called: ref('QueueEntry'), next: ref('QueueEntry').nullable }),
        errors: [400, 401, 403, 404],
      }),
    },

    // ── Notifications ────────────────────────────────────────────────
    '/notifications': {
      get: op('Notifications', 'In-app notifications', {
        roles: CIT,
        query: [queryParam('unread', enumStr(['true', 'false']))],
        okSchema: obj({ unreadCount: int(), items: arr(ref('Notification')) }),
        errors: [400, 401, 403],
      }),
    },
    '/notifications/read-all': {
      patch: op('Notifications', 'Mark every notification as read', {
        roles: CIT, planned: true,
        okSchema: obj({ updated: int() }),
        errors: [401, 403],
      }),
    },
    '/notifications/{id}/read': {
      patch: op('Notifications', 'Mark a notification as read', {
        roles: CIT,
        params: [pathParam('id', 'Notification id', uuid)],
        okSchema: obj({ id: uuid, read: bool() }),
        errors: [400, 401, 403, 404],
      }),
    },

    // ── Receipts ─────────────────────────────────────────────────────
    '/receipts': {
      get: op('Receipts', 'My receipts', { roles: CIT, okSchema: arr(ref('Receipt')) }),
    },
    '/receipts/{id}': {
      get: op('Receipts', 'Receipt detail', {
        roles: CIT,
        params: [pathParam('id', 'Receipt id', uuid)],
        okSchema: ref('Receipt'),
        errors: [400, 401, 403, 404],
      }),
    },
    '/receipts/verify/{receiptNumber}': {
      get: op('Receipts', 'Verify a receipt is genuine (public)', {
        auth: false,
        params: [pathParam('receiptNumber', 'e.g. RCT-20261002-A1B2C3',
          str({ pattern: '^RCT-\\d{8}-[0-9A-F]{6}$' }))],
        okSchema: obj({
          valid: bool(),
          receiptNumber: str(), type: str(),
          serviceName: str(), issuedAt: dt,
        }),
        errors: [404],
        description: 'Returns only whether the receipt is valid and the service it covers. No personal data.',
      }),
    },

    // Admin 
    '/admin/users': {
      get: op('Admin', 'List users', {
        roles: ADM,
        query: [
          queryParam('role', enumStr(['CITIZEN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN'])),
          queryParam('departmentCode', str()),
        ],
        okSchema: arr(ref('SafeUser')),
        errors: [400, 401, 403],
      }),
      post: op('Admin', 'Create a staff account', {
        roles: ADM,
        body: body(obj({
          email: str({ format: 'email' }),
          password: str({ minLength: 10 }),
          role: enumStr(['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']),
          departmentCode: str(),
        }, ['email', 'password', 'role'])),
        okSchema: ref('SafeUser'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 403, 409],
      }),
    },
    '/admin/users/{id}': {
      patch: op('Admin', 'Deactivate a user or change role / department / password', {
        roles: ADM,
        params: [pathParam('id', 'User id', uuid)],
        body: body(obj({
          active: bool(),
          role: enumStr(['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']),
          departmentCode: str({ nullable: true }),
          password: str({ minLength: 10 }),
        })),
        okSchema: ref('SafeUser'),
        errors: [400, 401, 403, 404],
      }),
    },
    '/admin/departments': {
      post: op('Admin', 'Create a department', {
        roles: ADM, planned: true,
        body: body(obj({ code: str({ example: 'LABOUR' }), name: str(), ministry: str() }, ['code', 'name'])),
        okSchema: ref('Department'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 403, 409],
      }),
    },
    '/admin/departments/{code}/scopes': {
      get: op('Admin', 'Identity fields a department may receive', {
        roles: ADM,
        params: [pathParam('code', 'Department code', str({ example: 'TRAFFIC' }))],
        okSchema: ref('DepartmentScopes'),
        errors: [401, 403, 404],
      }),
      put: op('Admin', 'Replace the identity fields a department may receive', {
        roles: ADM,
        params: [pathParam('code', 'Department code')],
        body: body(obj({ fields: arr(enumStr(IDENTITY_FIELDS), { minItems: 1 }) }, ['fields'])),
        okSchema: ref('DepartmentScopes'),
        errors: [400, 401, 403, 404],
      }),
    },
    '/admin/services': {
      post: op('Admin', 'Create a service', {
        roles: ADM, planned: true,
        body: body(obj({
          code: str(), name: str(), departmentCode: str(),
          requiredDocuments: arr(enumStr(DOCUMENT_TYPES)),
          feeAmount: num({ nullable: true }),
          currency: str({ example: 'LSL' }),
          processingTimeDays: int({ nullable: true }),
        }, ['code', 'name', 'departmentCode'])),
        okSchema: ref('Service'),
        statusCode: 201, okDesc: 'Created',
        errors: [400, 401, 403, 409],
      }),
    },
    '/admin/services/{code}': {
      patch: op('Admin', 'Update a service (name, documents, fee, processing time)', {
        roles: ADM, planned: true,
        params: [pathParam('code', 'Service code')],
        body: body(obj({
          name: str(),
          requiredDocuments: arr(enumStr(DOCUMENT_TYPES)),
          feeAmount: num({ nullable: true }),
          currency: str(),
          processingTimeDays: int({ nullable: true }),
        })),
        okSchema: ref('Service'),
        errors: [400, 401, 403, 404],
      }),
    },
    '/audit-logs': {
      get: op('Admin', 'Audit trail (read-only)', {
        roles: ADM,
        query: [
          queryParam('action', str()),
          queryParam('actorId', uuid),
          queryParam('resourceType', str()),
          queryParam('resourceId', str()),
          queryParam('from', dt),
          queryParam('to', dt),
          queryParam('limit', int({ default: 100, maximum: 500 })),
          queryParam('offset', int({ default: 0 })),
        ],
        okSchema: arr(ref('AuditLog')),
        errors: [400, 401, 403],
        description: 'Newest first. `X-Total-Count` holds the total matching rows.',
      }),
    },
  },
};