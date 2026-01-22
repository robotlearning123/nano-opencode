/**
 * Background Task Manager - manages long-running background tasks
 */

import { spawn, type ChildProcess } from 'child_process';

export interface BackgroundTask {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  exitCode?: number;
  startedAt: Date;
  completedAt?: Date;
  process?: ChildProcess;
}

class BackgroundTaskManager {
  private tasks = new Map<string, BackgroundTask>();
  private nextId = 1;

  /**
   * Start a new background task
   */
  start(command: string, timeout = 600000): string {
    const id = `bg_${this.nextId++}`;
    const task: BackgroundTask = {
      id,
      command,
      status: 'running',
      output: '',
      startedAt: new Date(),
    };

    const proc = spawn('bash', ['-c', command], {
      cwd: process.cwd(),
      env: process.env,
    });

    task.process = proc;

    proc.stdout.on('data', (data) => {
      task.output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      task.output += data.toString();
    });

    proc.on('close', (code) => {
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code ?? undefined;
      task.completedAt = new Date();
      task.process = undefined;
    });

    proc.on('error', (error) => {
      task.status = 'failed';
      task.output += `\nError: ${error.message}`;
      task.completedAt = new Date();
      task.process = undefined;
    });

    // Set timeout
    setTimeout(() => {
      if (task.status === 'running') {
        this.cancel(id);
        task.output += '\n[Timeout: task exceeded maximum duration]';
      }
    }, timeout);

    this.tasks.set(id, task);
    return id;
  }

  /**
   * Get task status
   */
  getStatus(id: string): BackgroundTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    // Return a copy without the process reference
    return {
      id: task.id,
      command: task.command,
      status: task.status,
      output: task.output,
      exitCode: task.exitCode,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }

  /**
   * Get task output
   */
  getOutput(id: string): string {
    const task = this.tasks.get(id);
    return task?.output ?? '';
  }

  /**
   * Cancel a running task
   */
  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'running') {
      return false;
    }

    if (task.process) {
      task.process.kill('SIGTERM');
      setTimeout(() => {
        if (task.process && !task.process.killed) {
          task.process.kill('SIGKILL');
        }
      }, 1000);
    }

    task.status = 'cancelled';
    task.completedAt = new Date();
    return true;
  }

  /**
   * List all tasks
   */
  list(): BackgroundTask[] {
    return Array.from(this.tasks.values()).map((task) => ({
      id: task.id,
      command: task.command,
      status: task.status,
      output: task.output,
      exitCode: task.exitCode,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    }));
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): number {
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (task.status !== 'running') {
        this.tasks.delete(id);
        count++;
      }
    }
    return count;
  }
}

// Singleton instance
export const backgroundManager = new BackgroundTaskManager();
