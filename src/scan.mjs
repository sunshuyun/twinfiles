import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const DEFAULT_EXCLUDES = ['.git', 'node_modules', '.twinfiles-reports'];

function sameSnapshot(left, right) {
  return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => left[key] === right[key]);
}

function checkAbort(signal) {
  signal?.throwIfAborted();
}

async function digestFile(file, signal) {
  // NOFOLLOW protects the final path component on supporting platforms. Parent
  // directories must stay stable: this is a local utility, not a sandbox.
  const handle = await open(file.absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || !sameSnapshot(file.snapshot, before)) {
      throw Object.assign(new Error('File changed during scan'), { code: 'FILE_CHANGED' });
    }
    const hash = createHash('sha256');
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false, signal });
    for await (const chunk of stream) {
      bytes += chunk.length;
      hash.update(chunk);
    }
    const after = await handle.stat();
    const current = await lstat(file.absolute);
    if (bytes !== before.size || current.isSymbolicLink() ||
        !sameSnapshot(before, after) || !sameSnapshot(after, current)) {
      throw Object.assign(new Error('File changed during scan'), { code: 'FILE_CHANGED' });
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

/** Scan a stable local directory. File contents are only read, never modified. */
export async function scanDirectory(input, { minBytes = 1, exclude = [], signal, onProgress } = {}) {
  if (!Number.isSafeInteger(minBytes) || minBytes < 0) {
    throw new Error('minBytes must be a non-negative safe integer');
  }
  if (!Array.isArray(exclude) || exclude.some(name =>
    typeof name !== 'string' || !name || /[\\/]/u.test(name))) {
    throw new Error('Exclusions must be entry names, not paths or globs');
  }
  const root = path.resolve(input);
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('Choose a real directory, not a file or symbolic link');
  }
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const excluded = new Set([...DEFAULT_EXCLUDES, ...exclude].map(normalize));
  const stats = {
    discoveredFiles: 0, eligibleFiles: 0, hashedFiles: 0,
    skippedSmallFiles: 0, skippedLinks: 0, skippedHardlinks: 0,
    excludedEntries: 0, skippedSpecialFiles: 0,
  };
  const errors = [];
  const sizes = new Map();
  const identities = new Set();
  const relative = absolute => path.relative(root, absolute).split(path.sep).join('/');
  const recordError = (absolute, error) => errors.push({
    path: relative(absolute) || '.', code: error.code ?? 'SCAN_ERROR',
  });
  const pending = [root];
  while (pending.length) {
    checkAbort(signal);
    const directory = pending.pop();
    let entries;
    try {
      // Re-check before descent to avoid following a directory link introduced
      // after enumeration. Concurrent hostile directory replacement is out of scope.
      if ((await lstat(directory)).isSymbolicLink()) {
        stats.skippedLinks++;
        continue;
      }
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      recordError(directory, error);
      continue;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      checkAbort(signal);
      if (excluded.has(normalize(entry.name))) {
        stats.excludedEntries++;
        continue;
      }
      const absolute = path.join(directory, entry.name);
      try {
        const snapshot = await lstat(absolute);
        if (snapshot.isSymbolicLink()) {
          stats.skippedLinks++;
        } else if (snapshot.isDirectory()) {
          pending.push(absolute);
        } else if (snapshot.isFile()) {
          stats.discoveredFiles++;
          if (!Number.isSafeInteger(snapshot.size)) {
            recordError(absolute, { code: 'FILE_TOO_LARGE' });
            continue;
          }
          if (snapshot.size < minBytes) {
            stats.skippedSmallFiles++;
            continue;
          }
          const identity = snapshot.ino === 0 ? null : `${snapshot.dev}:${snapshot.ino}`;
          if (identity && identities.has(identity)) {
            stats.skippedHardlinks++;
            continue;
          }
          if (identity) identities.add(identity);
          stats.eligibleFiles++;
          const bucket = sizes.get(snapshot.size) ?? [];
          bucket.push({ absolute, path: relative(absolute), snapshot });
          sizes.set(snapshot.size, bucket);
        } else {
          stats.skippedSpecialFiles++;
        }
      } catch (error) {
        recordError(absolute, error);
      }
    }
    onProgress?.({ phase: 'discover', ...stats });
  }
  const groups = [];
  for (const [bytes, files] of sizes) {
    if (files.length < 2) continue;
    const hashes = new Map();
    for (const file of files) {
      checkAbort(signal);
      try {
        const hash = await digestFile(file, signal);
        stats.hashedFiles++;
        const matches = hashes.get(hash) ?? [];
        matches.push(file.path);
        hashes.set(hash, matches);
      } catch (error) {
        checkAbort(signal);
        recordError(file.absolute, error);
      }
      onProgress?.({ phase: 'hash', ...stats });
    }
    for (const [sha256, matches] of hashes) {
      if (matches.length > 1) groups.push({
        sha256, bytes, redundantBytes: bytes * (matches.length - 1),
        files: matches.sort(),
      });
    }
  }
  groups.sort((a, b) => b.redundantBytes - a.redundantBytes || a.sha256.localeCompare(b.sha256));
  return {
    schemaVersion: 1, root, generatedAt: new Date().toISOString(),
    algorithm: 'SHA-256', minBytes, excludedNames: [...excluded].sort(), stats,
    summary: {
      duplicateGroups: groups.length,
      extraCopies: groups.reduce((sum, group) => sum + group.files.length - 1, 0),
      redundantBytes: groups.reduce((sum, group) => sum + group.redundantBytes, 0),
    },
    groups, errors,
  };
}
