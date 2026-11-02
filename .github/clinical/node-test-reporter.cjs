'use strict';
const { failureDiagnostic, processDiagnostic } = require('./test-failure-diagnostics.cjs');

module.exports = async function* reporter(source) {
  let count = 0;
  for await (const event of source) {
    if (event.type === 'test:fail' && count++ < 30) {
      yield JSON.stringify({ record: 'failure', ...failureDiagnostic(event.data, { stage: 'node-test' }) }) + '\n';
    }
    if (event.type === 'test:diagnostic') {
      const diagnostic = processDiagnostic(event.data.message);
      if (diagnostic) yield JSON.stringify({ record: 'process-diagnostic', ...diagnostic }) + '\n';
    }
  }
};
