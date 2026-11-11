# Raysis V2 combined upgrade (staging branch)

This branch is a staging upgrade. It is not the live GitHub Pages branch. Do not merge into `main` until the database migration, Edge Function deployment, and real-account tests pass.

## Included in this branch

- Fix: Supabase cloud data is no longer overwritten by stale local browser data after login.
- Cloud writes: new sales, quotations, and stock movements are inserted one record at a time. Each write uses a UUID idempotency key so a retry does not create a second copy.
- Offline retry foundation: pending writes marked `cloudSaved:false` are retained in local storage and retried when the app reconnects.
- Cloud audit log: database triggers record inserts, updates, and deletes on sales, quotations, stock movements, payments, and correction requests.
- Correction requests: branch users can submit a reasoned request; CEO can approve or reject.
- CEO user administration: secure Edge Function for listing profiles, creating accounts, changing role/branch, and disabling/reactivating accounts. The service-role key is used only by the Edge Function.
- PWA cache version bump so devices request the upgraded app shell.

## Required deployment sequence

1. Keep the current live site and `main` branch unchanged.
2. In Supabase Dashboard > SQL Editor, run the file:
   `supabase/migrations/202611090001_raysis_v2_combined_upgrade.sql`
3. Deploy the Edge Function from this repository:
   `supabase/functions/ceo-user-admin/index.ts`
   Function name: `ceo-user-admin`.
4. Configure function secrets on the Supabase project:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   The service-role key must never be copied into `index.html`, GitHub Pages, or any browser setting.
5. Publish this branch to a staging URL and test with the CEO, Mansa, and Chinsali accounts.
6. Only after tests pass should a pull request be merged to `main`.

## Edge Function deployment (Supabase CLI)

From a local clone of this repository:

```sh
supabase login
supabase link --project-ref vrstuxentgssrmndcslh
supabase secrets set SUPABASE_URL=https://vrstuxentgssrmndcslh.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase functions deploy ceo-user-admin
```

Use the service-role key only in the command-line secret setting prompt/environment. Never commit it.

## Test checklist (must be done against the real Supabase project)

- CEO login loads records from both Mansa and Chinsali.
- Mansa user cannot read Chinsali sales, quotations, stock, correction requests, or audit rows.
- Chinsali user cannot read Mansa records.
- A new sale, quotation, and stock movement each appear once in Supabase after saving.
- Retrying a queued write with the same operation UUID does not create a duplicate.
- Correction request can be submitted by branch staff; only CEO can approve/reject.
- CEO user administration is denied to branch users; CEO can create, move, disable, and reactivate accounts.
- Audit rows appear after database changes and are readable only within the user's branch or by CEO.
- Confirm no data is lost when refreshing or signing in on another device.

## Important limitations before production approval

- Accepted-quotation conversion is handled by a database RPC that atomically creates the sale and marks the quotation accepted. The initial payment remains recorded in the sales.amount_paid field; a separate append-only payments workflow is not implemented in this upgrade.
- Stock consumption from a sale is currently a separate append-only movement insert, not an atomic database transaction with the sale. Do not treat sale and stock writes as all-or-nothing.
- Offline retry only applies to records created by this upgraded code and retained locally; it does not automatically migrate old unmarked browser-only records.
- The Edge Function lists up to 1,000 users per call.
- The migration has not been executed against the live Supabase database from this repository, and real branch/JWT security tests have not yet been run. Do not describe those tests as passed until performed.
