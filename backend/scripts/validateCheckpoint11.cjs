// Explicit opt-ins only: each selected suite creates and verifies its own initdb.
// No application .env or configurable database target is passed to the children.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const evidence = path.join(root, 'docs/cpren120/checkpoint12');
const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const suites = {
  migrations: ['checkpoint10MigracionesPostgres.test.js', 'CHECKPOINT10'],
  catalogs: ['catalogosPostgres.test.js', 'CATALOGOS'],
  profiles: ['perfilesProfesionalesPostgres.test.js', 'PERFILES', 'RUN_PERFILES_BROWSER'],
  authorship: ['autoriaClinicaPostgres.test.js', 'AUTORIA'],
  notes: ['notasClinicasPostgres.test.js', 'NOTAS'],
  tracking: ['seguimientoNotasPostgres.test.js', 'SEGUIMIENTO', 'RUN_SEGUIMIENTO_BROWSER', 'RUN_NOTAS_11_BROWSER'],
  pdf: ['notaClinicaPdf.test.js', null, 'RUN_NOTA_PDF_BROWSER'],
};
const name = process.argv[2];
if (!Object.hasOwn(suites, name)) throw Error('Select an explicit disposable suite: ' + Object.keys(suites).join(', '));
const [file, prefix, ...flags] = suites[name];
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(RUN_|DB_|PG|DATABASE_URL$|JWT_|SESSION_|ACCESS_TOKEN_|VITE_)/i.test(key)) delete env[key];
}
Object.assign(env, { NODE_ENV: 'test', CPREN_CHECKPOINT12: '1',
  PUPPETEER_EXECUTABLE_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
if (prefix) Object.assign(env, { [`RUN_${prefix}_TEMP_POSTGRES`]: '1', [`${prefix}_POSTGRES_BIN`]: bin });
for (const flag of flags) env[flag] = '1';
fs.mkdirSync(evidence, { recursive: true });
const log = fs.openSync(path.join(evidence, `${name}.log`), 'w');
const started = new Date().toISOString();
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', `test/${file}`], {
  cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: ['ignore', log, log],
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code, signal) => {
  fs.closeSync(log);
  const result = { suite: name, command: `node --test --test-concurrency=1 test/${file}`, started,
    finished: new Date().toISOString(), exit_code: code, signal, machine: 'HUGUITO', equipo: 'Casa',
    synthetic_only: true, disposable_postgres_only: Boolean(prefix) };
  fs.writeFileSync(path.join(evidence, `${name}-result.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  console.log(fs.readFileSync(path.join(evidence, `${name}.log`), 'utf8').split('\n').slice(-24).join('\n'));
  process.exitCode = code ?? 1;
});
