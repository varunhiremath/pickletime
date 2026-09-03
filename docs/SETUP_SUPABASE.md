# Connecting PickleTime to Supabase

Twenty minutes, once. After this, everyone's scores land on everyone's phone.

Without these steps the app still works — it just runs in single-device mode, where
each phone keeps its own private copy. Nothing breaks; it simply isn't shared.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) (free, no card).
2. **New project**. Give it a name, pick the region closest to where you play,
   and let it generate a database password.
3. Wait for it to finish provisioning (~2 minutes).

## 2. Apply the database

Open **SQL Editor** in the left sidebar. Run these three files from this repo,
**in order**, pasting the contents of each into a new query and hitting Run:

1. `supabase/schema.sql` — tables and indexes
2. `supabase/policies.sql` — row-level security
3. `supabase/functions.sql` — the three RPCs

Order matters: policies reference tables, and the grants at the end of
`functions.sql` reference the functions.

All three are safe to re-run, so if you get interrupted you can start over.

### Already have a project running?

New columns and a changed RPC arrive with the app, and **the database has to be
updated before the new build reaches anybody's phone** — otherwise creating a
session and saving a score both fail. Either re-run `schema.sql` and
`functions.sql` in that order, or paste the smaller
`supabase/migrate-playoffs.sql`, which contains only the delta. Both are safe to
re-run and neither touches existing data: every game already in the database is
treated as a round-robin fixture, which is what it is.

## 3. Turn on anonymous sign-in ← easiest step to miss

**Authentication → Sign In / Providers → Anonymous Sign-Ins → enable.**

This is how a device gets an identity without anyone making an account. It is
invisible in the app — no email, no password, nothing to forget — but it means
permissions are real rather than pretend.

> Nothing works without this. Every RPC and every read is gated on being signed
> in, so with it off the app can't create a club, claim a code or record a score.
> If you see *"Anonymous sign-ins are disabled for this project"*, this is the step.

## 4. Check realtime is on

**Database → Replication** (or **Publications**) → confirm `games`, `sessions`
and `members` are in the `supabase_realtime` publication. `schema.sql` adds them,
so this is just a look, not a task.

This is what makes standings reorder on everyone's phone the instant somebody
scores.

## 5. Copy your keys into the app

**Project Settings → API.** You need two values:

| Value | Where it goes |
| --- | --- |
| **Project URL** | `VITE_SUPABASE_URL` |
| **Publishable key** (`sb_publishable_…`), or the legacy **anon** key | `VITE_SUPABASE_ANON_KEY` |

> **The dashboard address is not the Project URL.** The dashboard looks like
> `supabase.com/dashboard/project/abcdefgh…`; the API URL you need is
> `https://abcdefgh….supabase.co` — the same project ref, different host.
>
> Either key format works. Supabase now issues **publishable** keys
> (`sb_publishable_…`) in place of the older `anon` JWT; the env var keeps its
> old name so existing setups don't break.

For local development, copy `.env.example` to `.env` and fill both in.

For the deployed app, add them in GitHub under
**Settings → Environments → `pickletime` → Environment variables** (create the
environment if it doesn't exist), once for each name.

> **The environment name matters.** A workflow job can declare exactly one
> environment, and `${{ vars.X }}` only sees repository-level variables plus the
> variables of *that* environment. `deploy.yml` therefore splits the work in two:
> the **build** job runs in `pickletime` so it can read these, and a separate
> **deploy** job runs in `github-pages` because `actions/deploy-pages` requires
> it. Merging those back into one job would make the build read these as empty
> strings and silently ship an app that shares nothing.
>
> Repository-level variables work too, and are visible to every job. Either is
> fine; just don't put them in an environment whose name no job declares.

The build fails loudly if the variables are missing or if the finished bundle
doesn't reference your project, so a misconfigured deploy can't pass as a
working one.

> **On the two keys.** The **anon key is meant to be public** — it is compiled into
> the JavaScript bundle and anyone can read it out of the deployed app. That is by
> design: it identifies your project, and row-level security is what actually
> protects the data. Publishing it is not a mistake.
>
> The **`service_role` key is the opposite**. It bypasses every security rule in
> `policies.sql`. Never put it in `.env`, never commit it, never paste it into the
> app or into a chat. PickleTime never needs it.

## 6. Deploy

Push to `main`. The Actions workflow builds with your two variables baked in and
publishes to Pages.

Open the app: instead of "This device" in the header, you'll see a pulsing
**Live** badge.

---

## Using it

**You (admin):**

1. Open the app → **Club** → create your club. You're the admin because you made it.
2. Add everyone to the roster.
3. Each roster row has an **Invite** button. Tap it to mint that person's personal
   code, then send it to them however you like.
4. If somebody loses their code, reopen Club and read it again — you can re-send
   the same one. If you want to cut someone off, **Revoke**; their device loses
   access on its next request.

**Your friends:**

1. Install the app.
2. Enter the code you sent them.
3. That's it — they're on the roster and can enter scores.

If you already had a club on your phone before connecting the server, the app
offers to **publish it** — roster, sessions, games and scores all upload, and you
stay the admin.

---

## Keeping the project awake

Supabase pauses free projects after **7 days with no activity**, and a paused
project means a dead app on a Saturday morning.

`.github/workflows/keepalive.yml` runs a weekly query to prevent that. It needs
the same two values as repository variables (step 5), so once those are set there
is nothing more to do.

If the project ever does pause, un-pause it from the Supabase dashboard; no data
is lost.

## Free tier

500 MB database, unlimited API requests, 2 projects. A weekend of pickleball is a
few kilobytes — you will not come close.

---

## If something goes wrong

**"Anonymous sign-ins are disabled for this project"** / **"Not signed in"** —
step 3. This is the single most commonly missed step.

**Stuck on the splash, or a red banner about reaching the server** — the app
waits 5 seconds for sign-in and then opens on whatever it last downloaded, rather
than hanging. So this means the project is unreachable, paused, or misconfigured;
it is not the app failing to start.

**Everything is empty, no errors** — usually `policies.sql` didn't run, or ran
before `schema.sql`. Re-run both in order.

**"permission denied for function is_member"** — `functions.sql` didn't finish;
its final grants are what let the policies call the helpers. Re-run it.

**Header says "This device" after deploying** — the build didn't see the two
variables. Check they're under Actions → **Variables** (not Environments), then
re-run the deploy.

**Scores don't appear on other phones, but a refresh shows them** — realtime
isn't replicating. Step 4.

## Verifying it's actually locked down

`supabase/rls.test.mjs` checks the security rules against your live project — that
a non-member reads nothing, that a player can't rewrite a score behind the audit
log's back, that a revoked code stops working:

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node supabase/rls.test.mjs
```

It creates two throwaway anonymous accounts and its own scratch club, so it's safe
to run against the project you actually use.
