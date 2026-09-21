/**
 * The suite writes real rows through the admin API and removes them in
 * `finally` blocks. A cancelled or crashed run skips those, and the leftovers
 * are public: a stray `E2E12345` residence changes the inventory, prices and
 * sitemap. So fixtures carry recognisable names and are swept before and after
 * every run, and on demand with `pnpm test:e2e:purge`.
 */

/** Residence codes the specs mint: E2E + 5 digits, Z/Q + 4 digits. Seeded codes are `P-…`/`V-…`. */
export const FIXTURE_RESIDENCE = /^(E2E\d{5}|Z\d{4}|Q\d{4})$/;
/** Content rows the specs create are labelled starting with "E2E ". */
export const FIXTURE_LABEL = /^E2E /;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Refuse to run against anything but a local stack. The suite mutates whatever
 * it points at and clears the shared rate-limit counters, which on a staging or
 * production host is data loss and a disabled brute-force limit.
 */
export function assertLocalTarget(env = process.env) {
  if (env.E2E_ALLOW_REMOTE === '1') return;
  for (const name of ['E2E_API_URL', 'E2E_WEB_URL', 'DATABASE_URL', 'REDIS_URL']) {
    const value = env[name];
    if (!value) continue;
    let host;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${name} is not a URL; refusing to run the E2E suite against it.`);
    }
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(
        `${name} points at ${host}. The E2E suite writes and deletes data and clears rate limits, ` +
          'so it only runs against a local stack. Set E2E_ALLOW_REMOTE=1 for a disposable environment.',
      );
    }
  }
}

/**
 * Archives (which hides from the website) and, where the API allows it, deletes
 * every leftover fixture. `session` is the owner's cookie header and CSRF token.
 * @param {string} api
 * @param {{ cookie: string; csrf: string }} session
 * @returns {Promise<string[]>}
 */
export async function sweepFixtures(api, session) {
  const base = `${api}/api/v1`;
  const headers = { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json' };
  const call = (method, path) => fetch(`${base}${path}`, { method, headers, body: method === 'POST' ? '{}' : undefined });
  const list = async (path) => {
    const res = await call('GET', path);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    const body = await res.json();
    return Array.isArray(body) ? body : body.data;
  };

  const removed = [];
  for (const archived of ['false', 'true']) {
    for (const r of await list(`/admin/residences?archived=${archived}&pageSize=500`)) {
      if (!FIXTURE_RESIDENCE.test(r.code)) continue;
      if (archived === 'false') await call('POST', `/admin/residences/${r.id}/archive`);
      // Refused when history exists (an enquiry, say); archived is then the safe end state.
      const del = await call('DELETE', `/admin/residences/${r.id}`);
      removed.push(`residence ${r.code}${del.ok ? '' : ' (archived)'}`);
    }
  }
  for (const [path, field] of [
    ['/admin/amenities', 'name'],
    ['/admin/faqs', 'question'],
    ['/admin/specifications', 'label'],
  ]) {
    for (const r of await list(path)) {
      if (!FIXTURE_LABEL.test(String(r[field] ?? ''))) continue;
      if ((await call('DELETE', `${path}/${r.id}`)).ok) removed.push(`${path.split('/').pop()} ${r[field]}`);
    }
  }
  return removed;
}

/** Cookie header and CSRF token from a Playwright storage-state object. */
export function sessionFromState(state) {
  return {
    cookie: state.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    csrf: state.cookies.find((c) => c.name === 'avida_csrf')?.value ?? '',
  };
}
