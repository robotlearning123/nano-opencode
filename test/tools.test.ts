import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { readFileTool } from '../src/tools/read.js';
import { writeFileTool } from '../src/tools/writefile.js';
import { editFileTool } from '../src/tools/edit.js';
import { listDirTool } from '../src/tools/list.js';
import { globTool } from '../src/tools/glob.js';
import { grepTool } from '../src/tools/grep.js';

const TEST_DIR = join(process.cwd(), 'test-tmp');

describe('File Tools', () => {
  before(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should write a file', async () => {
    const result = await writeFileTool.execute({
      path: join(TEST_DIR, 'test.txt'),
      content: 'Hello World',
    });

    assert.ok(result.includes('Successfully'));
  });

  it('should read a file', async () => {
    writeFileSync(join(TEST_DIR, 'read-test.txt'), 'Line 1\nLine 2\nLine 3');

    const result = await readFileTool.execute({
      path: join(TEST_DIR, 'read-test.txt'),
    });

    assert.ok(result.includes('Line 1'));
    assert.ok(result.includes('Line 2'));
    assert.ok(result.includes('Line 3'));
  });

  it('should read a file with offset and limit', async () => {
    writeFileSync(join(TEST_DIR, 'offset-test.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

    const result = await readFileTool.execute({
      path: join(TEST_DIR, 'offset-test.txt'),
      offset: 2,
      limit: 2,
    });

    assert.ok(result.includes('Line 2'));
    assert.ok(result.includes('Line 3'));
    assert.ok(!result.includes('Line 1'));
    assert.ok(!result.includes('Line 4'));
  });

  it('should edit a file', async () => {
    writeFileSync(join(TEST_DIR, 'edit-test.txt'), 'Hello World\nFoo Bar');

    const result = await editFileTool.execute({
      path: join(TEST_DIR, 'edit-test.txt'),
      old_string: 'Hello World',
      new_string: 'Hello Nano',
    });

    assert.ok(result.includes('Successfully'));

    const content = await readFileTool.execute({
      path: join(TEST_DIR, 'edit-test.txt'),
    });
    assert.ok(content.includes('Hello Nano'));
  });

  it('should list directory contents', async () => {
    writeFileSync(join(TEST_DIR, 'file1.txt'), 'content1');
    writeFileSync(join(TEST_DIR, 'file2.txt'), 'content2');
    mkdirSync(join(TEST_DIR, 'subdir'), { recursive: true });

    const result = await listDirTool.execute({
      path: TEST_DIR,
    });

    assert.ok(result.includes('file1.txt'));
    assert.ok(result.includes('file2.txt'));
    assert.ok(result.includes('subdir'));
  });

  it('should find files with glob pattern', async () => {
    writeFileSync(join(TEST_DIR, 'test1.ts'), 'content');
    writeFileSync(join(TEST_DIR, 'test2.ts'), 'content');
    writeFileSync(join(TEST_DIR, 'other.js'), 'content');

    const result = await globTool.execute({
      pattern: '*.ts',
      path: TEST_DIR,
    });

    assert.ok(result.includes('test1.ts'));
    assert.ok(result.includes('test2.ts'));
    assert.ok(!result.includes('other.js'));
  });

  it('should search file contents with grep', async () => {
    writeFileSync(join(TEST_DIR, 'grep1.txt'), 'Hello World\nFoo Bar');
    writeFileSync(join(TEST_DIR, 'grep2.txt'), 'Test Hello\nBaz Qux');

    const result = await grepTool.execute({
      pattern: 'Hello',
      path: TEST_DIR,
    });

    assert.ok(result.includes('grep1.txt'));
    assert.ok(result.includes('grep2.txt'));
  });
});
