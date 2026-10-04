// OpenAPI 3 description of the API, served as Swagger UI at /docs and raw JSON at /openapi.json.
// Other ministries can use this to see exactly how to integrate.
import { APPLICATION_STATUSES, DOCUMENT_TYPES, IDENTITY_FIELDS } from './constants.js';

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

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Government Services Platform API',
    version: '0.2.0',
    description:
      'Home Affairs acts as the authoritative identity source; ministries retrieve only the fields they are authorised for. ' +
      'Log in via /auth/*, then click **Authorize** and paste the token.',
  },
  servers: [{ url: '/' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  tags: [
    { name: 'Auth' }, { name: 'Citizen & identity' }, { name: 'Catalogue' }, { name: 'Applications' },
    { name: 'Documents' }, { name: 'Appointments & queue' }, { name: 'Notifications' }, { name: 'Receipts' },
    { name: 'Admin' },
  ],
  paths: {
    '/auth/otp/request': { post: op('Auth', 'Request a one-time code (citizens)', { auth: false, body: jsonBody(obj({ nationalId: str() }, ['nationalId'])), description: 'Always returns the same message. Outside production the code is included as `devOtp`.', errors: [400, 429] }) },
    '/auth/otp/verify': { post: op('Auth', 'Exchange the code for a token (citizens)', { auth: false, body: jsonBody(obj({ nationalId: str(), code: str({ example: '123456' }) }, ['nationalId', 'code'])), errors: [400, 401, 429] }) },
    '/auth/staff/login': { post: op('Auth', 'Staff / admin login', { auth: false, body: jsonBody(obj({ email: str({ format: 'email' }), password: str() }, ['email', 'password'])), errors: [400, 401] }) },

    '/me': { get: op('Citizen & identity', 'Own profile (use it to prefill forms)', { roles: CIT }) },
    '/citizens/{nationalId}': { patch: op('Citizen & identity', 'Update a citizen record', { roles: ['HOME_AFFAIRS_OFFICER'], params: [pathParam('nationalId')], body: jsonBody(obj({ fullName: str(), address: str(), phone: str() })), description: 'Clears the cached copy of the identity record.' }) },
    '/identity/verify': { post: op('Citizen & identity', 'Verify a citizen with Home Affairs', {
      roles: STAFF,
      body: jsonBody(obj({ applicationId: uuid, nationalId: str() })),
      description: `Department staff send \`applicationId\` (must belong to their department). Home Affairs officers send \`nationalId\`. Only the caller's permitted fields are returned (possible fields: ${IDENTITY_FIELDS.join(', ')}). \`cache\` shows whether the answer came from Redis.`,
    }) },

    '/services': { get: op('Catalogue', 'Service catalogue with required documents', { errors: [401] }) },
    '/departments': { get: op('Catalogue', 'Departments', { errors: [401] }) },

    '/applications': {
      post: created(op('Applications', 'Submit an application', { roles: CIT, body: jsonBody(obj({ serviceCode: str({ example: 'DRIVING_LICENCE' }), formData: obj({}), documentIds: { type: 'array', items: uuid } }, ['serviceCode'])), description: 'Pass `documentIds` to reuse documents already uploaded. The response lists `missingDocuments` and the submission receipt number.', errors: [400, 401, 403, 404] })),
      get: op('Applications', 'List applications', { query: [queryParam('status', str({ enum: APPLICATION_STATUSES }))], description: 'Citizens see their own, department staff see their department queue, admins see all.', errors: [400, 401] }),
    },
    '/applications/{id}': { get: op('Applications', 'Application detail, status history and missing documents', { params: [pathParam('id')], errors: [400, 401, 404] }) },
    '/applications/{id}/status': { patch: op('Applications', 'Move an application through review', { roles: ['DEPARTMENT_STAFF'], params: [pathParam('id')], body: jsonBody(obj({ status: str({ enum: APPLICATION_STATUSES }), note: str() }, ['status'])), description: 'SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / MORE_INFO_NEEDED. A note is required for REJECTED and MORE_INFO_NEEDED. APPROVED issues a completion receipt.', errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/respond': { post: op('Applications', 'Answer a "more info needed" request', { roles: CIT, params: [pathParam('id')], body: jsonBody(obj({ formData: obj({}), note: str() })), errors: [400, 401, 403, 404, 409] }) },
    '/applications/{id}/documents/{documentId}': { post: op('Documents', 'Attach an existing document to an application', { roles: CIT, params: [pathParam('id'), pathParam('documentId')], errors: [400, 401, 403, 404, 409] }) },

    '/documents': {
      post: created(op('Documents', 'Upload a document (PDF, JPEG or PNG, max 5 MB)', {
        roles: CIT,
        body: { required: true, content: { 'multipart/form-data': { schema: obj({ file: str({ format: 'binary' }), type: str({ enum: DOCUMENT_TYPES }), applicationId: uuid }, ['file', 'type']) } } },
        description: 'The file contents are checked, not just the declared type. Optionally attach it to an application at upload time.',
        errors: [400, 401, 403, 404],
      })),
      get: op('Documents', 'List my documents', { roles: CIT }),
    },
    '/documents/{id}': { delete: op('Documents', 'Delete a document that is not attached to any application', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/documents/{id}/download': { get: op('Documents', 'Download a document', { roles: ['CITIZEN (owner)', 'DEPARTMENT_STAFF (only if attached to an application of their department; audited)'], params: [pathParam('id')], errors: [400, 401, 403, 404] }) },

    '/appointments/slots': { get: op('Appointments & queue', 'Available slots for a department and date', { params: [], query: [queryParam('departmentCode', str(), 'e.g. TRAFFIC'), queryParam('date', str({ example: '2026-10-12' }), 'YYYY-MM-DD, weekdays only')], errors: [400, 401, 404] }) },
    '/appointments': {
      post: created(op('Appointments & queue', 'Book an appointment', { roles: CIT, body: jsonBody(obj({ departmentCode: str(), serviceCode: str(), startsAt: str({ format: 'date-time' }) }, ['departmentCode', 'startsAt'])), description: '`startsAt` must be one of the slot times from /appointments/slots.', errors: [400, 401, 403, 404, 409] })),
      get: op('Appointments & queue', 'List appointments', { query: [queryParam('date'), queryParam('status')], description: 'Citizens see their own; staff see their department.', errors: [400, 401, 403] }),
    },
    '/appointments/{id}/cancel': { post: op('Appointments & queue', 'Cancel an appointment', { params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/check-in': { post: op('Appointments & queue', 'Check a citizen in and assign a queue number', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/complete': { post: op('Appointments & queue', 'Mark a checked-in appointment as completed', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/no-show': { post: op('Appointments & queue', 'Mark an appointment as no-show', { roles: STAFF, params: [pathParam('id')], errors: [400, 401, 403, 404, 409] }) },
    '/appointments/{id}/queue-position': { get: op('Appointments & queue', 'My place in the queue and estimated wait', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },
    '/queue': { get: op('Appointments & queue', "Today's waiting line for my department", { roles: STAFF, query: [queryParam('date')], errors: [400, 401, 403] }) },

    '/notifications': { get: op('Notifications', 'In-app notifications', { roles: CIT, query: [queryParam('unread', str({ enum: ['true', 'false'] }))], errors: [400, 401, 403] }) },
    '/notifications/{id}/read': { patch: op('Notifications', 'Mark a notification as read', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },

    '/receipts': { get: op('Receipts', 'My receipts', { roles: CIT }) },
    '/receipts/{id}': { get: op('Receipts', 'Receipt detail', { roles: CIT, params: [pathParam('id')], errors: [400, 401, 403, 404] }) },
    '/receipts/verify/{receiptNumber}': { get: op('Receipts', 'Verify a receipt is genuine (public)', { auth: false, params: [pathParam('receiptNumber', 'e.g. RCT-20261002-A1B2C3')], description: 'Returns only whether the receipt is valid, its type, the service name and issue date. No personal data.', errors: [404] }) },

    '/admin/users': {
      get: op('Admin', 'List users', { roles: ['ADMIN'], query: [queryParam('role'), queryParam('departmentCode')], errors: [400, 401, 403] }),
      post: created(op('Admin', 'Create a staff account', { roles: ['ADMIN'], body: jsonBody(obj({ email: str({ format: 'email' }), password: str({ minLength: 10 }), role: str({ enum: ['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN'] }), departmentCode: str() }, ['email', 'password', 'role'])), errors: [400, 401, 403, 409] })),
    },
    '/admin/users/{id}': { patch: op('Admin', 'Deactivate a user or change role / department / password', { roles: ['ADMIN'], params: [pathParam('id')], body: jsonBody(obj({ active: { type: 'boolean' }, role: str(), departmentCode: str({ nullable: true }), password: str() })), errors: [400, 401, 403, 404] }) },
    '/admin/departments/{code}/scopes': {
      get: op('Admin', 'Identity fields a department may receive', { roles: ['ADMIN'], params: [pathParam('code')], errors: [401, 403, 404] }),
      put: op('Admin', 'Replace the identity fields a department may receive', { roles: ['ADMIN'], params: [pathParam('code')], body: jsonBody(obj({ fields: { type: 'array', items: str({ enum: IDENTITY_FIELDS }) } }, ['fields'])), description: 'Takes effect on the next verification request. Home Affairs scopes cannot be changed.', errors: [400, 401, 403, 404] }),
    },
    '/audit-logs': { get: op('Admin', 'Audit trail (read-only)', { roles: ['ADMIN'], query: [queryParam('action'), queryParam('actorId'), queryParam('limit', { type: 'integer' })], errors: [400, 401, 403] }) },
  },
};
