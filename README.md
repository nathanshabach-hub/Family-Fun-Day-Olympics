# Family Fun Day Olympics

Production-focused full-stack app for church Family Fun Day scoring.

This project uses one Cloudflare Worker for API + frontend static assets, with Cloudflare D1 as the database.

## Current Stage Summary

Completed through Stage 15:
- Project scaffold, D1 schema and migrations
- Auth, sessions, CSRF checks, login rate limiting
- Public registration, admin team/activity management
- Judge scoring flow, admin score correction, audit logging
- Leaderboard ranking service and live scoreboard polling with ETag checks
- CSV and JSON exports
- Unit test coverage for core business-rule services and middleware
- Security hardening pass and accessibility/responsive improvements
- Full deployment and operations documentation

## Important Decision Note

At your request, the strict hard cap of 6 teams was removed after initial implementation.
- `maximum_teams` remains enforced server-side
- capacity is configurable and must be >= 1
- registration still uses atomic capacity checks in SQL to avoid race-condition overbooking

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router
- Backend: Cloudflare Worker + Hono + Zod
- Database: Cloudflare D1 (SQLite)
- Tests: Vitest
- Deployment: Wrangler

## Project Layout

- src: React application pages and UI
- worker: Worker routes, middleware, auth, and services
- migrations: SQL migration files
- scripts: setup and seed scripts
- tests: Vitest suite

## Prerequisites (Ubuntu Studio)

1. Git
2. Node.js 20+
3. npm 10+
4. Cloudflare account

If Node is missing, install with nvm:

1. Install nvm
   - `wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash`
2. Load nvm in current shell
   - `export NVM_DIR="$HOME/.nvm"`
   - `. "$NVM_DIR/nvm.sh"`
3. Install Node 20
   - `nvm install 20`
   - `nvm alias default 20`
4. Verify
   - `node -v`
   - `npm -v`

## Local Setup

1. Clone and enter repo
   - `git clone <your-repo-url>`
   - `cd FFDO`
2. Install dependencies
   - `npm install`
3. Apply local migrations
   - `npm run db:migrate`
4. Seed development data (safe placeholder currently)
   - `npm run db:seed`
5. Create/update local admin + judge users
   - `ADMIN_PASSWORD='change-me-admin' JUDGE1_PASSWORD='change-me-judge1' JUDGE2_PASSWORD='change-me-judge2' JUDGE3_PASSWORD='change-me-judge3' npm run setup:users`
6. Start local app
   - `npm run dev`
7. Run tests
   - `npm test`
8. Build
   - `npm run build`

## Command Reference

- `npm install`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run dev`
- `npm test`
- `npm run build`
- `npm run deploy`

## Local D1 Notes

- Local D1 state is managed by Wrangler under the `.wrangler` directory.
- `npm run db:migrate` applies all migrations to local D1.
- If migration command asks for confirmation in CI or non-interactive shells, pipe yes:
  - `printf 'Y\n' | npm run db:migrate`

## Cloudflare Production Deployment

### 1. Install and authenticate Wrangler

1. Install Wrangler (if needed)
   - `npm install --save-dev wrangler@4`
2. Authenticate
   - `npx wrangler login`

### 2. Create D1 database

1. Create DB
   - `npx wrangler d1 create family_fun_day`
2. Copy the returned `database_id`
3. Update `wrangler.jsonc` with the production `database_id`

### 3. Apply production migrations

- `npx wrangler d1 migrations apply family_fun_day --remote`

### 4. Create production users

Run setup script against remote D1:

- `ADMIN_PASSWORD='strong-admin-password' JUDGE1_PASSWORD='strong-judge1-password' JUDGE2_PASSWORD='strong-judge2-password' JUDGE3_PASSWORD='strong-judge3-password' npm run setup:users -- --remote`

### 5. Secrets

Current app does not require runtime Worker secrets for core flows.
If you add sensitive runtime values later, store them with Wrangler secrets, for example:

- `npx wrangler secret put SOME_SECRET_NAME`

### 6. Deploy

- `npm run deploy`

### 7. View logs

- `npx wrangler tail`

## Production Verification Checklist

After deploy, verify:

1. Login works for admin and all three judges
2. Registration status endpoint responds and registration form submits
3. Admin can create teams and activities
4. Judge can submit scores
5. Admin can correct scores
6. Leaderboard updates and scoreboard renders
7. CSV and JSON exports download correctly

## Password Rotation (Before Live Event)

Recommended process:

1. Generate fresh passwords for admin and all judges
2. Re-run remote setup command with new password env vars
3. Ask all operators to log out and log back in
4. Confirm old passwords no longer work

## Event-Day Operating Checklist

Before event:

1. Admin login confirmed
2. Activities created and ordered
3. Registration set as intended
4. Scoreboard visibility configured
5. Judges can log in from phones/tablets

During event:

1. Set event status to LIVE
2. Judges submit scores activity-by-activity
3. Monitor incomplete activity badges and score matrix
4. Correct errors from admin panel when needed

After event:

1. Set event status to FINISHED
2. Export CSV results
3. Export full event JSON backup
4. Save backup files in two locations

## Security Notes

Implemented protections include:

- PBKDF2 password hashing with per-user salts
- HttpOnly + Secure + SameSite=Strict session cookie
- Session token hashing server-side
- Role-based server authorization for admin and judge routes
- CSRF checks on state-changing requests
- Login rate limiting
- Security headers including CSP, HSTS, and Permissions-Policy

## Testing Status

Current automated suite validates:

- registration business rules
- score validation and edit-lock rules
- role-guard middleware
- ranking/tie-break behavior

Run all tests with:

- `npm test`

## Known Gaps and Next Improvements

- Add Worker+D1 integration tests for full route-level behavior and concurrency
- Add deeper admin workflows (team/activity score reset helpers and guided event-state transitions)
- Expand seed script to generate realistic sample teams/activities/scores
- Add deployment environment separation guidance if using multiple Cloudflare environments
