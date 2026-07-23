const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const {
  createAutomationOriginMiddleware,
} = require('../src/middleware/automationSecurity');
const { createStrictTrustProxy } = require('../src/utils/proxyTrust');
const {
  ConfigError,
  validateTrustedProxyCidrs,
} = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
const productionCompose = read('docker-compose.production.example.yml');
const localCompose = read('docker-compose.yml');
const nginx = read('frontend', 'nginx.conf');
const localScript = read('scripts', 'start-n8n-local.ps1');

function serviceBlock(source, serviceName) {
  const lines = source.split(/\r?\n/);
  const marker = `  ${serviceName}:`;
  const start = lines.findIndex((line) => line === marker);
  assert.notEqual(start, -1, `Servicio ausente: ${serviceName}`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) || /^  [a-zA-Z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function healthcheckBlock(service) {
  const lines = service.split(/\r?\n/);
  const start = lines.findIndex((line) => /^    healthcheck:\s*$/.test(line));
  assert.notEqual(start, -1, 'Health check ausente');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^    [a-zA-Z0-9_-]+:\s*/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

async function withServer(app, callback) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(
      (error) => (error ? reject(error) : resolve())
    ));
  }
}

test('imagen y dependencia n8n quedan fijadas exactamente en 2.26.4', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const rootLock = JSON.parse(read('package-lock.json'));

  assert.equal(rootPackage.devDependencies.n8n, '2.26.4');
  assert.equal(rootLock.packages[''].devDependencies.n8n, '2.26.4');
  assert.equal(rootLock.packages['node_modules/n8n'].version, '2.26.4');
  assert.match(localCompose, /image:\s*docker\.n8n\.io\/n8nio\/n8n:2\.26\.4/);
  assert.match(productionCompose, /image:\s*docker\.n8n\.io\/n8nio\/n8n:2\.26\.4/);
  assert.doesNotMatch(`${localCompose}\n${productionCompose}`, /n8nio\/n8n:latest/i);
});

test('n8n no recibe secretos clinicos, JWT, hashes M2M, SMTP ni seed', () => {
  const forbidden = /DB_PASSWORD|DATABASE_URL|POSTGRES_PASSWORD|JWT_SECRET|CSRF|SESSION_SECRET|SMTP|SEED_DIRECTOR|N8N_API_KEY_HASH|AUTOMATION_SECRET/;
  assert.doesNotMatch(serviceBlock(productionCompose, 'n8n'), forbidden);
  assert.doesNotMatch(serviceBlock(localCompose, 'n8n'), forbidden);
});

test('PostgreSQL no publica puertos en la configuracion productiva', () => {
  assert.doesNotMatch(serviceBlock(productionCompose, 'postgres'), /^\s+ports:/m);
});

test('backend no publica puertos en la configuracion productiva', () => {
  assert.doesNotMatch(serviceBlock(productionCompose, 'backend'), /^\s+ports:/m);
});

test('n8n no publica puertos en la configuracion productiva', () => {
  assert.doesNotMatch(serviceBlock(productionCompose, 'n8n'), /^\s+ports:/m);
});

test('solo el proxy publica un puerto productivo', () => {
  const services = ['postgres', 'backend', 'n8n', 'proxy'];
  const withPorts = services.filter(
    (name) => /^\s+ports:/m.test(serviceBlock(productionCompose, name))
  );
  assert.deepEqual(withPorts, ['proxy']);
  assert.match(serviceBlock(productionCompose, 'proxy'), /-\s+"80:80"/);
});

test('proxy bloquea el prefijo normalizado de automatizaciones antes de /api/', () => {
  const blockedAt = nginx.indexOf('location ~* ^/api/automatizaciones(?:/|$)');
  const generalAt = nginx.indexOf('location /api/');
  assert.ok(blockedAt > 0);
  assert.ok(generalAt > blockedAt);
  assert.match(nginx, /merge_slashes on;/);
  assert.match(nginx, /return 404 '\{"ok":false,"message":"Ruta no encontrada","code":"ROUTE_NOT_FOUND"\}';/);
});

test('rutas humanas /api/ continúan encaminadas al backend', () => {
  assert.match(nginx, /location \/api\/\s*\{[\s\S]*proxy_pass http:\/\/backend:3001\/api\/;/);
});

test('n8n resuelve backend por nombre interno en la red de automatizacion', () => {
  const n8n = serviceBlock(productionCompose, 'n8n');
  const backend = serviceBlock(productionCompose, 'backend');
  assert.match(n8n, /CAP_BACKEND_AUTOMATION_URL:\s*http:\/\/backend:3001\/api\/automatizaciones\/v1\/proximas-citas/);
  assert.match(n8n, /-\s+automation_internal/);
  assert.match(backend, /-\s+automation_internal/);
  assert.match(productionCompose, /automation_internal:[\s\S]*internal:\s*true/);
});

test('n8n no comparte la red de PostgreSQL ni depende de acceso directo a ella', () => {
  const n8n = serviceBlock(productionCompose, 'n8n');
  assert.doesNotMatch(n8n, /data_internal|DB_HOST|postgres:5432/);
  assert.match(serviceBlock(productionCompose, 'postgres'), /-\s+data_internal/);
  assert.match(serviceBlock(productionCompose, 'backend'), /-\s+data_internal/);
});

test('script local usa solo n8n/.env, lista cerrada y binario fijado', () => {
  assert.match(localScript, /n8n\\\.env/);
  assert.match(localScript, /\$allowedVariables/);
  assert.match(localScript, /\$permittedProcessVariables/);
  assert.match(localScript, /\$permittedProcessVariables -notcontains \$_.Name/);
  assert.match(localScript, /\$requiredN8nVersion = "2\.26\.4"/);
  assert.doesNotMatch(localScript, /backend\\\.env|npx\s+n8n/i);
  assert.match(localScript, /Variable no permitida en n8n\/\.env/);
});

test('N8N_ENCRYPTION_KEY es obligatoria en produccion y vacia en ejemplos', () => {
  assert.match(
    serviceBlock(productionCompose, 'n8n'),
    /N8N_ENCRYPTION_KEY:\s*"\$\{N8N_ENCRYPTION_KEY:\?/
  );
  for (const file of [
    ['.env.example'],
    ['n8n', '.env.example'],
    ['deploy', '.env.example'],
  ]) {
    assert.match(read(...file), /^N8N_ENCRYPTION_KEY=\s*$/m);
  }
});

test('produccion poda ejecuciones y no guarda payloads completos', () => {
  const n8n = serviceBlock(productionCompose, 'n8n');
  assert.match(n8n, /EXECUTIONS_DATA_PRUNE:\s*"true"/);
  assert.match(n8n, /EXECUTIONS_DATA_MAX_AGE:\s*"168"/);
  assert.match(n8n, /EXECUTIONS_DATA_SAVE_ON_SUCCESS:\s*none/);
  assert.match(n8n, /EXECUTIONS_DATA_SAVE_ON_ERROR:\s*none/);
  assert.match(n8n, /EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS:\s*"false"/);
  assert.match(n8n, /EXECUTIONS_DATA_SAVE_ON_PROGRESS:\s*"false"/);
});

test('timezone de n8n y citas queda fijada en America/Guatemala', () => {
  for (const source of [localCompose, productionCompose, read('n8n', '.env.example')]) {
    assert.match(source, /GENERIC_TIMEZONE(?::|=)\s*America\/Guatemala/);
  }
  assert.match(productionCompose, /APPOINTMENT_NOTIFICATION_TIMEZONE:\s*America\/Guatemala/);
});

test('UI local de n8n queda ligada solamente a loopback', () => {
  assert.match(serviceBlock(localCompose, 'n8n'), /"127\.0\.0\.1:5678:5678"/);
  assert.match(read('n8n', '.env.example'), /^N8N_LISTEN_ADDRESS=127\.0\.0\.1$/m);
  assert.doesNotMatch(serviceBlock(localCompose, 'n8n'), /-\s*"5678:5678"/);
});

test('trust proxy usa CIDR estricto y nunca true global', () => {
  const indexSource = read('backend', 'src', 'index.js');
  assert.match(indexSource, /app\.set\('trust proxy', createStrictTrustProxy\(config\.trustedProxyCidrs\)\)/);
  assert.doesNotMatch(indexSource, /app\.set\(['"]trust proxy['"],\s*true\)/);

  const trust = createStrictTrustProxy(['172.30.10.0/24']);
  assert.equal(trust('172.30.10.8'), true);
  assert.equal(trust('::ffff:172.30.10.8'), true);
  assert.equal(trust('172.30.30.8'), false);
  assert.deepEqual(
    validateTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: '172.30.10.0/24' }),
    ['172.30.10.0/24']
  );
  assert.throws(
    () => validateTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: '172.30.10.0/99' }),
    (error) => error instanceof ConfigError && error.variable === 'TRUSTED_PROXY_CIDRS'
  );
});

test('trafico humano acepta X-Forwarded-For solo desde un proxy confiable', async () => {
  const app = express();
  app.set('trust proxy', createStrictTrustProxy(['127.0.0.0/8', '::1/128']));
  app.get('/human', (req, res) => res.json({ ip: req.ip, ips: req.ips }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/human`, {
      headers: { 'X-Forwarded-For': '198.51.100.44' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ip: '198.51.100.44',
      ips: ['198.51.100.44'],
    });
  });
});

test('X-Forwarded-For falsificado no evade el origen directo de automatizacion', () => {
  const middleware = createAutomationOriginMiddleware({
    allowedCidrs: ['172.30.30.0/24'],
  });
  let denied;
  middleware({
    headers: { 'x-forwarded-for': '172.30.30.12' },
    socket: { remoteAddress: '203.0.113.9' },
  }, {}, (error) => {
    denied = error;
  });
  assert.equal(denied?.code, 'AUTOMATION_UNAUTHORIZED');

  let allowed;
  const request = {
    headers: { 'x-forwarded-for': '203.0.113.9' },
    socket: { remoteAddress: '::ffff:172.30.30.12' },
  };
  middleware(request, {}, (error) => {
    allowed = error;
  });
  assert.equal(allowed, undefined);
  assert.equal(request.automationOrigin, '172.30.30.12');
});

test('health checks existen y no usan secretos, login ni citas', () => {
  const blocks = ['postgres', 'backend', 'n8n', 'proxy']
    .map((name) => healthcheckBlock(serviceBlock(productionCompose, name)));
  const healthChecks = blocks.join('\n');
  assert.doesNotMatch(
    healthChecks,
    /X-CAP-Automation-Key|N8N_ENCRYPTION_KEY|JWT_SECRET|PASSWORD|login|proximas-citas/i
  );
  assert.match(healthChecks, /pg_isready/);
  assert.match(healthChecks, /\/api\/health/);
  assert.match(healthChecks, /5678\/healthz/);
  assert.match(healthChecks, /\/healthz/);
});

test('ejemplos nuevos no contienen credenciales reales', () => {
  const examples = [
    read('.env.example'),
    read('backend', '.env.example'),
    read('n8n', '.env.example'),
    read('deploy', '.env.example'),
  ].join('\n');
  assert.doesNotMatch(examples, /^[A-Z0-9_]*(?:PASSWORD|SECRET|ENCRYPTION_KEY|HASH_CURRENT|HASH_NEXT)=.+$/m);
  assert.doesNotMatch(examples, /\b[a-f0-9]{64}\b/i);
  assert.doesNotMatch(examples, /Bearer\s+[A-Za-z0-9._-]+/i);
});

test('volumenes productivos, reinicio y redes tienen nombres explicitos', () => {
  assert.match(productionCompose, /name:\s*cap_prenatal_production_postgres_data/);
  assert.match(productionCompose, /name:\s*cap_prenatal_production_n8n_data/);
  assert.match(productionCompose, /name:\s*cap_prenatal_production_proxy/);
  assert.match(productionCompose, /name:\s*cap_prenatal_production_app/);
  assert.match(productionCompose, /name:\s*cap_prenatal_production_data/);
  assert.match(productionCompose, /name:\s*cap_prenatal_production_automation/);
  assert.equal((productionCompose.match(/restart:\s*unless-stopped/g) || []).length, 4);
});
