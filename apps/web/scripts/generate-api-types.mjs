import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from './api-types/node_modules/openapi-typescript/dist/index.mjs';

// Export the real FastAPI schema locally. No server, database connection or credentials are needed.
const api = fileURLToPath(new URL('../../api/', import.meta.url));
const localPython = `${api}/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`;
const python = process.env.API_PYTHON || (existsSync(localPython) ? localPython : 'python');
const exported = spawnSync(
  python,
  [
    '-c',
    `
import json, os
for key in list(os.environ):
    if key.upper().startswith(('SUPABASE_', 'DATABASE_', 'PIELE_')) or key.upper() == 'ENVIRONMENT':
        del os.environ[key]
from app.config import Settings
# Prevent the module-level app from reading a developer's .env file.
import app.config
app.config.get_settings = lambda: Settings(_env_file=None, environment='local')
from app.main import create_app
print(json.dumps(create_app(app.config.get_settings()).openapi()))
`,
  ],
  {
    cwd: api,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (exported.status !== 0)
  throw new Error(exported.stderr || 'Could not export OpenAPI. Run setup:api first.');
const ast = await openapiTS(JSON.parse(exported.stdout), { immutable: true, alphabetize: true });
const content =
  '// Generated from the Python API OpenAPI schema. Run npm run generate:api.\n' + astToString(ast);
const target = new URL('../src/app/core/api/generated.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== content) {
    throw new Error('API types are stale. Run npm run generate:api and commit the result.');
  }
  console.log('API types match the backend OpenAPI schema.');
} else {
  writeFileSync(target, content);
  console.log('Generated src/app/core/api/generated.ts');
}
