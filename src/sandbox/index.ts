/**
 * Sandbox - Safe command execution with resource limits
 *
 * Provides multiple isolation backends:
 * 1. Docker (best isolation)
 * 2. Firejail (good isolation, Linux only)
 * 3. Direct execution with ulimit (minimal isolation)
 */

import { spawn, spawnSync } from 'child_process';

export interface SandboxOptions {
  timeout?: number; // ms, default 30000
  maxMemory?: string; // e.g., '512m', default '512m'
  network?: boolean; // allow network access, default false
  cwd?: string; // working directory
  env?: Record<string, string>; // environment variables
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  killed: boolean;
  backend: 'docker' | 'firejail' | 'direct';
}

// Check if Docker is available
function hasDocker(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Check if Firejail is available
function hasFirejail(): boolean {
  try {
    const result = spawnSync('firejail', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Run command in Docker container
async function runInDocker(
  command: string,
  options: SandboxOptions
): Promise<SandboxResult> {
  const { timeout = 30000, maxMemory = '512m', network = false, cwd } = options;

  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    `--memory=${maxMemory}`,
    '--memory-swap=' + maxMemory, // Prevent swap
    '--cpus=1', // Limit CPU
    '--pids-limit=100', // Limit processes
  ];

  if (!network) {
    dockerArgs.push('--network=none');
  }

  if (cwd) {
    dockerArgs.push('-v', `${cwd}:${cwd}`);
    dockerArgs.push('-w', cwd);
  }

  // Use a minimal image with shell
  dockerArgs.push('alpine:latest', 'sh', '-c', command);

  return runWithTimeout('docker', dockerArgs, timeout, 'docker');
}

// Run command in Firejail sandbox
async function runInFirejail(
  command: string,
  options: SandboxOptions
): Promise<SandboxResult> {
  const { timeout = 30000, network = false, cwd } = options;

  const firejailArgs = [
    '--quiet',
    '--private-tmp',
    '--noroot',
    '--caps.drop=all',
  ];

  if (!network) {
    firejailArgs.push('--net=none');
  }

  if (cwd) {
    firejailArgs.push(`--whitelist=${cwd}`);
  }

  firejailArgs.push('--', 'sh', '-c', command);

  return runWithTimeout('firejail', firejailArgs, timeout, 'firejail');
}

// Run command directly with ulimit
async function runDirect(
  command: string,
  options: SandboxOptions
): Promise<SandboxResult> {
  const { timeout = 30000, cwd, env } = options;

  // Use ulimit to set some basic limits
  const wrappedCommand = `ulimit -v 524288 2>/dev/null; ${command}`;

  return runWithTimeout(
    'sh',
    ['-c', wrappedCommand],
    timeout,
    'direct',
    cwd,
    env
  );
}

// Helper to run command with timeout
function runWithTimeout(
  cmd: string,
  args: string[],
  timeout: number,
  backend: 'docker' | 'firejail' | 'direct',
  cwd?: string,
  env?: Record<string, string>
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? (killed ? 137 : 1),
        killed,
        backend,
      });
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        killed: false,
        backend,
      });
    });
  });
}

// Cached availability checks
let _hasDocker: boolean | null = null;
let _hasFirejail: boolean | null = null;

/**
 * Run a command in the best available sandbox
 */
export async function runInSandbox(
  command: string,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  // Cache availability checks
  if (_hasDocker === null) _hasDocker = hasDocker();
  if (_hasFirejail === null) _hasFirejail = hasFirejail();

  // Try Docker first (best isolation)
  if (_hasDocker) {
    try {
      return await runInDocker(command, options);
    } catch {
      // Fall through to next option
    }
  }

  // Try Firejail (good isolation, Linux only)
  if (_hasFirejail) {
    try {
      return await runInFirejail(command, options);
    } catch {
      // Fall through to direct
    }
  }

  // Fall back to direct execution with ulimit
  return runDirect(command, options);
}

/**
 * Get information about available sandbox backends
 */
export function getSandboxInfo(): {
  docker: boolean;
  firejail: boolean;
  recommended: 'docker' | 'firejail' | 'direct';
} {
  if (_hasDocker === null) _hasDocker = hasDocker();
  if (_hasFirejail === null) _hasFirejail = hasFirejail();

  return {
    docker: _hasDocker,
    firejail: _hasFirejail,
    recommended: _hasDocker ? 'docker' : _hasFirejail ? 'firejail' : 'direct',
  };
}
