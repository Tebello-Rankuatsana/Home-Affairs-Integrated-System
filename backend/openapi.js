// OpenAPI 3 description of the API, served as Swagger UI at /docs and raw JSON at /openapi.json.
// Other ministries can use this to see exactly how to integrate.
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
const str = (extra = {}) => ({ type: 'string', ...extra });
const uuid = str({ format: 'uuid' });
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length && { required }) });
const jsonBody = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const pathParam = (name, description = '') => ({ name, in: 'path', required: true, schema: str(), description });
const queryParam = (name, schema = str(), description = '') => ({ name, in: 'query', required: false, schema, description });

const ERRORS = {
  400: { description: 'Validation failed' },
  401: { description: 'Missing or invalid token' },
  402: { description: 'Payment could not be completed' },
  403: { description: 'Your role is not allowed to do this' },
  404: { description: 'Not found (also returned when the record belongs to someone else)' },
  409: { description: 'Conflicts with the current state' },
};

function op(tag, summary, { roles, auth = true, body, params = [], query = [], ok = 'OK', errors = [400, 401, 403, 404], description = '' } = {}) {
  const codes = auth ? errors : errors.filter((c) => c !== 401 && c !== 403);
  return {
    tags: [tag],
    summary,
    description: [roles ? `**Allowed roles:** ${roles.join(', ')}.` : '', description].filter(Boolean).join('\n\n'),
    ...(auth && { security: bearer }),
    ...((params.length || query.length) && { parameters: [...params, ...query] }),
    ...(body && { requestBody: body }),
    responses: { 200: { description: ok }, ...Object.fromEntries(codes.map((c) => [c, ERRORS[c]])) },
  };
}

const created = (o) => ({ ...o, responses: { 201: { description: 'Created' }, ...Object.fromEntries(Object.entries(o.responses).filter(([c]) => c !== '200')) } });

const CIT = ['CITIZEN'];
const STAFF = ['DEPARTMENT_STAFF', 'HOME_AFFAIRS_OFFICER'];
const DEPT = ['DEPARTMENT_STAFF'];
const ADM = ['ADMIN'];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Government Services Platform API',
    version: '0.3.0',
    description:
      'Home Affairs acts as the authoritative identity source; ministries retrieve only the fields they are authorised for. ' +
      'Log in via /auth/*, then click **Authorize** and paste the token. ' +
      'Every error response is JSON: `{ error, hint, issues? }`, where `hint` says what to do next.',
  },
  servers: [{ url: '/' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  tags: [
    { name: 'Auth' }, { name: 'Citizen & identity' }, { name: 'Catalogue' }, { name: 'Applications' },
    { name: 'Documents' }, { name: 'Payments' }, { name: 'Appointments & queue' }, { name: 'Notifications' },
    { name: 'Receipts' }, { name: 'Admin' },
  ],
  paths: {
    '/auth/otp/request': { post: op('Auth', 'Request a one-time code (citizens)', { auth: false, body: jsonBody(obj({ nationalId: str() }, ['nationalId'])), description: 'Always returns the same message. Outside production the code is included as `devOtp`.', errors: [400, 429] }) },
    '/auth/otp/verify': { post: op('Auth', 'Exchange the code for a token (citizens)', { auth: false, body: jsonBody(obj({ nationalId: str(), code: str({ example: '123456' }) }, ['nationalId', 'code'])), errors: [400, 401, 429] }) },
    '/auth/staff/login': { post: op('Auth', 'Staff / admin login', { auth: false, body: jsonBody(obj({ email: str({ format: 'email' }), password: str() }, ['email', 'password'])), errors: [400, 401] }) },
    '/auth/logout': { post: op('Auth', 'Log out', { description: 'Revokes the token you sent, so it stops working immediately even though it has not expired.', errors: [401] }) },

    '/me': {
      get: op('Citizen & identity', 'Own profile (use it to prefill forms)', { roles: CIT }),
      patch: op('Citizen & identity', 'Update how you are contacted', {
        roles: CIT,
        body: jsonBody(obj({ email: str({ format: 'email', nullable: true }), preferredLanguage: str({ enum: SUPPORTED_LANGUAGES }) })),
        description: 'Name, address and phone are Home Affairs records and are changed by an officer, not here.',
        errors: [400, 401, 403],
      }),
    },
    '/citizens': {
      post: created(op('Citizen & identity', 'Register a citizen', {
        roles: ['HOME_AFFAIRS_OFFICER'],
        body: jsonBody(obj({ nationalId: str(), fullName: str(), dateOfBirth: str({ example: '1990-01-31' }), citizenship: str(), address: str(), phone: str(), email: str({ format: 'email' }), preferredLanguage: str({ enum: SUPPORTED_LANGUAGES }) }, ['nationalId', 'fullName', 'dateOfBirth', 'citizenship', 'phone'])),
        description: 'Creates the login account and the identity record together. The citizen can then log in with a one-time code.',
        errors: [400, 401, 403, 409],
      })),
    },
    '/citizens/{nationalId}': { patch: op('Citizen & identity', 'Update a citizen record', { roles: ['HOME_AFFAIRS_OFFICER'], params: [pathParam('nationalId')], body: jsonBody(obj({ fullName: str(), address: str(), phone: str() })), description: 'Clears the cached copy of the identity record.' }) },
    '/identity/verify': { post: op('Citizen & identity', 'Verify a citizen with Home Affairs', {
      roles: STAFF,
      body: jsonBody(obj({ applicationId: uuid, nationalId: str(), reason: str({ minLength: 5, maxLength: 200 }) })),
      description: `Department staff send \`applicationId\` (must belong to their department). Home Affairs officers send \`nationalId\` and a \`reason\`, which is recorded in the audit log. Only the caller's permitted fields are returned (possible fields: ${IDENTITY_FIELDS.join(', ')}). \`cache\` shows whether the answer came from the cache.`,
    }) },

    '/services': { get: op('Catalogue', 'Service catalogue with required documents and fees', { errors: [401] }) },
    '/departments': { get: op('Catalogue', 'Departments', { errors: [401] }) },

    '/applications': {
      post: created(op('Applications', 'Submit an application', { roles: CIT, body: jsonBody(obj({ serviceCode: str({ example: 'DRIVING_LICENCE' }), formData: obj({}), documentIds: { type: 'array', items: uuid } }, ['serviceCode'])), description: 'Pass `documentIds` to reuse documents already uploaded. The response lists `missingDocuments`, whether a fee is due (`payment`), and the submission receipt number.', errors: [400, 401, 403, 404] })),
      get: op('Applications', 'List applications', {
        query: [
          queryParam('status', str({ enum: APPLICATION_STATUSES })),
          queryParam('assigned', str({ enum: ['me', 'unassigned'] }), 'Department staff only'),
          queryParam('reference', str(), 'Part of an application reference, e.g. APP-1A2B'),
          queryParam('limit', { type: 'integer', default: 100, maximum: 200 }),
          queryParam('offset', { type: 'integer', default: 0 }),
        ],
        description: 'Citizens see their own, department staff see their department queue, admins see all.',
        errors: [400, 401],
      }),
    },
    '/applications/{id}': { get: op('Applications', 'Application detail, status history and what is outstanding', { params: [pathParam('id')], description: 'Includes `missingDocuments`, `unverifiedDocuments` and `payment` (fee required / paid).', errors: [400, 401, 404] }) },
    '/applications/{id}/status': { patch: op('Applications', 'Move an application through review', { roles: DEPT, params: [pathParam('id')], body: jsonBody(obj({ status: str({ enum: STAFF_SETTABLE_STATUSES }), note: str() }, ['status'])), description: 'SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / MORE_INFO_NEEDED. A note is required for REJECTED and MORE_INFO_NEEDED. UNDER_REVIEW requires the fee to be paid. APPROVED requires every required document to be attached and verified, and issues a completion receipt. Deciding an application assigns it to you.', errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/assign': { post: op('Applications', 'Claim or release an application', { roles: DEPT, params: [pathParam('id')], body: jsonBody(obj({ assign: { type: 'boolean', default: true } })), description: '`assign: true` claims it, `assign: false` releases one you hold. Only the assignee can decide or review documents on an assigned application.', errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/respond': { post: op('Applications', 'Answer a "more info needed" request', { roles: CIT, params: [pathParam('id')], body: jsonBody(obj({ formData: obj({}), note: str() })), errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/withdraw': { post: op('Applications', 'Withdraw an undecided application', { roles: CIT, params: [pathParam('id')], body: jsonBody(obj({ note: str() })), errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/pay': { post: created(op('Payments', 'Pay the service fee', { roles: CIT, params: [pathParam('id')], body: jsonBody(obj({ method: str({ enum: PAYMENT_METHODS }) }, ['method'])), description: 'Issues a payment receipt. Uses a stand-in payment gateway until a real provider is connected.', errors: [400, 401, 402, 403, 404, 409] })) },
    '/applications/{id}/documents/{documentId}': { post: op('Documents', 'Attach an existing document to an application', { roles: CIT, params: [pathParam('id'), pathParam('documentId')], errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/documents/{documentId}/review': { post: op('Documents', 'Verify or reject an attached document', { roles: DEPT, params: [pathParam('id'), pathParam('documentId')], body: jsonBody(obj({ decision: str({ enum: DOCUMENT_REVIEW_DECISIONS }), note: str() }, ['decision'])), description: 'A note is required to reject. The citizen is notified either way.', errors: [400, 401, 403, 404, 409] }) },

    '/payments': { get: op('Payments', 'My payments', { roles: CIT, errors: [401, 403] }) },

    '/documents': {
      post: created(op('Documents', 'Upload a document (PDF, JPEG or PNG, max 5 MB)', {
        roles: CIT,
        body: { required: true, content: { 'multipart/form-data': { schema: obj({ file: str({ format: 'binary' }), type: str({ enum: DOCUMENT_TYPES }), applicationId: uuid }, ['file', 'type']) } } },
        description: 'The file contents are checked, not just the declared type. Optionally attach it to an open application at upload time.',
        errors: [400, 401, 403, 404, 409, 413],
      })),
      get: op('Documents', 'List my documents', { roles: CIT }),
    },
    '/documents/{id}': { delete: op('Documents', 'Delete a document that is not attached to any application', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/documents/{id}/download': { get: op('Documents', 'Download a document', { roles: ['CITIZEN (owner)', 'DEPARTMENT_STAFF (only if attached to an application of their department; audited)'], params: [pathParam('id')], errors: [400, 401, 403, 404] }) },

    '/appointments/slots': { get: op('Appointments & queue', 'Available slots for a department and date', { params: [], query: [queryParam('departmentCode', str(), 'e.g. TRAFFIC'), queryParam('date', str({ example: '2026-10-12' }), 'YYYY-MM-DD, weekdays only')], errors: [400, 401, 404] }) },
    '/appointments': {
      post: created(op('Appointments & queue', 'Book an appointment', { roles: CIT, body: jsonBody(obj({ departmentCode: str(), serviceCode: str(), startsAt: str({ format: 'date-time' }) }, ['departmentCode', 'startsAt'])), description: '`startsAt` must be one of the slot times from /appointments/slots. A reminder is sent before the appointment, and bookings nobody attends are marked NO_SHOW automatically.', errors: [400, 401, 403, 404, 409] })),
      get: op('Appointments & queue', 'List appointments', { query: [queryParam('date'), queryParam('status', str({ enum: APPOINTMENT_STATUSES }))], description: 'Citizens see their own; staff see their department (citizen names only if the department may receive `fullName`).', errors: [400, 401, 403] }),
    },
    '/appointments/{id}/cancel': { post: op('Appointments & queue', 'Cancel an appointment', { params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/check-in': { post: op('Appointments & queue', 'Check a citizen in and assign a queue number', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/complete': { post: op('Appointments & queue', 'Mark a checked-in or in-service appointment as completed', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/no-show': { post: op('Appointments & queue', 'Mark an appointment as no-show', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/queue-position': { get: op('Appointments & queue', 'My place in the queue, who is being served, and estimated wait', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },
    '/queue': { get: op('Appointments & queue', "Today's line for my department: now serving and waiting", { roles: STAFF, query: [queryParam('date')], errors: [400, 401, 403] }) },
    '/queue/call-next': { post: op('Appointments & queue', 'Call the next person in line', { roles: STAFF, body: jsonBody(obj({ date: str() })), description: 'Moves the lowest queue number to SERVING and notifies them, and tells the next person to get ready.', errors: [400, 401, 403, 404] }) },

    '/notifications': { get: op('Notifications', 'In-app notifications', { roles: CIT, query: [queryParam('unread', str({ enum: ['true', 'false'] }))], errors: [400, 401, 403] }) },
    '/notifications/read-all': { patch: op('Notifications', 'Mark every notification as read', { roles: CIT, errors: [401, 403] }) },
    '/notifications/{id}/read': { patch: op('Notifications', 'Mark a notification as read', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },

    '/receipts': { get: op('Receipts', 'My receipts (submission, payment and completion)', { roles: CIT }) },
    '/receipts/{id}': { get: op('Receipts', 'Receipt detail', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },
    '/receipts/verify/{receiptNumber}': { get: op('Receipts', 'Verify a receipt is genuine (public)', { auth: false, params: [pathParam('receiptNumber', 'e.g. RCT-20261002-A1B2C3')], description: 'Returns only whether the receipt is valid, its type, the service name and issue date. No personal data.', errors: [404] }) },

    '/admin/users': {
      get: op('Admin', 'List users', { roles: ADM, query: [queryParam('role'), queryParam('departmentCode')], errors: [400, 401, 403] }),
      post: created(op('Admin', 'Create a staff account', { roles: ADM, body: jsonBody(obj({ email: str({ format: 'email' }), password: str({ minLength: 10 }), role: str({ enum: ['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN'] }), departmentCode: str() }, ['email', 'password', 'role'])), errors: [400, 401, 403, 409] })),
    },
    '/admin/users/{id}': { patch: op('Admin', 'Deactivate a user or change role / department / password', { roles: ADM, params: [pathParam('id')], body: jsonBody(obj({ active: { type: 'boolean' }, role: str(), departmentCode: str({ nullable: true }), password: str() })), errors: [400, 401, 403, 404] }) },
    '/admin/departments': { post: created(op('Admin', 'Create a department', { roles: ADM, body: jsonBody(obj({ code: str({ example: 'LABOUR' }), name: str(), ministry: str() }, ['code', 'name'])), description: 'A new department receives no identity fields until you set its scopes.', errors: [400, 401, 403, 409] })) },
    '/admin/departments/{code}/scopes': {
      get: op('Admin', 'Identity fields a department may receive', { roles: ADM, params: [pathParam('code')], errors: [401, 403, 404] }),
      put: op('Admin', 'Replace the identity fields a department may receive', { roles: ADM, params: [pathParam('code')], body: jsonBody(obj({ fields: { type: 'array', items: str({ enum: IDENTITY_FIELDS }) } }, ['fields'])), description: 'Takes effect on the next verification request. Home Affairs scopes cannot be changed.', errors: [400, 401, 403, 404] }),
    },
    '/admin/services': { post: created(op('Admin', 'Create a service', { roles: ADM, body: jsonBody(obj({ code: str(), name: str(), departmentCode: str(), requiredDocuments: { type: 'array', items: str({ enum: DOCUMENT_TYPES }) }, feeAmount: { type: 'number', nullable: true }, currency: str({ example: 'LSL' }), processingTimeDays: { type: 'integer', nullable: true } }, ['code', 'name', 'departmentCode'])), errors: [400, 401, 403, 409] })) },
    '/admin/services/{code}': { patch: op('Admin', 'Update a service (name, documents, fee, processing time)', { roles: ADM, params: [pathParam('code')], body: jsonBody(obj({ name: str(), requiredDocuments: { type: 'array', items: str({ enum: DOCUMENT_TYPES }) }, feeAmount: { type: 'number', nullable: true }, currency: str(), processingTimeDays: { type: 'integer', nullable: true } })), errors: [400, 401, 403, 404] }) },
    '/audit-logs': { get: op('Admin', 'Audit trail (read-only)', {
      roles: ADM,
      query: [
        queryParam('action'), queryParam('actorId'), queryParam('resourceType'), queryParam('resourceId'),
        queryParam('from', str({ format: 'date-time' })), queryParam('to', str({ format: 'date-time' })),
        queryParam('limit', { type: 'integer', default: 100, maximum: 500 }), queryParam('offset', { type: 'integer', default: 0 }),
      ],
      description: 'Newest first. The `X-Total-Count` response header holds the number of matching rows, for paging.',
      errors: [400, 401, 403],
    }) },
  },
};