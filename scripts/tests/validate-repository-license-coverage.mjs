/**
 * 对仓库许可覆盖分类器执行正反向契约测试，然后验证真实候选树。
 * 负例确保未知二进制、清单外媒体和 vendor 路径不能被兜底放行。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifyRepositoryFile,
  validateRepositoryLicenseCoverage,
} from '../compliance/validate-repository-license-coverage.mjs';

const root = process.cwd();
const policy = JSON.parse(await readFile(
  path.join(root, 'docs', 'compliance', 'license-coverage.json'),
  'utf8',
));
const webpExtension = '.we' + 'bp';
const exampleMediaPath = ['apps', 'storefront', 'public', `example${webpExtension}`].join('/');
const unregisteredMediaPath = [
  'apps',
  'storefront',
  'public',
  `unregistered${webpExtension}`,
].join('/');
const outsideMediaPath = ['docs', `screenshot${'.pn' + 'g'}`].join('/');
const assetLicenseIndex = new Map([
  [
    exampleMediaPath,
    {
      classification: 'manifest-governed-media',
      evidence: 'docs/compliance/ASSET_LICENSES.yml',
      license: 'CC0-1.0',
    },
  ],
]);

assert.deepEqual(
  classifyRepositoryFile({
    repositoryPath: 'scripts/example.mjs',
    policy,
    assetLicenseIndex,
  }),
  {
    classification: 'first-party',
    evidence: 'LICENSE',
    license: 'Apache-2.0',
  },
  'First-party source must map to Apache-2.0.',
);

assert.deepEqual(
  classifyRepositoryFile({ repositoryPath: 'LICENSE', policy, assetLicenseIndex }),
  {
    classification: 'canonical-license-text',
    evidence: 'https://www.apache.org/licenses/LICENSE-2.0.txt',
    license: 'Apache-2.0',
  },
  'LICENSE must use its explicit canonical-text exception.',
);

assert.equal(
  classifyRepositoryFile({
    repositoryPath: exampleMediaPath,
    policy,
    assetLicenseIndex,
  })?.license,
  'CC0-1.0',
  'Manifest-governed media must use its per-file license record.',
);

assert.match(
  classifyRepositoryFile({
    repositoryPath: unregisteredMediaPath,
    policy,
    assetLicenseIndex,
  })?.error ?? '',
  /missing from/,
  'Unregistered public media must fail closed.',
);

assert.match(
  classifyRepositoryFile({
    repositoryPath: outsideMediaPath,
    policy,
    assetLicenseIndex,
  })?.error ?? '',
  /outside the manifest-governed root/,
  'Media outside the governed root must fail closed.',
);

assert.match(
  classifyRepositoryFile({
    repositoryPath: 'vendor/copied-source.mjs',
    policy,
    assetLicenseIndex,
  })?.error ?? '',
  /forbidden path segment/,
  'Vendor paths must require an explicit policy change.',
);

assert.equal(
  classifyRepositoryFile({
    repositoryPath: 'scripts/unreviewed.exe',
    policy,
    assetLicenseIndex,
  }),
  null,
  'Unknown binary formats must remain unmapped.',
);

const result = await validateRepositoryLicenseCoverage({ root });
if (result.errors.length > 0) {
  console.error(`Repository license coverage contract FAILED: ${result.errors.length} issue(s).`);
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Repository license coverage contract OK: ${result.candidateCount} release candidates mapped.`,
  );
}
