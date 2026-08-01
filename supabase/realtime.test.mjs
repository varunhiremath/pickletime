// Verifies realtime delivery against a LIVE Supabase project.
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node supabase/realtime.test.mjs
//
// This is the claim the whole rebuild rests on: a friend enters a score on their
// phone and everyone else's standings move, without anybody refreshing. RLS is
// checked by rls.test.mjs; this checks that the change actually arrives — and,
// just as importantly, that it does NOT arrive for someone outside the club.
//
// Not part of `npm test`: it needs a real database.

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(2);
}

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  [32m✓[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  [31m✗[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function anonUser(label) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) {
    console.error(`Could not sign in (${label}): ${error.message}`);
    process.exit(2);
  }
  // Realtime authenticates separately from REST — without this the channel
  // connects as `anon` and RLS filters every row out, which looks exactly like
  // "realtime is broken".
  await c.realtime.setAuth(data.session.access_token);
  return c;
}

/** Subscribe and resolve once the channel is actually live. */
function subscribe(client, name, onEvent) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: channel never subscribed`)), 15000);
    const ch = client
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, onEvent)
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(ch);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error(`${name}: ${status} ${err?.message ?? ''}`));
        }
      });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Checking realtime against ${url}\n`);

const admin = await anonUser('admin');
const friend = await anonUser('friend');
const stranger = await anonUser('stranger');

let clubId = null;
let strangerClubId = null;
let adminChannel = null;
let strangerChannel = null;

try {
  console.log('Setup');

  const { data: created, error: cErr } = await admin.rpc('create_club', {
    p_name: 'Realtime scratch club',
    p_admin_name: 'Admin',
  });
  check('club created', !cErr && created?.club?.id, cErr?.message);
  if (cErr) throw new Error('cannot continue');
  clubId = created.club.id;
  const adminMemberId = created.member.id;

  // A club the stranger belongs to, so their realtime subscription is a fair
  // test: they ARE authenticated and DO have a club — just not this one.
  const { data: otherClub } = await stranger.rpc('create_club', {
    p_name: 'Realtime unrelated club',
    p_admin_name: 'Stranger',
  });
  strangerClubId = otherClub?.club?.id ?? null;

  const { data: memberRow } = await admin
    .from('members')
    .insert({ club_id: clubId, name: 'Friend', role: 'player', color_index: 1 })
    .select()
    .single();
  const friendMemberId = memberRow.id;

  const code = `PT-RT${Math.random().toString(36).slice(2, 4).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  await admin.from('invites').insert({ club_id: clubId, member_id: friendMemberId, code });

  const { data: claim } = await friend.rpc('claim_invite', { p_code: code });
  check('friend claimed the invite', claim?.member?.id === friendMemberId, JSON.stringify(claim));
  check('claim_invite returns the {ok:true} contract',
    claim?.ok === true,
    'deployed function is the older raising version — re-run supabase/functions.sql');

  const sessionId = crypto.randomUUID();
  await admin.from('sessions').insert({
    id: sessionId, club_id: clubId, name: 'Scratch', date: '2026-08-01',
    format: 'singles', player_ids: [adminMemberId, friendMemberId],
    num_games: 5, courts: 1, points_to: 11, rng_seed: 1, status: 'live',
  });

  // Several games, so latency can be sampled rather than judged on one event.
  const gameIds = [];
  for (let i = 1; i <= 5; i++) {
    const id = crypto.randomUUID();
    gameIds.push(id);
    const { error } = await admin.from('games').insert({
      id, session_id: sessionId, ordinal: i, round: i, court: 1,
      team_a: [adminMemberId], team_b: [friendMemberId], byes: [],
    });
    if (error) throw new Error(`game ${i}: ${error.message}`);
  }
  check('games created', true);
  const gameId = gameIds[0];

  /* ------------------------------------------------ the actual test */
  console.log('\n1. A score reaches the other phone');

  const adminEvents = [];
  const strangerEvents = [];

  adminChannel = await subscribe(admin, 'admin-watch', (p) => adminEvents.push(p));
  check('admin channel subscribed', true);

  strangerChannel = await subscribe(stranger, 'stranger-watch', (p) => strangerEvents.push(p));
  check('stranger channel subscribed', true);

  // Give both channels a moment to settle before generating traffic.
  await wait(500);

  /** Score a game and time how long the change takes to arrive. */
  async function timeDelivery(id, a, b) {
    const t0 = Date.now();
    const { error } = await friend.rpc('submit_score', { p_game_id: id, p_a: a, p_b: b });
    if (error) return { error: error.message };
    // 20s, because this must distinguish "lost" from "slow". A short window
    // would report a delayed event as a lost one, which is a far more alarming
    // claim than the evidence supports.
    for (let i = 0; i < 800; i++) {
      if (adminEvents.some((e) => e.new?.id === id)) return { ms: Date.now() - t0 };
      await wait(25);
    }
    return { ms: null };
  }

  // The first event on a freshly-opened channel is judged on DELIVERY, not
  // speed. Two probes established that events are not lost: firing with zero
  // settle delay still delivered in 646ms, and a 5s bound failed once purely on
  // network variance. So this assertion answers "did it arrive at all", and the
  // steady-state check below carries the latency bar. Holding a cold channel to
  // a tight bound only produces flaky failures that misrepresent what a user
  // experiences during a session.
  //
  // It matters little in the app either way: RootBoot loads the store on mount,
  // so anything missed while the socket is still connecting is already on screen.
  const first = await timeDelivery(gameId, 11, 7);
  check('the admin received the change without reloading', first.ms !== null,
    first.error ?? (first.ms === null ? 'nothing arrived in 20s' : ''));
  if (first.ms !== null) console.log(`      (cold channel: ${first.ms}ms)`);

  const received = adminEvents.find((e) => e.new?.id === gameId);
  check('the payload carries the new score',
    received?.new?.score_a === 11 && received?.new?.score_b === 7,
    received ? `${received.new?.score_a}-${received.new?.score_b}` : 'no payload');

  // Steady state: what it feels like once a session is under way.
  const samples = [];
  for (let i = 1; i < gameIds.length; i++) {
    const r = await timeDelivery(gameIds[i], 11, i);
    if (r.ms !== null) samples.push(r.ms);
    await wait(300);
  }
  const median = samples.slice().sort((x, y) => x - y)[Math.floor(samples.length / 2)];
  check(`steady-state delivery feels live (median ${median}ms of ${samples.join(', ')}ms)`,
    samples.length >= 3 && median < 1500, `median ${median}ms`);

  /* ------------------------------------------------ the inverse */
  console.log('\n2. It does NOT reach someone outside the club');

  // Realtime respects RLS. If it did not, anyone holding the publishable key
  // could subscribe and watch every club's scores in real time.
  await wait(1000);
  check('the stranger received nothing', strangerEvents.length === 0,
    `${strangerEvents.length} event(s) leaked`);

  /* ------------------------------------------------ updates too */
  console.log('\n3. Corrections propagate as well as first entries');

  const before = adminEvents.length;
  await admin.rpc('submit_score', { p_game_id: gameId, p_a: 11, p_b: 9 });

  let corrected = false;
  for (let i = 0; i < 200; i++) {
    if (adminEvents.length > before && adminEvents.some((e) => e.new?.id === gameId && e.new?.score_b === 9)) {
      corrected = true;
      break;
    }
    await wait(25);
  }
  check('a corrected score propagates too', corrected);
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error(`\n${err.stack}`);
} finally {
  console.log('\nCleanup');
  if (adminChannel) await admin.removeChannel(adminChannel);
  if (strangerChannel) await stranger.removeChannel(strangerChannel);
  if (clubId) {
    const { error } = await admin.from('clubs').delete().eq('id', clubId);
    check('scratch club removed', !error, error?.message);
  }
  if (strangerClubId) await stranger.from('clubs').delete().eq('id', strangerClubId);
}

console.log(
  `\n${passed} passed, ${failures.length} failed` +
    (failures.length ? `\n\n${failures.map((f) => `  • ${f}`).join('\n')}\n` : '\n')
);
process.exit(failures.length ? 1 : 0);
