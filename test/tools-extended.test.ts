import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { bashTool } from '../src/tools/bash.js';
import { todoWriteTool, todoReadTool, resetTodos, getTodos } from '../src/tools/todo.js';
import { undoTool, createBackup, restoreBackup, listBackups } from '../src/tools/undo.js';
import { diffTool } from '../src/tools/diff.js';
import { gitStatusTool, gitDiffTool, gitCommitTool } from '../src/tools/git.js';
import { spawnSync } from 'child_process';

const TEST_DIR = join(process.cwd(), 'test-tmp-extended');
const GIT_TEST_DIR = join(process.cwd(), 'test-tmp-git');

describe('Bash Tool', () => {
  it('should execute simple commands', async () => {
    const result = await bashTool.execute({ command: 'echo "hello world"' });
    assert.ok(result.includes('hello world'));
  });

  it('should capture stderr', async () => {
    const result = await bashTool.execute({ command: 'echo "error" >&2' });
    assert.ok(result.includes('stderr'));
    assert.ok(result.includes('error'));
  });

  it('should return exit code on failure', async () => {
    const result = await bashTool.execute({ command: 'exit 42' });
    assert.ok(result.includes('Exit code: 42'));
  });

  it('should handle command not found', async () => {
    const result = await bashTool.execute({ command: 'nonexistent_command_12345' });
    assert.ok(result.includes('not found') || result.includes('Exit code'));
  });

  it('should respect timeout', async () => {
    const result = await bashTool.execute({
      command: 'sleep 10',
      timeout: 100,
    });
    assert.ok(result.includes('timeout') || result.includes('killed'));
  });

  it('should warn about dangerous commands', async () => {
    // Safe command with rm pattern in echo (shouldn't trigger warning)
    const _safeResult = await bashTool.execute({ command: 'echo "rm -rf /" && echo safe' });
    // The actual rm -rf / pattern triggers warning
    const dangerousResult = await bashTool.execute({ command: 'rm -rf /' });
    assert.ok(dangerousResult.includes('WARNING') || dangerousResult.includes('dangerous'));
  });
});

describe('Todo Tools', () => {
  beforeEach(() => {
    resetTodos();
  });

  it('should add a todo', async () => {
    const result = await todoWriteTool.execute({
      action: 'add',
      content: 'Test task',
    });
    assert.ok(result.includes('Added'));
    assert.ok(result.includes('Test task'));

    const todos = getTodos();
    assert.strictEqual(todos.length, 1);
    assert.strictEqual(todos[0].content, 'Test task');
    assert.strictEqual(todos[0].status, 'pending');
  });

  it('should require content for add action', async () => {
    const result = await todoWriteTool.execute({ action: 'add' });
    assert.ok(result.includes('Error'));
    assert.ok(result.includes('content'));
  });

  it('should update a todo status', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Task 1' });

    const result = await todoWriteTool.execute({
      action: 'update',
      id: 1,
      status: 'in_progress',
    });
    assert.ok(result.includes('Updated'));

    const todos = getTodos();
    assert.strictEqual(todos[0].status, 'in_progress');
  });

  it('should update todo content', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Original' });

    await todoWriteTool.execute({
      action: 'update',
      id: 1,
      content: 'Updated content',
    });

    const todos = getTodos();
    assert.strictEqual(todos[0].content, 'Updated content');
  });

  it('should remove a todo', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Task 1' });
    await todoWriteTool.execute({ action: 'add', content: 'Task 2' });

    const result = await todoWriteTool.execute({ action: 'remove', id: 1 });
    assert.ok(result.includes('Removed'));

    const todos = getTodos();
    assert.strictEqual(todos.length, 1);
    assert.strictEqual(todos[0].content, 'Task 2');
  });

  it('should clear all todos', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Task 1' });
    await todoWriteTool.execute({ action: 'add', content: 'Task 2' });

    const result = await todoWriteTool.execute({ action: 'clear' });
    assert.ok(result.includes('Cleared'));
    assert.ok(result.includes('2'));

    const todos = getTodos();
    assert.strictEqual(todos.length, 0);
  });

  it('should read all todos', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Task 1' });
    await todoWriteTool.execute({ action: 'add', content: 'Task 2' });

    const result = await todoReadTool.execute({});
    assert.ok(result.includes('Task 1'));
    assert.ok(result.includes('Task 2'));
  });

  it('should filter todos by status', async () => {
    await todoWriteTool.execute({ action: 'add', content: 'Pending task' });
    await todoWriteTool.execute({ action: 'add', content: 'Completed task' });
    await todoWriteTool.execute({ action: 'update', id: 2, status: 'completed' });

    const pending = await todoReadTool.execute({ filter: 'pending' });
    assert.ok(pending.includes('Pending task'));
    assert.ok(!pending.includes('Completed task'));

    const completed = await todoReadTool.execute({ filter: 'completed' });
    assert.ok(completed.includes('Completed task'));
    assert.ok(!completed.includes('Pending task'));
  });

  it('should return empty message when no todos', async () => {
    const result = await todoReadTool.execute({});
    assert.ok(result.includes('No todos'));
  });
});

describe('Undo Tool', () => {
  before(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should create backup of existing file', () => {
    const testFile = join(TEST_DIR, 'backup-test.txt');
    writeFileSync(testFile, 'original content');

    const backupPath = createBackup(testFile, 'edit');
    assert.ok(backupPath !== null);
    assert.ok(existsSync(backupPath!));

    const backupContent = readFileSync(backupPath!, 'utf-8');
    assert.strictEqual(backupContent, 'original content');
  });

  it('should return null for non-existent file', () => {
    const backupPath = createBackup(join(TEST_DIR, 'nonexistent.txt'), 'write');
    assert.strictEqual(backupPath, null);
  });

  it('should restore from backup', () => {
    const testFile = join(TEST_DIR, 'restore-test.txt');
    writeFileSync(testFile, 'original');

    createBackup(testFile, 'edit');
    writeFileSync(testFile, 'modified');

    const result = restoreBackup(testFile);
    assert.ok(result.success);

    const content = readFileSync(testFile, 'utf-8');
    assert.strictEqual(content, 'original');
  });

  it('should list available backups', () => {
    const testFile = join(TEST_DIR, 'list-test.txt');
    writeFileSync(testFile, 'content');

    createBackup(testFile, 'edit');

    const backups = listBackups(testFile);
    assert.ok(backups.length > 0);
    assert.strictEqual(backups[0].originalPath, testFile);
  });

  it('should list all backups via undo tool', async () => {
    const testFile = join(TEST_DIR, 'undo-list-test.txt');
    writeFileSync(testFile, 'content');
    createBackup(testFile, 'write');

    const result = await undoTool.execute({});
    assert.ok(result.includes('Available backups') || result.includes('backups'));
  });
});

describe('Diff Tool', () => {
  before(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should compare two files', async () => {
    const file1 = join(TEST_DIR, 'diff1.txt');
    const file2 = join(TEST_DIR, 'diff2.txt');

    writeFileSync(file1, 'line 1\nline 2\nline 3');
    writeFileSync(file2, 'line 1\nline 2 modified\nline 3');

    const result = await diffTool.execute({
      file1: file1,
      file2: file2,
    });

    assert.ok(result.includes('line 2') || result.includes('modified'));
  });

  it('should compare content strings', async () => {
    const result = await diffTool.execute({
      content1: 'hello\nworld',
      content2: 'hello\nuniverse',
    });

    assert.ok(result.includes('world') || result.includes('universe'));
  });

  it('should handle identical content', async () => {
    const result = await diffTool.execute({
      content1: 'same content',
      content2: 'same content',
    });

    assert.ok(result.includes('identical') || result.includes('No diff') || result === '');
  });
});

describe('Git Tools', () => {
  const originalCwd = process.cwd();

  before(() => {
    // Create a fresh test directory with git repo
    if (existsSync(GIT_TEST_DIR)) {
      rmSync(GIT_TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(GIT_TEST_DIR, { recursive: true });

    // Initialize git repo
    spawnSync('git', ['init'], { cwd: GIT_TEST_DIR });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: GIT_TEST_DIR });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: GIT_TEST_DIR });

    // Create initial commit
    writeFileSync(join(GIT_TEST_DIR, 'README.md'), '# Test Repo\n');
    spawnSync('git', ['add', '.'], { cwd: GIT_TEST_DIR });
    spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: GIT_TEST_DIR });

    // Change to test directory
    process.chdir(GIT_TEST_DIR);
  });

  after(() => {
    // Restore original directory
    process.chdir(originalCwd);

    // Cleanup
    if (existsSync(GIT_TEST_DIR)) {
      rmSync(GIT_TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should show clean status when no changes', async () => {
    const result = await gitStatusTool.execute({});
    assert.ok(result.includes('clean') || result.includes('nothing to commit'));
  });

  it('should show status with short format', async () => {
    // Create an untracked file
    writeFileSync(join(GIT_TEST_DIR, 'untracked.txt'), 'test');

    const result = await gitStatusTool.execute({ short: true });
    assert.ok(result.includes('??') || result.includes('untracked'));

    // Cleanup
    rmSync(join(GIT_TEST_DIR, 'untracked.txt'));
  });

  it('should show diff for modified files', async () => {
    // Modify a file
    writeFileSync(join(GIT_TEST_DIR, 'README.md'), '# Test Repo\n\nUpdated content\n');

    const result = await gitDiffTool.execute({});
    assert.ok(result.includes('Updated') || result.includes('README'));

    // Reset
    spawnSync('git', ['checkout', 'README.md'], { cwd: GIT_TEST_DIR });
  });

  it('should show diff with stat format', async () => {
    // Modify a file
    writeFileSync(join(GIT_TEST_DIR, 'README.md'), '# Test Repo\n\nMore content\n');

    const result = await gitDiffTool.execute({ stat: true });
    assert.ok(result.includes('README') || result.includes('insertion') || result.includes('+'));

    // Reset
    spawnSync('git', ['checkout', 'README.md'], { cwd: GIT_TEST_DIR });
  });

  it('should return no changes when nothing modified', async () => {
    const result = await gitDiffTool.execute({});
    assert.ok(result.includes('No changes') || result === '');
  });

  it('should commit with auto-generated message', async () => {
    // Create a new file
    writeFileSync(join(GIT_TEST_DIR, 'newfile.txt'), 'new content');

    const result = await gitCommitTool.execute({ files: 'newfile.txt' });
    assert.ok(result.includes('Committed') || result.includes('newfile'));
  });

  it('should commit with custom message', async () => {
    // Create another file
    writeFileSync(join(GIT_TEST_DIR, 'another.txt'), 'another file');

    const result = await gitCommitTool.execute({
      files: 'another.txt',
      message: 'feat: add another file',
    });
    assert.ok(result.includes('feat: add another file'));
  });

  it('should handle nothing to commit', async () => {
    const result = await gitCommitTool.execute({});
    assert.ok(result.includes('Nothing to commit') || result.includes('no staged'));
  });

  it('should reject file paths starting with dash', async () => {
    const result = await gitCommitTool.execute({ files: '-rf' });
    assert.ok(result.includes('Error') || result.includes('Invalid'));
  });

  it('should show staged changes only', async () => {
    // Create and stage a file
    writeFileSync(join(GIT_TEST_DIR, 'staged.txt'), 'staged content');
    spawnSync('git', ['add', 'staged.txt'], { cwd: GIT_TEST_DIR });

    const result = await gitDiffTool.execute({ staged: true });
    assert.ok(result.includes('staged') || result.includes('+'));

    // Cleanup - unstage
    spawnSync('git', ['reset', 'HEAD', 'staged.txt'], { cwd: GIT_TEST_DIR });
    rmSync(join(GIT_TEST_DIR, 'staged.txt'));
  });
});
