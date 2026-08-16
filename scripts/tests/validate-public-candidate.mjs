/**
 * 验证 Phase 6 公共候选树工具的确定性、仓库外物化和 fail-closed 行为。
 *
 * 测试只在操作系统临时目录创建候选并初始化空 Git 元数据，不创建提交、ref，
 * 也不修改源工作树。清理前会再次确认目录属于本测试创建的临时根。
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPublicCandidatePath,
  buildCandidateManifest,
  freezeCandidateManifest,
  materializeCandidate,
  verifyMaterializedCandidate,
} from '../compliance/prepare-public-candidate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temporaryPrefix = path.join(os.tmpdir(), 'zunfurl-public-candidate-');

assert.throws(
  () => assertPublicCandidatePath('node_modules/example.js'),
  /forbidden segment/,
  'node_modules must never enter a public candidate.',
);
assert.throws(
  () => assertPublicCandidatePath('.env.production'),
  /environment, cache, log, or key/,
  'Real environment files must never enter a public candidate.',
);
assert.doesNotThrow(
  () => assertPublicCandidatePath('.env.example'),
  'The committed environment example remains allowed.',
);

const first = await buildCandidateManifest({ root });
const second = await buildCandidateManifest({ root });
assert.deepEqual(second, first, 'Unchanged source must produce a byte-stable manifest model.');
assert.equal(first.schemaVersion, 1);
assert.equal(first.toolVersion, 1);
assert.equal(first.candidateVersion, '0.3.0-preview.1');
assert.equal(
  first.summary.sourceFiles,
  first.summary.includedFiles + first.summary.excludedFiles,
  'Every source file must receive exactly one include/exclude decision.',
);
assert.ok(first.summary.includedFiles > 0);
for (const entry of first.entries) {
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.ok(entry.sizeBytes >= 0);
  assert.ok(entry.license);
  assert.ok(entry.licenseClassification);
  assert.ok(entry.licenseEvidence);
}

const excludedPaths = new Set(
  first.entries.filter((entry) => entry.decision === 'exclude').map((entry) => entry.path),
);
const expectedPrivateExclusions = [
  'docs/compliance/public-text-scan-current.json',
  'docs/compliance/public-text-scan-history.json',
  'docs/compliance/phase6-current-repository-audit.md',
  'docs/project-log/daily/2026-07-07.md',
  'docs/project-log/daily/2026-07-10.md',
  'docs/project-log/daily/2026-08-15.md',
  'docs/project-log/daily/2026-08-16.md',
];
assert.ok(
  excludedPaths.size === 0 || excludedPaths.size === expectedPrivateExclusions.length,
  'The tree must be either the private preparation source or the already-materialized public candidate.',
);
for (const expected of expectedPrivateExclusions) {
  assert.equal(
    excludedPaths.has(expected),
    excludedPaths.size > 0,
    `Private evidence/log decision must be complete: ${expected}`,
  );
}

const temporaryRoot = await mkdtemp(temporaryPrefix);
const manifestPath = path.join(temporaryRoot, 'public-candidate-manifest.json');
const candidateRoot = path.join(temporaryRoot, 'candidate');

try {
  const frozen = await freezeCandidateManifest({ root, manifestPath });
  assert.deepEqual(frozen, first, 'Frozen manifest must match the preflight model exactly.');

  const materialized = await materializeCandidate({
    root,
    manifestPath,
    candidateRoot,
    initializeGit: true,
  });
  assert.equal(materialized.fileCount, first.summary.includedFiles);
  assert.equal(materialized.candidateTreeSha256, first.candidateTreeSha256);
  assert.equal(materialized.gitInitialized, true);

  const refs = execFileSync('git', ['for-each-ref', '--format=%(refname)'], {
    cwd: candidateRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  assert.equal(refs, '', 'Fresh candidate Git metadata must not contain refs.');
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: candidateRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.notEqual(head.status, 0, 'Fresh candidate Git metadata must not contain a commit.');

  for (const excluded of excludedPaths) {
    await assert.rejects(
      access(path.join(candidateRoot, ...excluded.split('/'))),
      undefined,
      `Excluded file must not be materialized: ${excluded}`,
    );
  }

  const unexpectedDirectory = path.join(candidateRoot, 'unexpected');
  const unexpectedFile = path.join(unexpectedDirectory, 'extra.txt');
  await mkdir(unexpectedDirectory);
  await writeFile(unexpectedFile, 'must fail closed\n', 'utf8');
  await assert.rejects(
    verifyMaterializedCandidate({ root, manifestPath, candidateRoot }),
    /path set differs/,
    'An unmanifested candidate file must fail verification.',
  );
  await rm(unexpectedFile);
  await rmdir(unexpectedDirectory);

  const verified = await verifyMaterializedCandidate({ root, manifestPath, candidateRoot });
  assert.equal(verified.fileCount, first.summary.includedFiles);
  assert.equal(verified.candidateTreeSha256, first.candidateTreeSha256);

  await assert.rejects(
    materializeCandidate({
      root,
      manifestPath,
      candidateRoot: path.join(root, 'tmp-public-candidate-must-not-exist'),
    }),
    /outside/,
    'Materialization inside the source repository must be rejected before writing.',
  );
} finally {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemp = path.resolve(os.tmpdir());
  const relative = path.relative(resolvedSystemTemp, resolvedTemporaryRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative) ||
      !path.basename(resolvedTemporaryRoot).startsWith('zunfurl-public-candidate-')) {
    throw new Error(`Refusing to clean unexpected test directory: ${resolvedTemporaryRoot}`);
  }
  await rm(resolvedTemporaryRoot, { recursive: true, force: false });
}

console.log(
  `Public candidate contract OK: source=${first.summary.sourceFiles}; ` +
  `include=${first.summary.includedFiles}; exclude=${first.summary.excludedFiles}; ` +
  `tree=${first.candidateTreeSha256}.`,
);
