const fs = require('node:fs');

function parseLinuxProcessState(stat) {
  // comm puede contener espacios y paréntesis; el estado está tras el último ).
  const match = /^\d+ \([\s\S]*\) ([A-Zt]) \d+ \d+(?: |$)/.exec(stat);
  if (!match) throw new Error('Invalid synthetic process stat');
  return match[1];
}

function inspectProcess(pid, { platform = process.platform, kill = process.kill.bind(process), readFile = fs.readFileSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return { running: false, state: 'not-started' };
  try { kill(pid, 0); } catch (error) {
    // EPERM no prueba terminación; se mantiene activo de manera conservadora.
    return error.code === 'ESRCH' ? { running: false, state: 'absent' } : { running: true, state: 'unknown' };
  }
  if (platform === 'linux') {
    try {
      const state = parseLinuxProcessState(readFile(`/proc/${pid}/stat`, 'utf8'));
      return { running: state !== 'Z' && state !== 'X', state };
    } catch (error) {
      if (error.code === 'ENOENT') return { running: false, state: 'absent' };
      return { running: true, state: 'unknown' };
    }
  }
  return { running: true, state: 'running' };
}

module.exports = { inspectProcess, parseLinuxProcessState };
