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
  private static readonly MAX_TASKS = 100; // Maximum tasks to retain
  private static readonly MAX_COMPLETED_AGE_MS = 3600000; // 1 hour

  /**
   * Start a new background task
   */
  start(command: string, timeout = 600000): string {
    // Auto-cleanup old completed tasks before starting new one
    this.autoCleanup();
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

  /**
   * Automatic cleanup to prevent unbounded memory growth
   * - Removes completed tasks older than MAX_COMPLETED_AGE_MS
   * - If still over MAX_TASKS, removes oldest completed tasks
   */
  private autoCleanup(): void {
    const now = Date.now();

    // First pass: remove old completed tasks
    for (const [id, task] of this.tasks) {
      if (task.status !== 'running' && task.completedAt) {
        const age = now - task.completedAt.getTime();
        if (age > BackgroundTaskManager.MAX_COMPLETED_AGE_MS) {
          this.tasks.delete(id);
        }
      }
    }

    // Second pass: if still over limit, remove oldest completed tasks
    if (this.tasks.size >= BackgroundTaskManager.MAX_TASKS) {
      const completedTasks = Array.from(this.tasks.entries())
        .filter(([, task]) => task.status !== 'running')
        .sort((a, b) => {
          const timeA = a[1].completedAt?.getTime() ?? 0;
          const timeB = b[1].completedAt?.getTime() ?? 0;
          return timeA - timeB; // Oldest first
        });

      // Remove oldest completed tasks to get under limit
      const toRemove = this.tasks.size - BackgroundTaskManager.MAX_TASKS + 10; // Leave some room
      for (let i = 0; i < Math.min(toRemove, completedTasks.length); i++) {
        this.tasks.delete(completedTasks[i][0]);
      }
    }
  }

  /**
   * Get task manager statistics
   */
  getStats(): { total: number; running: number; completed: number; failed: number } {
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'running') running++;
      else if (task.status === 'completed') completed++;
      else failed++;
    }
    return { total: this.tasks.size, running, completed, failed };
  }
}

// Singleton instance
export const backgroundManager = new BackgroundTaskManager();
