import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Version } from '@cyclonedx/cyclonedx-library/Spec';
import { JsonValidator } from '@cyclonedx/cyclonedx-library/Validation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'sbom.cdx.json');
const policyPath = path.join(root, 'docs/compliance/dependency-license-policy.json');
const cyclonedxCli = path.join(
  root,
  'node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js',
);
const normalizedSbomValidator = new JsonValidator(Version.v1dot6);

function fail(message) {
  throw new Error(`[sbom] ${message}`);
}

function parseMode(argv) {
  const modes = argv.filter((value) => value === '--write' || value === '--check');
  if (modes.length !== 1 || argv.length !== 1) {
    fail('用法：node scripts/compliance/generate-sbom.mjs --write|--check');
  }
  return modes[0];
}

function componentPackagePath(component) {
  return component.properties?.find((property) => property.name === 'cdx:npm:package:path')?.value;
}

function dependencyClassification(component, lock) {
  const packagePath = componentPackagePath(component);

  if (!packagePath) return 'production';
  const lockEntry = lock.packages?.[packagePath];
  if (
    !packagePath.includes('node_modules/') ||
    lockEntry?.link === true ||
    /^(?:apps|packages)\//.test(lockEntry?.resolved ?? '')
  ) return 'workspace';

  const isDevelopment = lockEntry?.['dev'] === true || lockEntry?.['devOptional'] === true;
  const isOptional = lockEntry?.['optional'] === true || lockEntry?.['devOptional'] === true;
  if (isDevelopment && isOptional) return 'optional-development';
  if (isOptional) return 'optional-production';
  if (isDevelopment) return 'development';
  return 'production';
}

function componentName(component) {
  return component.group ? `${component.group}/${component.name}` : component.name;
}

function matchesOverride(component, override, lock) {
  const packagePath = componentPackagePath(component);
  return componentName(component) === override.package &&
    component.version === override.version &&
    packagePath === override.packagePath &&
    lock.packages?.[packagePath]?.integrity === override.integrity;
}

function annotateComponents(components, policy, lock) {
  for (const component of components ?? []) {
    const override = policy.metadataOverrides.find((candidate) => matchesOverride(component, candidate, lock));
    if ((!component.licenses || component.licenses.length === 0) && override) {
      component.licenses = [
        {
          license: {
            id: override.concludedLicense,
            acknowledgement: 'concluded',
            url: override.evidenceUrl,
          },
        },
      ];
    }

    component.properties ??= [];
    component.properties.push({
      name: 'zunfurl:dependency:classification',
      value: dependencyClassification(component, lock),
    });
    if (override) {
      component.properties.push({
        name: 'zunfurl:dependency:license-override',
        value: override.id,
      });
      component.properties.push({
        name: 'zunfurl:dependency:license-evidence-integrity',
        value: override.integrity,
      });
    }
    component.properties.sort((left, right) =>
      left.name.localeCompare(right.name) || left.value.localeCompare(right.value));

    annotateComponents(component.components, policy, lock);
  }
}

function normalizeSbom(raw, policy, lock) {
  const sbom = JSON.parse(raw);
  sbom.metadata ??= {};
  if (Array.isArray(sbom.metadata.tools?.components)) {
    sbom.metadata.tools.components = sbom.metadata.tools.components.filter(
      (component) => component.name !== 'npm' || component.group,
    );
  }
  sbom.metadata.properties = [
    {
      name: 'zunfurl:distribution:bundled-third-party-dependencies',
      value: 'false',
    },
    {
      name: 'zunfurl:distribution:model',
      value: policy.distribution.model,
    },
    {
      name: 'zunfurl:distribution:release-content',
      value: policy.distribution.releaseContent,
    },
  ];
  annotateComponents(sbom.components, policy, lock);
  return `${JSON.stringify(sbom, null, 2)}\n`;
}

async function generateOnce(directory, name, policy, lock) {
  const rawPath = path.join(directory, `${name}.raw.json`);
  const result = spawnSync(
    process.execPath,
    [
      cyclonedxCli,
      '--ignore-npm-errors',
      '--package-lock-only',
      '--output-reproducible',
      '--spec-version',
      '1.6',
      '--output-format',
      'JSON',
      '--output-file',
      rawPath,
      '--validate',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`CycloneDX 生成失败（exit ${result.status ?? 'unknown'}）。${detail}`);
  }

  const normalized = normalizeSbom(await readFile(rawPath, 'utf8'), policy, lock);
  const validationError = await normalizedSbomValidator.validate(normalized);
  if (validationError !== null) {
    fail(`添加 classification/concluded-license 后的 SBOM 未通过 CycloneDX 1.6 schema：${JSON.stringify(validationError)}`);
  }
  return normalized;
}

async function withTemporaryDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zunfurl-sbom-'));
  try {
    return await callback(directory);
  } finally {
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedDirectory = path.resolve(directory);
    if (path.dirname(resolvedDirectory) !== resolvedTemp || !path.basename(resolvedDirectory).startsWith('zunfurl-sbom-')) {
      fail(`拒绝清理非预期临时目录：${resolvedDirectory}`);
    }
    await rm(resolvedDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const [policy, lock] = await Promise.all([
    readFile(policyPath, 'utf8').then(JSON.parse),
    readFile(path.join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
  ]);

  const [first, second] = await withTemporaryDirectory(async (directory) => [
    await generateOnce(directory, 'first', policy, lock),
    await generateOnce(directory, 'second', policy, lock),
  ]);

  if (first !== second) {
    fail('相同 lockfile 连续两次生成的 SBOM 不一致。');
  }

  if (mode === '--write') {
    await writeFile(outputPath, first, 'utf8');
    console.log(`已生成可重现 SBOM：${path.relative(root, outputPath)}`);
    return;
  }

  let committed;
  try {
    committed = await readFile(outputPath, 'utf8');
  } catch {
    fail('缺少 sbom.cdx.json；先运行 npm run sbom:generate。');
  }
  if (committed !== first) {
    fail('sbom.cdx.json 与当前 package-lock.json 或许可证政策不一致；运行 npm run sbom:generate 后复核差异。');
  }

  console.log('SBOM 可重现，且已提交副本与当前 lockfile/政策一致。');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
