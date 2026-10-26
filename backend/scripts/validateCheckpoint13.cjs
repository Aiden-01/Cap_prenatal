// Suites explícitas; ninguna acepta una URL de base persistente.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const checkpoint13b = process.argv[3] === '--checkpoint13b';
const out = path.join(root, 'docs/cpren120', checkpoint13b ? 'checkpoint13b' : 'checkpoint13');
const selection = process.argv[2];
const suites = {
  samples: ['test/notaClinicaPdfCheckpoint13.test.js', 'test/notaClinicaPdf.test.js'],
  notes: ['test/notasClinicasPostgres.test.js'],
  tracking: ['test/seguimientoNotasPostgres.test.js'],
  unit: ['test/notaClinicaPdf.test.js', 'test/notaClinicaPdfCheckpoint13.test.js', 'test/notaClinicaPdfHttp.test.js', 'test/notasClinicasService.test.js'],
};
if (!Object.hasOwn(suites, selection)) throw Error('Elegir samples, notes, tracking o unit');
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(RUN_|DB_|PG|DATABASE_URL$|JWT_|SESSION_|ACCESS_TOKEN_|VITE_|CPREN_CHECKPOINT)/i.test(key)) delete env[key];
Object.assign(env, { NODE_ENV: 'test', CPREN_CHECKPOINT13: '1', PUPPETEER_EXECUTABLE_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
if (checkpoint13b) env.CPREN_CHECKPOINT13B = '1';
if (selection === 'samples') Object.assign(env, { RUN_CHECKPOINT13_PDF: '1', RUN_NOTA_PDF_BROWSER: '1' });
if (selection === 'notes' || selection === 'tracking') {
  const prefix = selection === 'notes' ? 'NOTAS' : 'SEGUIMIENTO';
  Object.assign(env, { [`RUN_${prefix}_TEMP_POSTGRES`]: '1', [`${prefix}_POSTGRES_BIN`]: 'C:\\Program Files\\PostgreSQL\\18\\bin' });
}
fs.mkdirSync(out, { recursive: true });
const log = fs.openSync(path.join(out, `${selection}.log`), 'w');
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...suites[selection]], { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: ['ignore', log, log] });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  fs.closeSync(log);
  fs.writeFileSync(path.join(out, `${selection}-result.json`), JSON.stringify({ selection, exit_code: code, equipo: 'Casa', machine: 'HUGUITO', synthetic_only: true, finished_utc: new Date().toISOString() }, null, 2) + '\n');
  console.log(fs.readFileSync(path.join(out, `${selection}.log`), 'utf8').split('\n').slice(-24).join('\n'));
  process.exitCode = code ?? 1;
});
