/**
 * 校验 Phase 4 的依赖树完整性与两项临时安全覆盖。
 *
 * 部分 npm 11 构建会在从传递依赖进入的 exact override 上继续用上游旧 exact
 * spec 报告 `invalid`，而 Node 22.12 随附的 npm 在 Linux 上可能返回 clean tree。
 * 两种输出都必须先通过 parent 声明、lock 与实际解析版本的精确验证；若存在
 * problems，只接受两条已审核 invalid 与算法证明的平台可选 orphan。其他
 * missing / extraneous / invalid 始终 fail closed。
 */

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const expectedOverrides = {
  '@module-federation/dts-plugin@2.8.1': {
    undici: '7.29.0',
  },
  '@vercel/frameworks@3.29.0': {
    'js-yaml': '3.15.1',
  },
};

const expectedRepairs = [
  {
    label: '@module-federation/dts-plugin@2.8.1 -> undici@7.29.0',
    parentPackagePath: join(
      repositoryRoot,
      'node_modules',
      '@module-federation',
      'dts-plugin',
      'package.json',
    ),
    parentName: '@module-federation/dts-plugin',
    parentVersion: '2.8.1',
    dependencyName: 'undici',
    upstreamSpec: '7.28.0',
    repairedVersion: '7.29.0',
    lockParentPath: 'node_modules/@module-federation/dts-plugin',
    lockChildPath: 'node_modules/undici',
    expectedProblemPattern: /^invalid: undici@7\.29\.0\s+.+[\\/]node_modules[\\/]undici$/,
  },
  {
    label: '@vercel/frameworks@3.29.0 -> js-yaml@3.15.1',
    parentPackagePath: join(
      repositoryRoot,
      'node_modules',
      '@vercel',
      'frameworks',
      'package.json',
    ),
    parentName: '@vercel/frameworks',
    parentVersion: '3.29.0',
    dependencyName: 'js-yaml',
    upstreamSpec: '3.13.1',
    repairedVersion: '3.15.1',
    lockParentPath: 'node_modules/@vercel/frameworks',
    lockChildPath: 'node_modules/@vercel/frameworks/node_modules/js-yaml',
    expectedProblemPattern:
      /^invalid: js-yaml@3\.15\.1\s+.+[\\/]node_modules[\\/]@vercel[\\/]frameworks[\\/]node_modules[\\/]js-yaml$/,
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  throw new Error(`Dependency tree gate failed: ${message}`);
}

function assertExactObject(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} 已漂移。expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function isConstraintCompatible(constraints, currentValue) {
  if (!Array.isArray(constraints) || constraints.length === 0) {
    return true;
  }

  const denied = constraints
    .filter((value) => value.startsWith('!'))
    .map((value) => value.slice(1));
  if (denied.includes(currentValue) || denied.includes('any')) {
    return false;
  }

  const allowed = constraints.filter((value) => !value.startsWith('!'));
  return allowed.length === 0 || allowed.includes(currentValue) || allowed.includes('any');
}

function isPlatformCompatible(lockPackage, platform, architecture) {
  return (
    isConstraintCompatible(lockPackage.os, platform) &&
    isConstraintCompatible(lockPackage.cpu, architecture)
  );
}

function isOptionalLockPackage(lockPackage) {
  return lockPackage?.optional === true || lockPackage?.devOptional === true;
}

function resolveDependencyLockPath(lockPackages, parentPath, dependencyName) {
  let currentPath = parentPath;

  while (currentPath && currentPath !== '.') {
    const candidate = posix.join(currentPath, 'node_modules', dependencyName);
    if (lockPackages[candidate]) {
      return candidate;
    }
    currentPath = posix.dirname(currentPath);
  }

  const rootCandidate = posix.join('node_modules', dependencyName);
  return lockPackages[rootCandidate] ? rootCandidate : null;
}

function derivePlatformOptionalClosure(
  lockPackages,
  platform,
  architecture,
  isInstalled,
) {
  const roots = Object.entries(lockPackages)
    .filter(
      ([lockPath, lockPackage]) =>
        lockPath &&
        isOptionalLockPackage(lockPackage) &&
        !isPlatformCompatible(lockPackage, platform, architecture) &&
        !isInstalled(lockPath),
    )
    .map(([lockPath]) => lockPath);

  const closure = new Set(roots);
  const pending = [...roots];
  while (pending.length > 0) {
    const parentPath = pending.pop();
    const lockPackage = lockPackages[parentPath];
    const dependencyNames = new Set([
      ...Object.keys(lockPackage.dependencies ?? {}),
      ...Object.keys(lockPackage.optionalDependencies ?? {}),
      ...Object.keys(lockPackage.peerDependencies ?? {}),
    ]);

    for (const dependencyName of dependencyNames) {
      const dependencyPath = resolveDependencyLockPath(
        lockPackages,
        parentPath,
        dependencyName,
      );
      if (dependencyPath && !closure.has(dependencyPath)) {
        closure.add(dependencyPath);
        pending.push(dependencyPath);
      }
    }
  }

  return { closure, roots };
}

function runSyntheticHelperTests() {
  assert.equal(isConstraintCompatible(undefined, 'win32'), true);
  assert.equal(isConstraintCompatible(['win32'], 'win32'), true);
  assert.equal(isConstraintCompatible(['linux'], 'win32'), false);
  assert.equal(isConstraintCompatible(['!win32'], 'win32'), false);
  assert.equal(isConstraintCompatible(['!linux'], 'win32'), true);
  assert.equal(isConstraintCompatible(['linux', 'win32'], 'win32'), true);
  assert.equal(isPlatformCompatible({ os: ['win32'], cpu: ['x64'] }, 'win32', 'x64'), true);
  assert.equal(isPlatformCompatible({ os: ['linux'], cpu: ['x64'] }, 'win32', 'x64'), false);
  assert.equal(isPlatformCompatible({ os: ['win32'], cpu: ['wasm32'] }, 'win32', 'x64'), false);

  const syntheticPackages = {
    'node_modules/platform-root': {
      version: '1.0.0',
      optional: true,
      cpu: ['wasm32'],
      dependencies: { leaf: '1.0.0' },
    },
    'node_modules/leaf': { version: '1.0.0', optional: true },
    'node_modules/compatible-root': {
      version: '1.0.0',
      optional: true,
      cpu: ['x64'],
      dependencies: { unrelated: '1.0.0' },
    },
    'node_modules/nonoptional-root': {
      version: '1.0.0',
      cpu: ['wasm32'],
      dependencies: { unrelated: '1.0.0' },
    },
    'node_modules/unrelated': { version: '1.0.0', optional: true },
  };
  const synthetic = derivePlatformOptionalClosure(
    syntheticPackages,
    'win32',
    'x64',
    () => false,
  );
  assert.deepEqual(synthetic.roots, ['node_modules/platform-root']);
  assert.equal(synthetic.closure.has('node_modules/leaf'), true);
  assert.equal(synthetic.closure.has('node_modules/compatible-root'), false);
  assert.equal(synthetic.closure.has('node_modules/nonoptional-root'), false);
  assert.equal(synthetic.closure.has('node_modules/unrelated'), false);
}

runSyntheticHelperTests();

const rootManifest = readJson(join(repositoryRoot, 'package.json'));
assertExactObject(rootManifest.overrides, expectedOverrides, 'root overrides');

const lockfile = readJson(join(repositoryRoot, 'package-lock.json'));
const lockPackages = lockfile.packages ?? {};

for (const repair of expectedRepairs) {
  const installedParent = readJson(repair.parentPackagePath);
  if (installedParent.name !== repair.parentName || installedParent.version !== repair.parentVersion) {
    fail(
      `${repair.label} 的 installed parent 已漂移：${installedParent.name}@${installedParent.version}`,
    );
  }
  if (installedParent.dependencies?.[repair.dependencyName] !== repair.upstreamSpec) {
    fail(
      `${repair.label} 的上游声明不再是 ${repair.upstreamSpec}；请复核并删除陈旧 override`,
    );
  }

  const requireFromParent = createRequire(repair.parentPackagePath);
  const installedChildPath = requireFromParent.resolve(`${repair.dependencyName}/package.json`);
  const installedChild = readJson(installedChildPath);
  if (installedChild.version !== repair.repairedVersion) {
    fail(
      `${repair.label} 未解析到修复版：installed=${installedChild.version} path=${installedChildPath}`,
    );
  }

  const lockedParent = lockPackages[repair.lockParentPath];
  const lockedChild = lockPackages[repair.lockChildPath];
  if (lockedParent?.version !== repair.parentVersion) {
    fail(`${repair.label} 的 lock parent 不是 ${repair.parentVersion}`);
  }
  if (lockedParent.dependencies?.[repair.dependencyName] !== repair.upstreamSpec) {
    fail(`${repair.label} 的 lock 上游声明不再是 ${repair.upstreamSpec}`);
  }
  if (lockedChild?.version !== repair.repairedVersion) {
    fail(`${repair.label} 的 lock child 不是 ${repair.repairedVersion}`);
  }
}

const npmArguments = ['ls', '--all', '--json'];
const npmList = process.env.npm_execpath
  ? spawnSync(process.execPath, [process.env.npm_execpath, ...npmArguments], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
    })
  : spawnSync(npmCommand, npmArguments, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });

if (npmList.error) {
  fail(`无法执行 npm ls：${npmList.error.message}`);
}

let dependencyTree;
try {
  dependencyTree = JSON.parse(npmList.stdout);
} catch (error) {
  fail(`npm ls 没有返回有效 JSON：${error.message}`);
}

const problems = Array.isArray(dependencyTree.problems) ? dependencyTree.problems : [];
if (![0, 1].includes(npmList.status)) {
  fail(`npm ls 返回意外退出码 ${npmList.status}`);
}
if (npmList.status === 0 && problems.length !== 0) {
  fail(`npm ls 退出码为 0 但仍报告 ${problems.length} 个 problem`);
}
if (npmList.status === 1 && problems.length === 0) {
  fail('npm ls 退出码为 1 但没有提供可审核 problem');
}

const platformOptional = derivePlatformOptionalClosure(
  lockPackages,
  process.platform,
  process.arch,
  (lockPath) => existsSync(join(repositoryRoot, ...lockPath.split('/'))),
);
const provenOptionalExtraneous = new Set();
for (const lockPath of platformOptional.closure) {
  const lockedPackage = lockPackages[lockPath];
  if (!isOptionalLockPackage(lockedPackage)) {
    continue;
  }

  const installedPackagePath = join(repositoryRoot, ...lockPath.split('/'), 'package.json');
  if (!existsSync(installedPackagePath)) {
    continue;
  }

  const installedPackage = readJson(installedPackagePath);
  if (installedPackage.version !== lockedPackage.version) {
    fail(
      `${lockPath} 的可选闭包 installed/lock 版本不一致：` +
        `${installedPackage.version}/${lockedPackage.version}`,
    );
  }
  const expectedProblem = `extraneous: ${installedPackage.name}@${installedPackage.version} ${dirname(installedPackagePath)}`;
  provenOptionalExtraneous.add(expectedProblem.replaceAll('\\', '/'));
}

const remainingProblems = problems.filter((problem) => {
  if (!problem.startsWith('extraneous: ')) {
    return true;
  }
  return !provenOptionalExtraneous.has(problem.replaceAll('\\', '/'));
});

if (![0, expectedRepairs.length].includes(remainingProblems.length)) {
  fail(
    `npm ls 未证明 problems 数量应为 0 或 2，实际为 ${remainingProblems.length}：` +
      `${remainingProblems.join(' | ')}`,
  );
}

if (remainingProblems.length > 0) {
  for (const repair of expectedRepairs) {
    const matches = remainingProblems.filter((problem) => repair.expectedProblemPattern.test(problem));
    if (matches.length !== 1) {
      fail(`${repair.label} 的 expected-invalid 不唯一：${remainingProblems.join(' | ')}`);
    }
  }
}

for (const problem of remainingProblems) {
  if (!expectedRepairs.some((repair) => repair.expectedProblemPattern.test(problem))) {
    fail(`出现未审核的 npm ls problem：${problem}`);
  }
}

console.log(
  `Dependency tree gate OK: ${remainingProblems.length} reviewed exact-override reports and ` +
    `${problems.length - remainingProblems.length} algorithmically proven platform-optional ` +
    'orphans; no unproved physical-tree problems.',
);
