'use strict';
// Exclusivamente CI. Cada fase conserva su resultado real; ningún fallo se oculta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { validateChromeSandboxStatus } = require('./chrome-sandbox-status.cjs');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const { Pool } = require(path.join(backend, 'node_modules/pg'));
const { assertRunner, serviceFixture, serviceConfig } = require(path.join(backend, 'test/helpers/predeploy02Service'));
assertRunner();
assert.equal(process.versions.node, '20.20.2');
assert.equal(execFileSync('id', ['-un'], { encoding: 'utf8' }).trim(), 'clinical-ci');
const candidate = '74a458a6e9621c74982c1de13ee1ee2ef99fa7a7';
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
assert.equal(git(['rev-parse', 'HEAD']), process.env.GITHUB_SHA);
git(['merge-base', '--is-ancestor', candidate, 'HEAD']);
git(['diff', '--exit-code', candidate, '--', 'backend/src', 'frontend/src',
  'backend/package.json', 'backend/package-lock.json', 'frontend/package.json', 'frontend/package-lock.json']);

const out = path.join(root, 'tmp_predeploy02/evidence');
const logs = path.join(root, 'tmp_predeploy02/logs');
const node24 = path.join(process.env.PREDEPLOY_NODE24_BIN, 'node');
const node24Version = execFileSync(node24, ['--version'], { encoding: 'utf8' }).trim();
assert.match(node24Version, /^v24\./);
// No se admiten evidencias anteriores como resultado de esta ejecución.
assert.equal(fs.existsSync(out), false);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(logs, { recursive: true });
const report = { synthetic_only: true, production_access: false, candidate,
  sha: process.env.GITHUB_SHA, branch: process.env.GITHUB_REF,
  run_id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
  started_utc: new Date().toISOString(), phases: [], versions: {}, status: 'running',
  visual_review: 'pending human review of Linux renders', real_restore: 'out of scope' };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = () => fs.writeFileSync(path.join(out, 'run-summary.json'), JSON.stringify(report, null, 2) + '\n');
write();

async function phase(name, executable, args, cwd, extra = {}, noSkips = false, runtime = process.version) {
  const start = new Date().toISOString();
  const logPath = path.join(logs, `${name}.log`);
  const fd = fs.openSync(logPath, 'w');
  const env = { ...process.env, ...extra };
  const result = await new Promise(resolve => {
    const child = spawn(executable, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Puede haber terminado. */ }
    }, 10 * 60 * 1000);
    child.once('error', () => { clearTimeout(timer); resolve({ code: null, signal: 'spawn_error' }); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  fs.closeSync(fd);
  const text = fs.readFileSync(logPath, 'utf8');
  const counts = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
    const match = [...text.matchAll(new RegExp(`^# ${field} (\\d+)`, 'gm'))].at(-1);
    if (match) counts[field] = Number(match[1]);
  }
  if (name === 'frontend-dom') {
    const jsonPath = path.join(logs, 'vitest.json');
    if (fs.existsSync(jsonPath)) {
      const result = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      Object.assign(counts, { tests: result.numTotalTests, pass: result.numPassedTests,
        fail: result.numFailedTests, skipped: result.numPendingTests + (result.numTodoTests || 0),
        suite_errors: result.numFailedTestSuites, cancelled: 0 });
    }
  }
  // Los opt-in seleccionados no pueden quedar verdes por omisión.
  const complete = !noSkips || (counts.tests > 0 && counts.pass > 0 && counts.skipped === 0 && counts.fail === 0 && counts.cancelled === 0);
  const row = { name, started_utc: start, finished_utc: new Date().toISOString(),
    runtime, duration_ms: Date.now() - Date.parse(start),
    command: [executable === process.execPath ? 'node' : path.basename(executable), ...args],
    exit_code: result.code, signal: result.signal, counts, required_no_skips: noSkips,
    failed_tests: text.split('\n').filter(line => /^\s*not ok \d+ - /.test(line)).slice(0, 30),
    status: result.code === 0 && complete ? 'passed' : 'failed' };
  report.phases.push(row); write();
  console.log(`${name}: ${row.status}; exit=${result.code}; ${JSON.stringify(counts)}`);
  // Logs crudos solo en el disco efímero; no se publican cuerpos HTTP/tokens.
  return row.status === 'passed';
}

async function main() {
  // Direcciones reservadas para documentación: el firewall debe rechazar antes
  // de cualquier acceso exterior; nunca se prueba un endpoint del CAP.
  for (const host of ['192.0.2.1', '2001:db8::1']) {
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host, port: 443 });
      socket.setTimeout(2000);
      socket.once('connect', () => { socket.destroy(); reject(new Error('Unexpected egress')); });
      socket.once('timeout', () => { socket.destroy(); reject(new Error('Firewall rejection not demonstrated')); });
      socket.once('error', error => ['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM'].includes(error.code) ? resolve() : reject(error));
    });
  }
  report.external_network = 'blocked for test UID (IPv4 and IPv6 probes)';
  report.preflight_stage = 'postgres'; write();
  const db = new Pool(serviceConfig);
  try {
    const row = (await db.query(`SELECT version() version, current_database() db,
      current_setting('server_version_num')::int num, current_setting('cap.predeploy02') marker,
      current_setting('data_directory') directory`)).rows[0];
    assert.equal(row.db, 'cap_predeploy02_control');
    assert.equal(row.num, 160015);
    assert.equal(row.marker, 'synthetic-only');
    assert.equal(row.directory, '/var/lib/postgresql/data');
    report.versions.postgresql = row.version;
  } finally { await db.end(); }
  report.versions.node = process.version;
  report.versions.node_frontend_dom = node24Version;
  report.versions.python = execFileSync(process.env.PREDEPLOY_PYTHON, ['--version'], { encoding: 'utf8' }).trim();
  report.versions.npm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  report.versions.runner = { image_os: process.env.ImageOS, image_version: process.env.ImageVersion,
    os_release: fs.readFileSync('/etc/os-release', 'utf8'), postgres_image: process.env.PREDEPLOY_POSTGRES_IMAGE };
  assert.match(report.versions.runner.os_release, /^ID=ubuntu$/m);
  assert.match(report.versions.runner.os_release, /^VERSION_ID="24\.04"$/m);
  report.versions.puppeteer = require(path.join(backend, 'node_modules/puppeteer/package.json')).version;
  report.versions.frontend_tools = Object.fromEntries(['vite', 'vitest', 'jsdom'].map(name => {
    const pkg = require(path.join(root, `frontend/node_modules/${name}/package.json`));
    return [name, { version: pkg.version, engines: pkg.engines }];
  }));
  report.integrity = {
    locks: ['backend/package-lock.json', 'frontend/package-lock.json'].map(file => ({ file, sha256: hash(path.join(root, file)) })),
    migrations: fs.readdirSync(path.join(backend, 'src/db/migrations')).filter(file => /\.sql$/.test(file)).sort()
      .map(file => ({ file, sha256: hash(path.join(backend, 'src/db/migrations', file)) })),
  };
  write();
  const manager = require(path.join(backend, 'src/services/puppeteerBrowserManager')).createPuppeteerBrowserManager();
  try {
    report.preflight_stage = 'chrome-launch'; write();
    const browser = await manager.getBrowser();
    report.versions.chrome = await browser.version();
    assert.match(report.versions.chrome, /148\.0\.7778\.97$/);
    assert.ok(!browser.process().spawnargs.some(arg => /^--(?:no-sandbox|disable-setuid-sandbox|disable-namespace-sandbox|disable-seccomp-filter-sandbox)/.test(arg)));
    const page = await browser.newPage();
    report.preflight_stage = 'chrome-sandbox'; write();
    await page.goto('chrome://sandbox');
    const sandbox = await page.$eval('body', element => element.innerText);
    report.chrome_sandbox_checks = validateChromeSandboxStatus(sandbox);
    report.chrome_sandbox = sandbox;
    await page.close();
  } finally { await manager.close(); write(); }

  report.preflight_stage = 'complete'; write();
  await phase('backend', 'npm', ['test'], backend);
  const frontend = path.join(root, 'frontend');
  const logicFiles = fs.readdirSync(path.join(frontend, 'test')).filter(file => file.endsWith('.test.js')).sort().map(file => `test/${file}`);
  await phase('frontend-logic', process.execPath, ['--test', ...logicFiles], frontend, {}, true);
  await phase('frontend-dom', node24, ['node_modules/vitest/vitest.mjs', 'run', 'test-dom',
    '--reporter=json', `--outputFile=${path.join(logs, 'vitest.json')}`], frontend,
    { PATH: `${process.env.PREDEPLOY_NODE24_BIN}:${process.env.PATH}` }, true, node24Version);
  await phase('lint', 'npm', ['run', 'lint'], path.join(root, 'frontend'));
  await phase('build', 'npm', ['run', 'build'], path.join(root, 'frontend'), { NODE_ENV: 'production' });
  const evidence = { CPREN_CHECKPOINT14: '1', CPREN_CHECKPOINT13: '1', CPREN_CHECKPOINT13B: '1' };
  await phase('pdf-samples', process.execPath, ['--test', '--test-concurrency=1',
    'test/notaClinicaPdf.test.js', 'test/notaClinicaPdfCheckpoint13.test.js'], backend,
  { ...evidence, RUN_CHECKPOINT13_PDF: '1', RUN_NOTA_PDF_BROWSER: '1' }, true);
  const files = { checkpoint10: 'checkpoint10MigracionesPostgres', checkpoint14: 'checkpoint14MigracionesPostgres',
    catalogos: 'catalogosPostgres', perfiles: 'perfilesProfesionalesPostgres',
    autoria: 'autoriaClinicaPostgres', notas: 'notasClinicasPostgres', seguimiento: 'seguimientoNotasPostgres' };
  for (const [suite, file] of Object.entries(files)) {
    await phase(suite, process.execPath, ['--test', '--test-concurrency=1', `test/${file}.test.js`], backend,
      { ...evidence, [`RUN_${suite.toUpperCase()}_TEMP_POSTGRES`]: '1',
        [`${suite.toUpperCase()}_POSTGRES_BIN`]: '/usr/lib/postgresql/16/bin',
        ...(suite === 'perfiles' ? { RUN_PERFILES_BROWSER: '1' } : {}),
        ...(suite === 'seguimiento' ? { RUN_SEGUIMIENTO_BROWSER: '1', RUN_NOTAS_11_BROWSER: '1' } : {}),
      }, true);
  }
  const config = {};
  const auth = serviceFixture('auth', config);
  try {
    await auth.start();
    const { migrate } = require(path.join(backend, 'src/db/migrate'));
    const migration = await migrate({ db: new Pool(config), logger: { log() {}, error() {} }, setExitCode() {} });
    assert.equal(migration.ok, true);
    await phase('auth-sessions', process.execPath, ['--test', '--test-concurrency=1', 'test/sessionActivityPostgres.test.js'], backend,
      { RUN_POSTGRES_INTEGRATION: '1', DB_HOST: config.host, DB_PORT: String(config.port),
        DB_USER: config.user, DB_PASSWORD: config.password, DB_NAME: config.database, DB_SSL: 'false',
        JWT_SECRET: 'synthetic-predeploy02-auth-only-2026-ci' }, true);
  } finally { await auth.close(); }
  const url = new URL('postgresql://127.0.0.1:55432/cap_predeploy02_control');
  url.username = serviceConfig.user; url.password = serviceConfig.password;
  await phase('citas-postgres', process.execPath, ['--test', 'test/citasPrenatalesPostgres.test.js'], backend,
    { RUN_POSTGRES_CITAS: '1', CITAS_TEMP_CLUSTER: '1', CITAS_TEST_DATABASE_URL: url.href }, true);
  await phase('pdf-geometry', process.env.PREDEPLOY_PYTHON,
    ['backend/scripts/verifyCheckpoint14Pdf.py', '--output', out, '--ci'], root, {}, false, report.versions.python);
  // No se suben directorios generales, bases, dumps, .env, logs ni dist.
  const manifest = [];
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      assert.ok(!item.isSymbolicLink());
      if (item.isDirectory()) visit(file);
      else {
        assert.match(item.name, /\.(json|png|pdf)$/);
        if (item.name.endsWith('.json')) {
          const content = fs.readFileSync(file, 'utf8');
          assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[a-zA-Z0-9_]+|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(content));
        }
        manifest.push({ file: path.relative(out, file), bytes: fs.statSync(file).size, sha256: hash(file) });
      }
    }
  }
  report.status = report.phases.every(row => row.status === 'passed') ? 'passed' : 'failed';
  report.finished_utc = new Date().toISOString(); write();
  visit(out);
  fs.writeFileSync(path.join(out, 'artifact-manifest.json'), JSON.stringify({ synthetic_only: true, files: manifest }, null, 2) + '\n');
  fs.cpSync(out, path.join(root, 'tmp_predeploy02/publish'), { recursive: true, errorOnExist: true });
  if (report.status !== 'passed') process.exitCode = 1;
}

main().catch(error => {
  report.status = 'failed';
  report.failure = { type: error.name, code: error.code || 'PREDEPLOY02_PREFLIGHT_OR_HARNESS',
    message: String(error.message).replace(/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/synthetic-predeploy02-(?:auth-only-2026-ci|only)/g, '[SYNTHETIC_CREDENTIAL]').slice(0, 1000) };
  report.finished_utc = new Date().toISOString(); write();
  // Si falla preflight o el filtro de publicación, solo se entrega el resumen.
  const publish = path.join(root, 'tmp_predeploy02/publish');
  fs.mkdirSync(publish, { recursive: true });
  fs.copyFileSync(path.join(out, 'run-summary.json'), path.join(publish, 'run-summary.json'));
  console.error(`PREDEPLOY-02 failed: ${report.failure.code}`);
  process.exitCode = 1;
});
