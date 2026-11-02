// Solo procesos sintéticos: el padre confirma que su hijo está realmente listo.
const { spawn } = require('node:child_process');
if (process.argv[2] === 'child') {
  process.send({ ready: true });
  setInterval(() => {}, 1000);
} else {
  const child = spawn(process.execPath, [__filename, 'child'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.once('message', message => {
    if (message.ready) process.send({ ready: true, childPid: child.pid });
  });
  setInterval(() => {}, 1000);
}
