# METAL FUZE PROJECTS

Internal web system for **Metal Fuze** (contracting): projects & payments, HR,
attendance, sales, internal communication, an AI advisor, and the construction
project-management module. Arabic-first (RTL) with an English toggle, light/dark
mode, installable as a PWA.

**Stack:** React + Vite + TypeScript · Supabase (Postgres, Auth, Storage,
Realtime, Edge Functions) · jsPDF for reports · Claude API for AI features.

Every permission is enforced **in the database** with Row Level Security on all
tables. The UI only mirrors what `public.my_permissions()` returns.

---

## Repository layout

```
src/                       React app
  lib/                     supabase client (multi-account), auth, i18n, PDF, translation, errors
  components/              layout, CrudPage (generic list/form/PDF), advisor, idle guard, …
  pages/                   projects · hr · attendance · sales · comms · construction · myprojects · dev
supabase/
  migrations/              schema, RLS, triggers, seeds (apply in order)
  functions/               edge functions (see below)
  seed_people.sql          assigns roles/flags to the named staff after their accounts exist
  tests/                   local Postgres stub + RLS/trigger behaviour script
public/                    PWA manifest, service worker, icons, Amiri fonts (OFL) for Arabic PDFs
```

## Permission model

* `profiles.role` ∈ `admin, executive, hr, sales, manager, developer, viewer`.
* `role_permissions(role, module, can_write)` holds the role defaults.
* `user_permissions(user_id, module, can_write)` — if a user has **any** rows here they
  **replace** the role defaults (this is how Ali gets only the construction module +
  messages, mail and “My check-in”).
* `app.can(module, write)` is used by every policy. It also applies the account's
  `access_rules` (allowed hours in Riyadh time, IPs from `x-forwarded-for`, and device ids
  from the `x-device-id` header the app sends) and the `suspended` flag.
* Person-specific flags on `profiles`: `can_approve_leaves` (Aisha, CEO), `can_multi_account`
  (Eilaf), `is_ceo`, `is_supervisor`, `is_meeting_responsible` (Haitham, CEO, Eilaf).
* Self-signup users start as `manager` (“My projects” only); signup metadata is never trusted for
  privileges. They are linked to their employee record only **after** email confirmation.

| Who | Role | Access |
|---|---|---|
| Eilaf, Eng. Abdelrhman | admin | projects, payments, budget, accounting, bank (refresh), reports, custody, fleet, documents, residencies, accounts; read HR. Eilaf can keep several accounts and switch. |
| Aisha | hr | sole HR editor (employees, files, leaves, payroll, settlements, performance, attendance); approves leaves |
| Hala, Nagla | sales | sales page only; each sees only her own quotes/meetings |
| Hisham (CEO) | executive | read-only summary of projects, budget, payments; approves leaves |
| Abdelrhman (dev) | developer | `/dev` only: bug inbox, accounts, sign-in audit, activity log, force sign-out/suspend, access rules |
| Ali | admin + override | construction “Project Admin” module, messages, mail, my check-in |
| Self-signup PMs | manager | “My projects” (private); admins can read |

## Data rules implemented in the database

* **Projects & payments:** one row per item, optimistic version checks (`VERSION_CONFLICT`),
  tombstone deletes that can't be restored or edited, DB-assigned receipt numbers, duplicate
  prevention (project name+client; payment project/date/amount/reference), `received` kept in
  sync from payments.
* **Leaves:** no overlapping pending/approved leaves (exclusion constraint); only approvers can
  approve/reject; balances accrue pro-rata from the hire date.
* **Payroll:** `generate_payroll(month)` adds commissions and deducts advances & fines.
* **Settlements:** end-of-service benefit per Saudi labour law (resignation reductions) and leave
  compensation are computed by trigger.
* **Sales:** reference numbers, 2% commission on the pre-VAT value, values frozen after “won”,
  won quotes create the owner's commission automatically, stage history, meeting notifications.
* **Construction:** auto references per project & type (`CODE-WIR-001`, `-Rev1` …), resubmission
  only from C/D codes, waiting days (red after 7), sequential invoice numbers, only A/B-coded WIRs
  can be invoiced, gross/retention/net computed in the DB, overdue flag after 30 days unpaid.
* **Attendance:** work starts 09:00, late after 09:30 (Asia/Riyadh); duplicate guards for device
  and manual punches; distance from the office (24.7624564, 46.6726382) recorded, never enforced.
* **Activity log:** generic trigger on business tables → `activity_log` (visible in `/dev`).

## Edge functions

| Function | Purpose | JWT |
|---|---|---|
| `iclock` | ZKTeco ADMS push (`/iclock/cdata`, `/iclock/getrequest`); stores only approved serials; unknown devices are listed for approval | off |
| `phone-checkin` | secret per-employee link or “My check-in”: selfie + location, emails a 7-day selfie link | off (own checks) |
| `advisor` | floating AI advisor; system snapshot is read **as the caller** (RLS) | on |
| `ai-extract` | settlements: reads PDFs/images and extracts hire date & salary | on |
| `fetch-link` | attach from Google Drive / Dropbox / OneDrive / SharePoint links: HTTPS only, allow-listed hosts on every redirect, allowed types, 25 MB cap | on |
| `translate` | display-only Arabic→English translation with shared cache | on |
| `mcp` | MCP server (streamable HTTP) running with the caller's own token/RLS | on |
| `outlook` | personal Outlook mailbox via Microsoft Graph; tokens never leave the server, always scoped to the caller | off (OAuth callback; own checks) |
| `send-email` | email a quote PDF to the client (quote loaded as the caller) | on |
| `admin-users` | create/update accounts, passwords, module overrides | on |
| `audit` | sign-in/out audit with IP & location taken server-side; reports access-rule blocks | on |
| `bank-refresh` | admin-only bank balance/transaction refresh from `BANK_FEED_URL` | on |

### Function secrets

```
ANTHROPIC_API_KEY      # advisor, ai-extract, translate
CLAUDE_MODEL           # optional, defaults to claude-sonnet-5-5
RESEND_API_KEY         # selfie emails, quote emails
MAIL_FROM              # e.g. "Metal Fuze <no-reply@metalfuze.sa>"
MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT   # Outlook (Azure app, redirect: <SUPABASE_URL>/functions/v1/outlook/callback)
APP_URL                # where the app is hosted (Outlook redirect back)
BANK_FEED_URL / BANK_FEED_TOKEN               # optional bank aggregator feed
```

## Live project

* Supabase project: `metal-fuze-projects` (ref `wnhnwccevfklkwnodhpw`, region eu-central-1).
* Schema (`supabase/full_schema.sql`, including `20261030000008_hardening.sql`) and all 12 edge functions are deployed.
* `.env.example` already points at this project — copy it to `.env.local` to run the app against it.

## Setup

1. Create a Supabase project, then link and push:
   ```bash
   supabase link --project-ref <ref>
   supabase db push                       # applies supabase/migrations
   supabase secrets set ANTHROPIC_API_KEY=... RESEND_API_KEY=... MAIL_FROM=... APP_URL=https://...
   supabase functions deploy              # config.toml disables JWT where noted above
   ```
2. Create the staff accounts (first admin via the Supabase dashboard, then **User accounts** in
   the app) with usernames `eilaf, abdelrhman, aisha, hala, nagla, hisham, dev, ali, haitham`, and run
   `supabase/seed_people.sql` in the SQL editor to apply their roles and flags.
3. Frontend:
   ```bash
   cp .env.example .env.local             # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   npm install
   npm run dev                            # or: npm run build && deploy dist/
   ```
4. ZKTeco: point the device's ADMS server to the app's domain. `vercel.json` rewrites
   `/iclock/*` to the `iclock` function (replace `YOUR-PROJECT`). Approve the device serial in
   **Attendance → Devices**, and set each employee's device PIN.

## Testing

```bash
npm run typecheck && npm run build

# database behaviour (plain local PostgreSQL 15+)
createdb mf
psql -d mf -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -d mf -v ON_ERROR_STOP=1 -f "$f"; done
psql -d mf -f supabase/tests/rls_behaviour.sql
```

## Conventions

* When adding features, never remove/merge existing columns or fields and never reorder items.
* Dropdowns backed by `lookup_values` offer «أخرى / Other»; a typed value is saved for everyone.
* Company reports are generated as PDFs (Amiri font, RTL column order, rows never split across
  pages, page numbers, no browser headers/URLs).
