// Verifies the security rules against a LIVE Supabase project.
//
//   npm i --no-save @supabase/supabase-js   # already a dependency
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node supabase/rls.test.mjs
//
// Not part of `npm test` — it needs a real database, so CI can't run it.
//
// It signs in three throwaway anonymous accounts and builds its own scratch
// clubs, then deletes them, so it is safe to run against the project you
// actually use.
//
// What it is really checking: that the anon key shipped in the app bundle
// cannot be used to read another club's data, forge a score, or bypass the
// audit log. Those are the claims the whole design rests on.

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(2);
}

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  [32m✓[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  [31m✗[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const client = () => createClient(url, key, { auth: { persistSession: false } });

async function anonUser(label) {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) {
    console.error(
      `\nCould not create an anonymous session (${label}): ${error.message}\n` +
        'Enable Authentication → Sign In / Providers → Anonymous Sign-Ins.'
    );
    process.exit(2);
  }
  return { c, userId: data.user.id };
}

const code = () => `PT-TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/* --------------------------------------------------------------------- run */

console.log(`Checking RLS against ${url}\n`);

const admin = await anonUser('admin');
const friend = await anonUser('friend');
const stranger = await anonUser('stranger');

let clubId = null;
let strangerClubId = null;

try {
  /* ---------------------------------------------------------- setup */
  section('Setup');

  const { data: created, error: createErr } = await admin.c.rpc('create_club', {
    p_name: 'RLS scratch club',
    p_admin_name: 'Admin',
  });
  check('admin can create a club', !createErr && created?.club?.id, createErr?.message);
  if (createErr) throw new Error('cannot continue without a club');
  clubId = created.club.id;
  const adminMemberId = created.member.id;

  const { data: otherClub } = await stranger.c.rpc('create_club', {
    p_name: 'Unrelated club',
    p_admin_name: 'Stranger',
  });
  strangerClubId = otherClub?.club?.id ?? null;

  const { data: memberRow, error: addErr } = await admin.c
    .from('members')
    .insert({ club_id: clubId, name: 'Friend', role: 'player', color_index: 1 })
    .select()
    .single();
  check('admin can add a roster member', !addErr && memberRow?.id, addErr?.message);
  const friendMemberId = memberRow.id;

  const sessionId = crypto.randomUUID();
  const { error: sessErr } = await admin.c.from('sessions').insert({
    id: sessionId, club_id: clubId, name: 'Scratch', date: '2026-08-01',
    format: 'singles', player_ids: [adminMemberId, friendMemberId],
    num_games: 1, courts: 1, points_to: 11, rng_seed: 1, status: 'live',
  });
  check('admin can create a session', !sessErr, sessErr?.message);

  const gameId = crypto.randomUUID();
  const { error: gameErr } = await admin.c.from('games').insert({
    id: gameId, session_id: sessionId, ordinal: 1, round: 1, court: 1,
    team_a: [adminMemberId], team_b: [friendMemberId], byes: [],
  });
  check('admin can create a game', !gameErr, gameErr?.message);

  /* ------------------------------------------------- 1. isolation */
  section('1. A non-member sees nothing');

  for (const table of ['clubs', 'members', 'sessions', 'games', 'score_events']) {
    const { data, error } = await stranger.c.from(table).select('*').limit(50);
    const leaked = (data ?? []).filter((r) =>
      table === 'clubs' ? r.id === clubId : r.club_id === clubId || r.session_id === sessionId
    );
    check(`stranger reads no rows from ${table}`, !error && leaked.length === 0,
      error ? error.message : `${leaked.length} row(s) leaked`);
  }

  {
    const { data } = await stranger.c.from('clubs').select('*').eq('id', clubId);
    check('stranger cannot read the club by id', (data ?? []).length === 0);
  }

  /* -------------------------------------------- 2. invites are admin-only */
  section('2. Invite codes are admin-only');

  const inviteCode = code();
  const { error: mintErr } = await admin.c
    .from('invites')
    .insert({ club_id: clubId, member_id: friendMemberId, code: inviteCode });
  check('admin can mint an invite', !mintErr, mintErr?.message);

  {
    const { data } = await stranger.c.from('invites').select('*');
    check('stranger cannot read any invite', (data ?? []).length === 0);
  }

  /* ----------------------------------------------------- 3. claiming */
  section('3. Claiming an invite');

  {
    const { data } = await friend.c.rpc('claim_invite', { p_code: 'PT-0000-0000' });
    check('an unknown code is rejected', data?.ok === false, JSON.stringify(data));
  }

  {
    const { data, error } = await friend.c.rpc('claim_invite', { p_code: inviteCode });
    check('the real code is accepted', !error && data?.ok === true && data?.member?.id === friendMemberId,
      error?.message ?? JSON.stringify(data));
  }

  {
    const { data } = await friend.c.rpc('claim_invite', { p_code: inviteCode });
    check('the same code cannot be claimed twice', data?.ok === false);
  }

  {
    const { data } = await friend.c.from('members').select('*').eq('club_id', clubId);
    check('the friend can now see the roster', (data ?? []).length >= 2);
  }

  {
    const { data } = await friend.c.from('invites').select('*');
    check('a player still cannot read invites', (data ?? []).length === 0);
  }

  /* ---------------------------------------- 4. the audit log cannot be bypassed */
  section('4. Scores can only be written through submit_score');

  {
    // The single most important assertion in this file. `games` has no UPDATE
    // policy, so this must fail — otherwise the audit log is decorative.
    const { data, error } = await friend.c
      .from('games')
      .update({ score_a: 99, score_b: 0 })
      .eq('id', gameId)
      .select();
    check('a player cannot UPDATE a game directly', Boolean(error) || (data ?? []).length === 0,
      error ? '' : 'the update was accepted');
  }

  {
    const { data, error } = await admin.c
      .from('games')
      .update({ score_a: 98 })
      .eq('id', gameId)
      .select();
    check('not even the admin can UPDATE a game directly', Boolean(error) || (data ?? []).length === 0,
      error ? '' : 'the update was accepted');
  }

  {
    const { error } = await friend.c.from('score_events').insert({
      game_id: gameId, member_id: friendMemberId, score_a: 11, score_b: 0,
    });
    check('a player cannot forge a score_event', Boolean(error));
  }

  {
    const { data, error } = await friend.c.rpc('submit_score', {
      p_game_id: gameId, p_a: 7, p_b: 11,
    });
    check('a player CAN score through submit_score', !error && data?.score_b === 11, error?.message);
  }

  {
    const { data } = await friend.c.from('score_events').select('*').eq('game_id', gameId);
    check('submit_score wrote exactly one audit entry', (data ?? []).length === 1,
      `${(data ?? []).length} entries`);
  }

  {
    const { data } = await admin.c.rpc('submit_score', { p_game_id: gameId, p_a: 11, p_b: 9 });
    const { data: events } = await admin.c.from('score_events').select('*').eq('game_id', gameId);
    const latest = (events ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    check('an admin override is logged like anyone else’s', (events ?? []).length === 2, `${(events ?? []).length}`);
    check('the log captures the previous score', latest?.prev_a === 7 && latest?.prev_b === 11,
      `prev ${latest?.prev_a}-${latest?.prev_b}`);
    check('the override applied', data?.score_a === 11);
  }

  {
    const { error } = await stranger.c.rpc('submit_score', { p_game_id: gameId, p_a: 1, p_b: 1 });
    check('a non-member cannot score at all', Boolean(error));
  }

  /* ------------------------------------------------- 5. players are not admins */
  section('5. A player has no admin powers');

  {
    const { error } = await friend.c
      .from('members')
      .insert({ club_id: clubId, name: 'Smuggled', role: 'player' });
    check('a player cannot add roster members', Boolean(error));
  }

  {
    const { data, error } = await friend.c
      .from('members')
      .update({ role: 'admin' })
      .eq('id', friendMemberId)
      .select();
    check('a player cannot promote themselves', Boolean(error) || (data ?? []).length === 0,
      error ? '' : 'the promotion was accepted');
  }

  {
    const { data, error } = await friend.c.from('sessions').delete().eq('id', sessionId).select();
    check('a player cannot delete a session', Boolean(error) || (data ?? []).length === 0,
      error ? '' : 'the delete was accepted');
  }

  /* ------------------------------------------------------ 6. shared admin */
  section('6. The admin job can be shared');

  {
    const { error } = await friend.c.rpc('set_member_role', {
      p_member_id: friendMemberId, p_role: 'admin',
    });
    check('a player cannot promote themselves through the RPC', Boolean(error),
      error ? '' : 'the promotion was accepted');
  }

  {
    const { error } = await admin.c.rpc('set_member_role', {
      p_member_id: friendMemberId, p_role: 'admin',
    });
    check('an admin can promote a member', !error, error?.message);
  }

  {
    // The whole point of the feature: somebody else can get the games going.
    const { error } = await friend.c.from('sessions').insert({
      id: crypto.randomUUID(), club_id: clubId, name: 'Second admin session',
      date: '2026-08-02', format: 'singles', player_ids: [adminMemberId, friendMemberId],
      num_games: 1, courts: 1, points_to: 11, rng_seed: 2, status: 'live',
    });
    check('the new admin can start a session', !error, error?.message);
  }

  {
    const { error } = await admin.c.rpc('set_member_role', {
      p_member_id: friendMemberId, p_role: 'player',
    });
    check('an admin can hand the job back', !error, error?.message);
  }

  {
    // The lock-out guard. Without it a club can reach a state where nobody can
    // ever start a session again, and there is no way back from it.
    //
    // The message is checked, not just the presence of an error. Accepting any
    // failure let a genuinely broken function pass: `select count(*) ... for
    // update` is invalid SQL, so every demotion raised — and this read as the
    // guard working while "hand the job back" was the only thing failing.
    const { error } = await admin.c.rpc('set_member_role', {
      p_member_id: adminMemberId, p_role: 'player',
    });
    check('the last admin cannot be demoted', /at least one admin/i.test(error?.message ?? ''),
      error ? `refused with the wrong error: ${error.message}` : 'the club was left with no admin');

    const { data: still } = await admin.c
      .from('members').select('role').eq('id', adminMemberId).single();
    check('the refusal left the admin in post', still?.role === 'admin', `role is ${still?.role}`);
  }

  /* --------------------------------------------------------- 7. revocation */
  section('7. Revoking cuts a device off');

  {
    await admin.c.from('invites').update({ revoked: true }).eq('member_id', friendMemberId);
    await admin.c.from('members').update({ user_id: null }).eq('id', friendMemberId);

    const { data } = await friend.c.from('games').select('*').eq('id', gameId);
    check('the revoked device can no longer read the club', (data ?? []).length === 0,
      `${(data ?? []).length} row(s) still visible`);

    const { error } = await friend.c.rpc('submit_score', { p_game_id: gameId, p_a: 3, p_b: 3 });
    check('the revoked device can no longer score', Boolean(error));
  }

  /* ----------------------------------------------------------- 8. throttle */
  section('8. Guessing is throttled');

  {
    // Regression guard. This originally failed because claim_invite raised on a
    // bad code, and the rollback took the attempt counter with it — so guessing
    // was unlimited. The counter only survives if the function *returns*.
    const guesser = await anonUser('guesser');
    let throttledAt = null;
    for (let i = 0; i < 14; i++) {
      const { data } = await guesser.c.rpc('claim_invite', {
        p_code: `PT-ZZZZ-${String(i).padStart(4, '0')}`,
      });
      if (data?.error?.toLowerCase().includes('too many')) {
        throttledAt = i + 1;
        break;
      }
    }
    check('repeated bad guesses get throttled', throttledAt !== null,
      throttledAt === null ? 'never throttled after 14 guesses' : '');
    check('the throttle trips at the 11th attempt', throttledAt === 11,
      throttledAt === null ? 'n/a' : `tripped at ${throttledAt}`);

    // A rejection must still be a rejection, not a silent success.
    const { data: after } = await guesser.c.rpc('claim_invite', { p_code: inviteCode });
    check('a throttled account cannot claim even a valid code', after?.ok === false);
  }
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error(`\n${err.stack}`);
} finally {
  section('Cleanup');
  if (clubId) {
    const { error } = await admin.c.from('clubs').delete().eq('id', clubId);
    check('scratch club removed', !error, error?.message);
  }
  if (strangerClubId) {
    await stranger.c.from('clubs').delete().eq('id', strangerClubId);
  }
}

console.log(
  `\n${passed} passed, ${failures.length} failed` + (failures.length ? `\n\n${failures.map((f) => `  • ${f}`).join('\n')}\n` : '\n')
);
process.exit(failures.length ? 1 : 0);
