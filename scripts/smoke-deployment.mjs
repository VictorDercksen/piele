// Post-deployment smoke check for one environment (plan section 10 and AT19).
// Usage:
//   node scripts/smoke-deployment.mjs --web https://<web-origin> --api https://<api-origin> [--environment production]
// A protected web deployment needs VERCEL_AUTOMATION_BYPASS_SECRET (Vercel > Deployment
// Protection > Protection Bypass for Automation). Exits non-zero when any check fails.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    web: { type: 'string' },
    api: { type: 'string' },
    environment: { type: 'string', default: 'production' },
  },
});
if (!values.web || !values.api) {
  console.error('Usage: node scripts/smoke-deployment.mjs --web <origin> --api <origin> [--environment production]');
  process.exit(2);
}
const web = new URL(values.web).origin;
const api = new URL(values.api).origin;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const webHeaders = bypass ? { 'x-vercel-protection-bypass': bypass } : {};

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}
async function get(url, headers = {}, method = 'GET') {
  return fetch(url, { method, headers, redirect: 'manual' });
}

// API
const health = await get(`${api}/v1/health`, { Origin: web });
const body = await health.json().catch(() => ({}));
check('API health responds 200', health.status === 200, `status ${health.status}`);
check(`API environment is ${values.environment}`, body.environment === values.environment, body.environment);
check('API reaches the database', body.database === 'ok', body.database);
check('Snapshot cache table exists', body.snapshotCache === 'database', body.snapshotCache);
check('CORS allows the web origin', health.headers.get('access-control-allow-origin') === web);
check('API responses are not cached', health.headers.get('cache-control') === 'no-store');
check('API returns a request ID', !!health.headers.get('x-request-id'));

const foreign = await get(
  `${api}/v1/health`,
  { Origin: 'https://smoke-test.invalid', 'Access-Control-Request-Method': 'GET' },
  'OPTIONS',
);
check('CORS rejects other origins', !foreign.headers.get('access-control-allow-origin'));

// 401 with the agent token configured, 503 before it is set; never open.
const agent = await get(`${api}/v1/agent/fixtures/due`);
check('Agent routes require the agent token', [401, 503].includes(agent.status), `status ${agent.status}`);

if (values.environment === 'production') {
  const docs = await get(`${api}/docs`);
  check('Interactive API docs are off', docs.status === 404, `status ${docs.status}`);
}

// Web
const root = await get(`${web}/`, webHeaders);
if ([401, 302, 307].includes(root.status) && !bypass) {
  check('Web deployment is reachable', false, 'protected: set VERCEL_AUTOMATION_BYPASS_SECRET');
} else {
  const html = await root.text();
  check('Web root responds 200', root.status === 200, `status ${root.status}`);
  check('Web sends a Content-Security-Policy', !!root.headers.get('content-security-policy'));
  check('Web sends HSTS', !!root.headers.get('strict-transport-security'));

  const deep = await get(`${web}/duties?round=2`, webHeaders);
  const deepHtml = await deep.text();
  check('Deep link returns the app shell', deep.status === 200 && deepHtml.includes('<app-root'));

  const missing = await get(`${web}/assets/images/smoke-missing.png`, webHeaders);
  check('Missing asset returns 404', missing.status === 404, `status ${missing.status}`);

  const script = html.match(/<script src="([^"]+\.js)"/)?.[1];
  const bundle = script ? await get(`${web}/${script}`, webHeaders) : null;
  check('Main bundle is served', bundle?.status === 200, script ?? 'no script tag');
  const code = bundle ? await bundle.text() : '';
  check('Bundle targets this API', code.includes(api), api);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
