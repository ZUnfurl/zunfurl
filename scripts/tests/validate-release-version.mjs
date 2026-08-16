import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semverPattern } from '../template/project-config.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const releaseVersion = '0.3.0-preview.1';
const releaseTag = `v${releaseVersion}`;
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
}

async function readText(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function workspaceManifestPaths() {
  const paths = [];
  for (const parent of ['apps', 'packages']) {
    const entries = await readdir(path.join(repositoryRoot, parent), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) paths.push(`${parent}/${entry.name}/package.json`);
    }
  }
  return paths.sort();
}

const rootManifest = await readJson('package.json');
const workspacePaths = await workspaceManifestPaths();
const manifests = [
  ['package.json', rootManifest],
  ...(await Promise.all(workspacePaths.map(async (relativePath) => [relativePath, await readJson(relativePath)]))),
];

check(rootManifest.name === 'gcss-v3-site-framework', '根 package 机器名必须保持 gcss-v3-site-framework。');
check(rootManifest.version === releaseVersion, `根 package 版本必须是 ${releaseVersion}。`);
check(rootManifest.packageManager === 'npm@11.9.0', 'packageManager 必须固定为 npm@11.9.0。');
check(rootManifest.engines?.node === '>=22.12.0 <25', 'Node 支持范围必须与已验证的 22.12/24 CI 矩阵一致。');
check(
  rootManifest.repository?.url === 'git+https://github.com/ZUnfurl/zunfurl.git' &&
    rootManifest.homepage === 'https://github.com/ZUnfurl/zunfurl#readme' &&
    rootManifest.bugs?.url === 'https://github.com/ZUnfurl/zunfurl/issues',
  '根 package 的 repository/homepage/bugs 必须指向 ZUnfurl/zunfurl。',
);

for (const [relativePath, manifest] of manifests) {
  check(manifest.private === true, `${relativePath} 必须保持 private: true。`);
  check(manifest.license === 'Apache-2.0', `${relativePath} 必须声明 Apache-2.0。`);
  check(manifest.version === releaseVersion, `${relativePath} 版本必须是 ${releaseVersion}。`);
  check(!manifest.publishConfig, `${relativePath} 不得声明 publishConfig。`);
  for (const [scriptName, command] of Object.entries(manifest.scripts ?? {})) {
    check(!/(?:^|\s)npm(?:\.cmd)?\s+publish(?:\s|$)/i.test(command), `${relativePath} 的 ${scriptName} 不得执行 npm publish。`);
  }
}

const lockfile = await readJson('package-lock.json');
check(lockfile.version === releaseVersion, `package-lock.json 顶层版本必须是 ${releaseVersion}。`);
check(lockfile.packages?.['']?.version === releaseVersion, 'lockfile 根 package 版本必须与候选一致。');
check(lockfile.packages?.['']?.license === 'Apache-2.0', 'lockfile 根 package 必须声明 Apache-2.0。');
for (const relativePath of workspacePaths) {
  const lockPath = relativePath.replace(/\/package\.json$/, '');
  check(lockfile.packages?.[lockPath]?.version === releaseVersion, `lockfile ${lockPath} 版本必须与候选一致。`);
  check(lockfile.packages?.[lockPath]?.license === 'Apache-2.0', `lockfile ${lockPath} 必须声明 Apache-2.0。`);
}

const projectContract = await readJson('gcss.project.json');
check(projectContract.frameworkVersion === releaseVersion, 'gcss.project.json.frameworkVersion 必须与候选一致。');
check(semverPattern.test(projectContract.frameworkVersion), '候选版本必须通过完整 SemVer 2.0.0 校验。');

for (const fixture of ['a1', 'a2', 'b', 'c']) {
  const contract = await readJson(`scripts/fixtures/projects/${fixture}.project.json`);
  check(contract.frameworkVersion === releaseVersion, `${fixture.toUpperCase()} fixture 必须使用候选版本。`);
}

check((await readText('.node-version')).trim() === '22.12.0', '.node-version 必须固定主验证运行时 22.12.0。');

const currentClaims = await Promise.all([
  readText('README.md'),
  readText('CHANGELOG.md'),
  readText('docs/release-policy.md'),
  readText('docs/release-checklist.md'),
]);
for (const [index, content] of currentClaims.entries()) {
  const label = ['README.md', 'CHANGELOG.md', 'docs/release-policy.md', 'docs/release-checklist.md'][index];
  check(content.includes(releaseVersion), `${label} 必须明确候选版本 ${releaseVersion}。`);
  check(!content.includes('v0.2.0 模板'), `${label} 不得把 v0.2.0 描述成当前模板。`);
}
check(currentClaims[1].includes('## [0.3.0-preview.1]'), 'CHANGELOG.md 必须有候选版本条目。');
check(currentClaims[2].includes(`ZUnfurl ${releaseTag}`), 'Release Policy 必须冻结首个 GitHub Release title。');

const workflowFiles = (await readdir(path.join(repositoryRoot, '.github/workflows')))
  .filter((name) => /\.ya?ml$/i.test(name));
for (const fileName of workflowFiles) {
  const content = await readText(`.github/workflows/${fileName}`);
  check(!/(?:^|\s)npm(?:\.cmd)?\s+publish(?:\s|$)/im.test(content), `.github/workflows/${fileName} 不得发布 npm package。`);
  check(!/NODE_AUTH_TOKEN|NPM_TOKEN|npm_[A-Za-z0-9]{20,}/.test(content), `.github/workflows/${fileName} 不得引用 npm 发布凭据。`);
}

if (errors.length > 0) {
  console.error(`Phase 5 版本门禁失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release version OK: ${manifests.length} private manifests, project contract, fixtures, lockfile, docs, and no npm publish path match ${releaseTag}.`);
}
