import { describe, it, expect } from 'vitest';
import { describeUrlProblem } from './supabaseClient.js';

// Regression guard for a mistake that actually shipped.
//
// The dashboard address (supabase.com/dashboard/project/<ref>) was pasted into
// VITE_SUPABASE_URL instead of the API address (https://<ref>.supabase.co).
// The build succeeded, the CI check passed — it derived the host from the wrong
// URL and then confirmed that host was in the bundle, which is circular — and
// the deployed app reached nothing at all while looking perfectly healthy.

describe('describeUrlProblem', () => {
  it('accepts a normal project URL', () => {
    expect(describeUrlProblem('https://thszhbezmxsxqsryqgrg.supabase.co')).toBeNull();
  });

  it('accepts a trailing slash', () => {
    expect(describeUrlProblem('https://abcdefgh.supabase.co/')).toBeNull();
  });

  it('accepts a custom domain', () => {
    // Supabase supports custom domains, so the rule is "bare host", not
    // "must end in supabase.co".
    expect(describeUrlProblem('https://db.example.com')).toBeNull();
  });

  it('rejects the dashboard URL and names the right one', () => {
    const problem = describeUrlProblem('https://supabase.com/dashboard/project/thszhbezmxsxqsryqgrg');
    expect(problem).toBeTruthy();
    expect(problem).toContain('https://thszhbezmxsxqsryqgrg.supabase.co');
  });

  it('rejects a dashboard URL with extra path segments', () => {
    const problem = describeUrlProblem(
      'https://supabase.com/dashboard/project/abcdefgh/settings/api'
    );
    expect(problem).toContain('https://abcdefgh.supabase.co');
  });

  it('rejects a URL with a path glued on', () => {
    expect(describeUrlProblem('https://abcdefgh.supabase.co/rest/v1')).toBeTruthy();
  });

  it('rejects plain http', () => {
    expect(describeUrlProblem('http://abcdefgh.supabase.co')).toBeTruthy();
  });

  it('rejects a bare project ref', () => {
    expect(describeUrlProblem('thszhbezmxsxqsryqgrg')).toBeTruthy();
  });

  it('says nothing when no URL is configured at all', () => {
    // Unset is not a misconfiguration — it is single-device mode, which is a
    // supported way to run the app.
    expect(describeUrlProblem('')).toBeNull();
    expect(describeUrlProblem(undefined)).toBeNull();
  });
});
