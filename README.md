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
npm install
npx prisma generate
node prisma/seed.js
npm start
```

