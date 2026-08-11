const { execFile } = require('child_process');

// Dos minutos cubren conversiones normales y limitan procesos documentales colgados.
const DOCUMENT_PROCESS_TIMEOUT_MS = 120_000;
const DOCUMENT_PROCESS_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const PROCESS_TERMINATION_GRACE_MS = 500;

class DocumentProcessError extends Error {
  constructor(message, { code, exitCode = null, signal = null } = {}) {
    super(message);
    this.name = 'DocumentProcessError';
    this.code = code;
    this.exitCode = Number.isInteger(exitCode) ? exitCode : null;
    this.signal = typeof signal === 'string' ? signal : null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killWindowsProcessTree(pid, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl(
      'taskkill.exe',
      ['/PID', String(pid), '/T', '/F'],
      { windowsHide: true },
      (error) => resolve(!error)
    );
  });
}

async function terminateProcessByPid(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return;

  const platform = options.platform || process.platform;
  const killImpl = options.killImpl || process.kill.bind(process);
  const execFileImpl = options.execFileImpl || execFile;
  const graceMs = options.graceMs ?? PROCESS_TERMINATION_GRACE_MS;

  if (platform === 'win32') {
    const killedTree = await killWindowsProcessTree(pid, execFileImpl);
    if (!killedTree) {
      try {
        killImpl(pid, 'SIGKILL');
      } catch {
        // El proceso ya termino o el sistema rechazo la terminacion.
      }
    }
    return;
  }

  let signalledGroup = false;
  try {
    killImpl(-pid, 'SIGTERM');
    signalledGroup = true;
  } catch {
    try {
      killImpl(pid, 'SIGTERM');
    } catch {
      return;
    }
  }

  await delay(graceMs);

  try {
    killImpl(signalledGroup ? -pid : pid, 'SIGKILL');
  } catch {
    // El proceso o grupo ya termino.
  }
}

async function terminateProcessTree(child, options = {}) {
  const pid = Number(child?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return;

  await terminateProcessByPid(pid, options);
}

function processFailure(error) {
  return new DocumentProcessError('El proceso documental externo fallo', {
    code: 'DOCUMENT_PROCESS_FAILED',
    exitCode: Number.isInteger(error?.code) ? error.code : null,
    signal: error?.signal,
  });
}

function processTimeout() {
  return new DocumentProcessError('El proceso documental externo excedio el tiempo permitido', {
    code: 'DOCUMENT_PROCESS_TIMEOUT',
  });
}

function runDocumentProcess(file, args, options = {}) {
  if (typeof file !== 'string' || !file.trim()) {
    throw new TypeError('file debe identificar un ejecutable');
  }
  if (!Array.isArray(args)) {
    throw new TypeError('args debe ser un arreglo');
  }

  const timeoutMs = options.timeoutMs ?? DOCUMENT_PROCESS_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10 * 60_000) {
    throw new RangeError('timeoutMs fuera del rango permitido');
  }

  const platform = options.platform || process.platform;
  const execFileImpl = options.execFileImpl || execFile;
  const terminateProcessTreeImpl = options.terminateProcessTreeImpl || terminateProcessTree;
  const onTimeout = options.onTimeout;
  const execOptions = {
    windowsHide: options.windowsHide ?? true,
    maxBuffer: options.maxBuffer ?? DOCUMENT_PROCESS_MAX_BUFFER_BYTES,
    detached: platform !== 'win32',
  };

  if (options.cwd) execOptions.cwd = options.cwd;
  if (options.env) execOptions.env = options.env;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timer = null;
    let child;

    const finish = (operation) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      operation();
    };

    try {
      child = execFileImpl(file, args, execOptions, (error) => {
        if (timedOut || settled) return;
        if (error) {
          finish(() => reject(processFailure(error)));
          return;
        }
        finish(() => resolve({ exitCode: 0 }));
      });
    } catch (error) {
      finish(() => reject(processFailure(error)));
      return;
    }

    timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;

      const cleanupOperations = [
        Promise.resolve(terminateProcessTreeImpl(child, { platform })),
      ];
      if (typeof onTimeout === 'function') {
        cleanupOperations.push(Promise.resolve().then(() => onTimeout()));
      }

      await Promise.allSettled(cleanupOperations);
      finish(() => reject(processTimeout()));
    }, timeoutMs);
  });
}

module.exports = {
  DOCUMENT_PROCESS_MAX_BUFFER_BYTES,
  DOCUMENT_PROCESS_TIMEOUT_MS,
  DocumentProcessError,
  runDocumentProcess,
  terminateProcessByPid,
  terminateProcessTree,
};
