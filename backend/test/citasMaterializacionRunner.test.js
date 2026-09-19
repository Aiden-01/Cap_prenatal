const assert = require('node:assert/strict');
const test = require('node:test');
const { createCitasMaterializacionRunner } = require('../src/services/citasMaterializacionRunner');

test('runner ejecuta al iniciar, programa cada hora y libera el timer', async () => {
  let calls = 0;
  let interval;
  let unref = false;
  const runner = createCitasMaterializacionRunner({
    materializar: async () => { calls += 1; },
    setIntervalFn: (callback, delay) => {
      interval = { callback, delay, unref: () => { unref = true; } };
      return interval;
    },
  });
  runner.iniciar();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(interval.delay, 60 * 60 * 1000);
  assert.equal(unref, true);
});

test('fallo del barrido se registra y no se propaga', async () => {
  const logs = [];
  const runner = createCitasMaterializacionRunner({
    materializar: async () => { throw new Error('fallo simulado'); },
    logger: { error: (...args) => logs.push(args.join(' ')) },
  });
  assert.equal(await runner.ejecutar(), null);
  assert.match(logs[0], /fallo simulado/);
});
