const http = require('http');
const { spawn, spawnSync } = require('child_process');

const localBaseUrl = 'http://127.0.0.1:3000';
const shouldStartLocalFrontend = !process.env.TEST_BASE_URL && process.env.E2E_START_LOCAL_FRONTEND !== '0';

function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', (error) => {
        if (Date.now() >= deadline) {
          reject(error);
          return;
        }
        setTimeout(tryRequest, 500);
      });

      request.setTimeout(2_000, () => {
        request.destroy(new Error('Timeout waiting for frontend'));
      });
    };

    tryRequest();
  });
}

function run(command, args, options = {}) {
  const executable = process.platform === 'win32' && command.endsWith('.cmd') ? 'cmd.exe' : command;
  const executableArgs = process.platform === 'win32' && command.endsWith('.cmd') ? ['/c', command, ...args] : args;

  return spawn(executable, executableArgs, {
    stdio: 'inherit',
    ...options,
  });
}

function runPlaywright(args, env) {
  const playwrightCli = require.resolve('@playwright/test/cli');
  const child = spawn(process.execPath, [playwrightCli, 'test', 'tests/responsive-mobile.spec.js', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  let settled = false;
  let outputBuffer = '';

  return new Promise((resolve) => {
    const settle = (code) => {
      if (settled) return;
      settled = true;
      setTimeout(() => stopProcessTree(child), 250);
      resolve(code);
    };

    const handleOutput = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      outputBuffer = (outputBuffer + text.replace(/\x1b\[[0-9;]*m/g, '')).slice(-2000);

      if (outputBuffer.includes('failed')) {
        settle(1);
      } else if (outputBuffer.includes('passed')) {
        settle(0);
      }
    };

    child.stdout.on('data', (chunk) => handleOutput(chunk, process.stdout));
    child.stderr.on('data', (chunk) => handleOutput(chunk, process.stderr));
    child.on('close', (code) => settle(code || 0));
    child.on('error', () => settle(1));
  });
}

function stopProcessTree(child) {
  if (!child?.pid) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5_000 });
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  let frontend = null;

  try {
    const baseUrl = process.env.TEST_BASE_URL || localBaseUrl;

    if (shouldStartLocalFrontend) {
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      frontend = run(npmCommand, ['--prefix', '../frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000']);
      await waitForUrl(baseUrl);
    }

    const code = await runPlaywright(process.argv.slice(2), {
        ...process.env,
        E2E_RUN_PROTECTED: '0',
        TEST_BASE_URL: baseUrl,
      });
    process.exitCode = code || 0;
  } finally {
    stopProcessTree(frontend);
    process.exit(process.exitCode || 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
