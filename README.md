# Government Services Platform: Frontend Prototype


```
cd frontend
npm install
npm run dev 
```
# Government Services Platform: Backend Prototype

Express + Prisma + PostgreSQL + Redis (JWT/Passport auth, RBAC, audit log).

## Run it

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL + Redis 
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev                   # http://localhost:3000
```

Seed logins (password for all staff: `Password123!`):
`homeaffairs@gov.test`, `traffic@gov.test`, `finance@gov.test`, `pension@gov.test`, `police@gov.test`, `passport@gov.test`, `admin@gov.test`.
Demo citizen IDs: `1990010100001`, `1958050500002`, `2001112200003`.

## Demo walkthrough (curl)

```bash
API=http://localhost:3000

# 1. Citizen logs in with ID + OTP (the OTP is returned as devOtp outside production)
curl -s $API/auth/otp/request -H 'Content-Type: application/json' -d '{"nationalId":"1990010100001"}'
curl -s $API/auth/otp/verify  -H 'Content-Type: application/json' -d '{"nationalId":"1990010100001","code":"<devOtp>"}'
# -> {"token":"..."}   (CITIZEN_TOKEN)

# 2. Citizen applies for a driving licence
curl -s $API/applications -H "Authorization: Bearer $CITIZEN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"serviceCode":"DRIVING_LICENCE","formData":{"licenceClass":"B"}}'
# -> {"id":"<APP_ID>","reference":"APP-XXXXXXXX","status":"SUBMITTED"}

# 3. Traffic staff logs in, sees the queue, starts review
curl -s $API/auth/staff/login -H 'Content-Type: application/json' -d '{"email":"traffic@gov.test","password":"Password123!"}'
curl -s $API/applications -H "Authorization: Bearer $TRAFFIC_TOKEN"
curl -s -X PATCH $API/applications/$APP_ID/status -H "Authorization: Bearer $TRAFFIC_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"UNDER_REVIEW"}'

# 4. Traffic asks Home Affairs to verify the applicant (only Traffic's allowed fields come back)
curl -s -X POST $API/identity/verify -H "Authorization: Bearer $TRAFFIC_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"applicationId\":\"$APP_ID\"}"
# first call: "cache":"miss"; repeat it: "cache":"hit"

# 5. Home Affairs updates the address, which clears the cached copy
curl -s -X PATCH $API/citizens/1990010100001 -H "Authorization: Bearer $HA_TOKEN" \
  -H 'Content-Type: application/json' -d '{"address":"99 New Road, Maseru"}'
# verify again from Traffic: "cache":"miss" with the new address

# 6. Admin reviews the audit trail
curl -s "$API/audit-logs?action=IDENTITY_VERIFY" -H "Authorization: Bearer $ADMIN_TOKEN"
```

Things worth trying for the demo: a Police token calling `/identity/verify` with that Traffic application ID returns 404 (wrong department), a citizen token calling it returns 403, and both show up in the audit log.

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| POST | /auth/otp/request, /auth/otp/verify | Citizen |
| POST | /auth/staff/login | Staff, admin |
| GET | /me | Citizen |
| GET | /services | Any logged-in user |
| POST | /applications | Citizen |
| GET | /applications, /applications/:id | Citizen (own), department staff (own department), admin |
| PATCH | /applications/:id/status | Department staff |
| POST | /applications/:id/respond | Citizen |
| POST | /identity/verify | Department staff (by applicationId), Home Affairs officer (by nationalId) |
| PATCH | /citizens/:nationalId | Home Affairs officer |
| GET | /audit-logs | Admin |

## Design notes

- Department field scopes live in the `DepartmentFieldScope` table, so what each ministry may see is data you can change, not code.
- Staff cannot look up arbitrary citizens: `/identity/verify` needs an application belonging to their department.
- Audit entries record field names, never field values.
- Not built yet: document upload (MinIO), appointments/queue, BullMQ notifications (currently logged), receipts, Swagger docs, rate limiting.
