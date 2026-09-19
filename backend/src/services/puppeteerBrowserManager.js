const puppeteer = require('puppeteer');
const { buildPuppeteerLaunchOptions } = require('../utils/puppeteerLaunch');

function createPuppeteerBrowserManager({
  puppeteerClient = puppeteer,
  launchOptionsFactory = buildPuppeteerLaunchOptions,
} = {}) {
  let browser = null;
  let browserPromise = null;

  function isUsable(candidate) {
    return Boolean(candidate && (typeof candidate.connected !== 'boolean' || candidate.connected));
  }

  async function getBrowser() {
    if (isUsable(browser)) return browser;
    if (browserPromise) return browserPromise;

    browserPromise = (async () => {
      const launched = await puppeteerClient.launch(launchOptionsFactory());
      browser = launched;
      launched.once?.('disconnected', () => {
        if (browser === launched) browser = null;
      });
      return launched;
    })();

    try {
      return await browserPromise;
    } catch (error) {
      browser = null;
      throw error;
    } finally {
      browserPromise = null;
    }
  }

  async function withPage(operation) {
    const activeBrowser = await getBrowser();
    let context = null;
    let page = null;

    try {
      if (typeof activeBrowser.createBrowserContext === 'function') {
        context = await activeBrowser.createBrowserContext();
        page = await context.newPage();
      } else {
        page = await activeBrowser.newPage();
      }
      return await operation(page);
    } finally {
      if (page && typeof page.close === 'function') await page.close().catch(() => {});
      if (context && typeof context.close === 'function') await context.close().catch(() => {});
    }
  }

  async function close() {
    const pendingBrowser = browserPromise ? await browserPromise.catch(() => null) : null;
    const activeBrowser = browser || pendingBrowser;
    browser = null;
    browserPromise = null;
    if (activeBrowser && (typeof activeBrowser.connected !== 'boolean' || activeBrowser.connected)) {
      await activeBrowser.close();
    }
  }

  return { close, getBrowser, withPage };
}

const puppeteerBrowserManager = createPuppeteerBrowserManager();

module.exports = {
  createPuppeteerBrowserManager,
  puppeteerBrowserManager,
};
