import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scanDirectory } from '../src/scan.mjs';
import { renderHtml, renderText } from '../src/report.mjs';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(project, 'bin', 'twinfiles.mjs');

async function fixture(t, entries) {
  const root = await mkdtemp(path.join(tmpdir(), 'twinfiles-test-'));
  t.after(async () => {
    // Only remove a verified, directly nested fixture directory we created.
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(tmpdir()));
    assert.ok(path.basename(target).startsWith('twinfiles-test-'));
    await rm(target, { recursive: true, force: true });
  });
  for (const [name, content] of Object.entries(entries)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test('finds equal contents with different names; rejects same-size differences', async t => {
  const root = await fixture(t, { 'a.txt': 'same', '子目录/备份.txt': 'same', 'different.txt': 'diff', 'unique.txt': 'unique' });
  const result = await scanDirectory(root);
  assert.deepEqual(result.groups.map(group => group.files), [['a.txt', '子目录/备份.txt']]);
  assert.deepEqual(result.summary, { duplicateGroups: 1, extraCopies: 1, redundantBytes: 4 });
  assert.equal(result.stats.hashedFiles, 3);
  assert.equal(result.errors.length, 0);
});

test('keeps every source file byte intact', async t => {
  const data = Buffer.from([0, 255, 12, 13, 27, 130]);
  const root = await fixture(t, { 'a.bin': data, 'b.bin': data });
  await scanDirectory(root);
  assert.deepEqual(await readFile(path.join(root, 'a.bin')), data);
  assert.deepEqual(await readFile(path.join(root, 'b.bin')), data);
});

test('skips zero-byte files by default and includes them when explicitly requested', async t => {
  const root = await fixture(t, { empty1: '', empty2: '' });
  const defaults = await scanDirectory(root);
  assert.equal(defaults.stats.skippedSmallFiles, 2);
  assert.equal(defaults.groups.length, 0);
  const include = await scanDirectory(root, { minBytes: 0 });
  assert.equal(include.groups.length, 1);
  assert.equal(include.summary.redundantBytes, 0);
});

test('honors minimum size, built-in exclusions, and repeated name exclusions', async t => {
  const root = await fixture(t, {
    keep: 'same', other: 'same', '.git/hidden': 'same',
    'node_modules/cache': 'same', '.twinfiles-reports/old.html': 'same',
    'backups/hidden': 'same', 'nested/ignore.txt': 'same',
  });
  const result = await scanDirectory(root, { exclude: ['backups', 'ignore.txt'] });
  assert.equal(result.stats.discoveredFiles, 2);
  assert.equal(result.stats.excludedEntries, 5);
  assert.equal(result.groups[0].files.length, 2);
  assert.equal((await scanDirectory(root, { minBytes: 5 })).groups.length, 0);
});

test('does not follow a file symbolic link', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  try {
    await symlink(path.join(root, 'a'), path.join(root, 'file-link'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('OS does not permit symbolic links'); return; }
    throw error;
  }
  const result = await scanDirectory(root);
  assert.equal(result.stats.skippedLinks, 1);
  assert.equal(result.groups[0].files.length, 2);
});

test('skips a recursive directory junction or symbolic link', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  try { await symlink(root, path.join(root, 'loop'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('OS does not permit directory links'); return; }
    throw error;
  }
  const result = await scanDirectory(root);
  assert.equal(result.stats.skippedLinks, 1);
  assert.equal(result.groups[0].files.length, 2);
});

test('does not count hardlink aliases as extra copies or additional storage', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  try { await link(path.join(root, 'a'), path.join(root, 'alias')); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) { t.skip('OS does not permit hardlinks'); return; }
    throw error;
  }
  const result = await scanDirectory(root);
  assert.equal(result.stats.skippedHardlinks, 1);
  assert.equal(result.summary.extraCopies, 1);
  assert.equal(result.summary.redundantBytes, 4);
});

test('reports files changed after discovery instead of presenting them as duplicates', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  // Discovery callback runs before hashing; a synchronous child simulates a
  // concurrent writer and guarantees the mutation has finished before return.
  let changed = false;
  const result = await scanDirectory(root, { onProgress(progress) {
    if (!changed && progress.phase === 'discover') {
      changed = true;
      const child = spawnSync(process.execPath, ['-e', 'require("fs").writeFileSync(process.argv[1], "changed-size")', path.join(root, 'b')]);
      assert.equal(child.status, 0);
    }
  } });
  assert.equal(result.groups.length, 0);
  assert.deepEqual(result.errors, [{ path: 'b', code: 'FILE_CHANGED' }]);
});

test('reports a missing file without discarding the other scan results', async t => {
  const root = await fixture(t, { a: 'same', b: 'same', c: 'same' });
  let removed = false;
  const result = await scanDirectory(root, { onProgress(progress) {
    if (!removed && progress.phase === 'discover') {
      removed = true;
      const child = spawnSync(process.execPath, ['-e', 'require("fs").unlinkSync(process.argv[1])', path.join(root, 'c')]);
      assert.equal(child.status, 0);
    }
  } });
  assert.deepEqual(result.groups[0].files, ['a', 'b']);
  assert.deepEqual(result.errors, [{ path: 'c', code: 'ENOENT' }]);
});

test('rejects a file as scan root and validates scan options', async t => {
  const root = await fixture(t, { a: 'content' });
  await assert.rejects(scanDirectory(path.join(root, 'a')), /real directory/u);
  await assert.rejects(scanDirectory(root, { minBytes: -1 }), /non-negative/u);
  await assert.rejects(scanDirectory(root, { exclude: ['a/b'] }), /entry names/u);
});

test('supports cancellation before scanning', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scanDirectory(root, { signal: controller.signal }), { name: 'AbortError' });
});

test('supports multi-chunk binary hashing without loading the whole file at once', async t => {
  const data = Buffer.alloc(250_000, 0xa5);
  const different = Buffer.from(data); different[different.length - 1] = 1;
  const root = await fixture(t, { a: data, b: data, c: different });
  const result = await scanDirectory(root);
  assert.deepEqual(result.groups[0].files, ['a', 'b']);
  assert.equal(result.groups[0].bytes, 250_000);
});

test('escapes report paths and filename markup; contains no executable scripts or remote assets', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  const result = await scanDirectory(root);
  result.root = '<script>alert(1)</script>';
  result.groups[0].files[0] = 'evil<img src=x onerror=alert(1)>.txt';
  const html = renderHtml(result);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes("default-src 'none'"));
  assert.doesNotMatch(html, /<script[\s>]|<img[\s>]|https?:\/\//iu);
  result.groups[0].files[0] = 'control\u001b[31m\nname';
  assert.ok(renderText(result).includes('control\\u001b[31m\\nname'));
});

test('CLI emits valid JSON for paths containing spaces and rejects bad arguments', async t => {
  const root = await fixture(t, { 'space dir/a': 'same', b: 'same' });
  const child = spawnSync(process.execPath, [cli, root, '--format', 'json'], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).summary.duplicateGroups, 1);
  for (const args of [[root, '--delete'], [root, '--min-bytes', '-1'], [root, '--format'], [root, '--format', 'csv']]) {
    const invalid = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(invalid.status, 1, invalid.stderr);
  }
});

test('CLI never overwrites an existing file, including a scanned source file', async t => {
  const root = await fixture(t, { a: 'same', b: 'same' });
  const target = path.join(root, 'a');
  const child = spawnSync(process.execPath, [cli, root, '--out', target], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.equal(await readFile(target, 'utf8'), 'same');
  const fresh = path.join(root, 'new-report.html');
  const success = spawnSync(process.execPath, [cli, root, '--format', 'html', '--out', fresh], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.ok((await readFile(fresh, 'utf8')).startsWith('<!doctype html>'));
});
