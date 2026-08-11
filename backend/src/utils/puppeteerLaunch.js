function buildPuppeteerLaunchOptions({ env = process.env } = {}) {
  const executablePath = String(env.PUPPETEER_EXECUTABLE_PATH || '').trim();
  const options = {
    headless: 'new',
    args: [],
  };

  if (executablePath) {
    options.executablePath = executablePath;
  }

  return options;
}

module.exports = {
  buildPuppeteerLaunchOptions,
};
