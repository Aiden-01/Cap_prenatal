const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');

function createBrowser(label, events) {
  const browser = new EventEmitter();
  browser.connected = true;
  browser.close = async () => {
    events.push(`browser-close:${label}`);
    browser.connected = false;
  };
  browser.createBrowserContext = async () => {
    const contextId = events.filter((event) => event.startsWith('context:')).length + 1;
    events.push(`context:${contextId}`);
    return {
      async close() { events.push(`context-close:${contextId}`); },
      async newPage() {
        const page = { id: contextId, async close() { events.push(`page-close:${contextId}`); } };
        events.push(`page:${contextId}`);
        return page;
      },
    };
  };
  return browser;
}

test('dos trabajos secuenciales reutilizan Browser y reciben Page aislada', async () => {
  const events = [];
  let launches = 0;
  const browser = createBrowser('one', events);
  const manager = createPuppeteerBrowserManager({
    puppeteerClient: { async launch() { launches += 1; return browser; } },
  });

  const pages = [];
  await manager.withPage(async (page) => pages.push(page));
  await manager.withPage(async (page) => pages.push(page));

  assert.equal(launches, 1);
  assert.notEqual(pages[0], pages[1]);
  assert.deepEqual(events.filter((event) => event.startsWith('page-close:')), ['page-close:1', 'page-close:2']);
  assert.deepEqual(events.filter((event) => event.startsWith('context-close:')), ['context-close:1', 'context-close:2']);
});

test('un error del render cierra Page y BrowserContext sin cerrar Browser', async () => {
  const events = [];
  const manager = createPuppeteerBrowserManager({
    puppeteerClient: { async launch() { return createBrowser('one', events); } },
  });

  await assert.rejects(manager.withPage(async () => { throw new Error('fallo sintetico'); }), /fallo sintetico/);
  assert.deepEqual(events, ['context:1', 'page:1', 'page-close:1', 'context-close:1']);
});

test('Browser desconectado se recrea en la siguiente generación', async () => {
  const events = [];
  const browsers = [createBrowser('one', events), createBrowser('two', events)];
  let launches = 0;
  const manager = createPuppeteerBrowserManager({
    puppeteerClient: { async launch() { return browsers[launches++]; } },
  });

  await manager.withPage(async () => {});
  browsers[0].connected = false;
  browsers[0].emit('disconnected');
  await manager.withPage(async () => {});

  assert.equal(launches, 2);
});

test('llamadas simultáneas comparten una sola promesa de inicialización', async () => {
  const events = [];
  let launches = 0;
  let releaseLaunch;
  const launchGate = new Promise((resolve) => { releaseLaunch = resolve; });
  const browser = createBrowser('one', events);
  const manager = createPuppeteerBrowserManager({
    puppeteerClient: {
      async launch() {
        launches += 1;
        await launchGate;
        return browser;
      },
    },
  });

  const first = manager.getBrowser();
  const second = manager.getBrowser();
  releaseLaunch();
  assert.equal(await first, browser);
  assert.equal(await second, browser);
  assert.equal(launches, 1);
});

test('close espera una inicialización pendiente y cierra el Browser una vez', async () => {
  const events = [];
  let releaseLaunch;
  const launchGate = new Promise((resolve) => { releaseLaunch = resolve; });
  const browser = createBrowser('one', events);
  const manager = createPuppeteerBrowserManager({
    puppeteerClient: { async launch() { await launchGate; return browser; } },
  });

  const pending = manager.getBrowser();
  const closing = manager.close();
  releaseLaunch();
  await Promise.all([pending, closing]);
  assert.deepEqual(events, ['browser-close:one']);
});
