import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function dependencyName(packagePath) {
  return packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

function classification(entry) {
  const isDevelopment = entry['dev'] === true || entry['devOptional'] === true;
  const isOptional = entry['optional'] === true || entry['devOptional'] === true;
  if (isDevelopment && isOptional) return 'optional-development';
  if (isOptional) return 'optional-production';
  if (isDevelopment) return 'development';
  return 'production';
}

function componentPackagePath(component) {
  return component.properties?.find((property) => property.name === 'cdx:npm:package:path')?.value;
}

function componentClassification(component) {
  return component.properties?.find(
    (property) => property.name === 'zunfurl:dependency:classification',
  )?.value;
}

function componentName(component) {
  return component.group ? `${component.group}/${component.name}` : component.name;
}

function flattenComponents(components, output = []) {
  for (const component of components ?? []) {
    output.push(component);
    flattenComponents(component.components, output);
  }
  return output;
}

function assertPolicyShape(policy, errors) {
  if (policy.schemaVersion !== 1) errors.push('policy.schemaVersion 必须为 1。');
  if (policy.distribution?.model !== 'source-only') errors.push('distribution.model 必须保持 source-only。');
  if (policy.distribution?.bundledThirdPartyDependencies !== false) {
    errors.push('bundledThirdPartyDependencies 必须为 false。');
  }
  for (const required of ['node_modules', 'FFmpeg binaries', 'libvips binaries']) {
    if (!policy.distribution?.excludedArtifacts?.includes(required)) {
      errors.push(`distribution.excludedArtifacts 缺少 ${required}。`);
    }
  }

  const ids = [];
  for (const rule of policy.reviewRules ?? []) {
    ids.push(rule.id);
    try {
      const expression = new RegExp(rule.packagePattern);
      if (!rule.packagePattern.startsWith('^') || !rule.packagePattern.endsWith('$') || expression.test('')) {
        errors.push(`${rule.id}.packagePattern 必须是非空、完整锚定的规则。`);
      }
    } catch {
      errors.push(`${rule.id}.packagePattern 不是有效正则表达式。`);
    }
    if (!rule.versions?.length || rule.versions.some((version) => /[<>=*^~xX|\s]/.test(version))) {
      errors.push(`${rule.id}.versions 必须只含精确版本，不能使用范围。`);
    }
    for (const field of [
      'licenses',
      'mustNotBeGloballyAllowed',
      'noticeMarkers',
      'classifications',
      'evidenceUrls',
      'conditions',
      'reviewTriggers',
    ]) {
      if (!Array.isArray(rule[field]) || rule[field].length === 0) errors.push(`${rule.id}.${field} 不能为空。`);
    }
  }
  for (const override of policy.metadataOverrides ?? []) {
    ids.push(override.id);
    for (const field of [
      'package',
      'packagePath',
      'version',
      'integrity',
      'concludedLicense',
      'evidenceUrl',
      'reason',
    ]) {
      if (typeof override[field] !== 'string' || override[field].trim() === '') {
        errors.push(`${override.id}.${field} 不能为空。`);
      }
    }
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(override.integrity ?? '')) {
      errors.push(`${override.id}.integrity 必须是 exact sha512 SRI。`);
    }
    if (!override.noticeMarkers?.length) errors.push(`${override.id}.noticeMarkers 不能为空。`);
    if (!override.reviewTriggers?.length) errors.push(`${override.id}.reviewTriggers 不能为空。`);
  }
  if (new Set(ids).size !== ids.length) errors.push('reviewRules/metadataOverrides 的 id 必须唯一。');
}

function findOverride(policy, packagePath, entry) {
  const name = dependencyName(packagePath);
  return policy.metadataOverrides.find((candidate) =>
    candidate.package === name &&
    candidate.packagePath === packagePath &&
    candidate.version === entry.version &&
    candidate.integrity === entry.integrity);
}

function findReviewRule(policy, packagePath, entry, effectiveLicense) {
  const name = dependencyName(packagePath);
  const dependencyClassification = classification(entry);
  return policy.reviewRules.find((rule) =>
    new RegExp(rule.packagePattern).test(name) &&
    rule.versions.includes(entry.version) &&
    rule.licenses.includes(effectiveLicense) &&
    rule.classifications.includes(dependencyClassification));
}

function licenseValues(component) {
  return (component.licenses ?? []).map((entry) =>
    entry.expression ?? entry.license?.id ?? entry.license?.name).filter(Boolean);
}

function parseYamlList(source, key, errors) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const headerIndex = lines.findIndex((line) => line === `${key}:`);
  if (headerIndex < 0) {
    errors.push(`dependency review config 缺少 ${key}。`);
    return [];
  }

  const values = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^  -\s+(['"])(.+)\1\s*$/);
    if (!match) break;
    values.push(match[2]);
  }
  if (values.length === 0) errors.push(`dependency review config 的 ${key} 不能为空。`);
  if (new Set(values).size !== values.length) errors.push(`dependency review config 的 ${key} 不得重复。`);
  return values;
}

function parseYamlScalar(source, key, errors) {
  const pattern = new RegExp(`^${key}:\\s*(?:'([^']*)'|"([^"]*)"|([^#\\s]+))\\s*$`, 'gm');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    errors.push(`dependency review config 的 ${key} 必须且只能出现一次。`);
    return undefined;
  }
  return matches[0][1] ?? matches[0][2] ?? matches[0][3];
}

function assertExactSet(actualValues, expectedValues, label, errors) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  if (
    actual.size !== expected.size ||
    [...actual].some((value) => !expected.has(value))
  ) {
    errors.push(`${label} 必须恰好为 ${[...expected].join(', ')}。`);
  }
}

function tokenizeLicenseExpression(expression) {
  const tokens = expression.match(/\(|\)|\bAND\b|\bOR\b|\bWITH\b|[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? [];
  if (tokens.join('') !== expression.replace(/\s+/g, '')) return null;
  return tokens;
}

function isAllowedExpression(expression, allowedLicenses) {
  const tokens = tokenizeLicenseExpression(expression);
  if (!tokens) return false;
  let index = 0;

  function parsePrimary() {
    if (tokens[index] === '(') {
      index += 1;
      const value = parseOr();
      if (tokens[index] !== ')') throw new Error('missing closing parenthesis');
      index += 1;
      return value;
    }
    const license = tokens[index];
    if (!license || ['AND', 'OR', 'WITH', ')'].includes(license)) throw new Error('missing license');
    index += 1;
    if (tokens[index] === 'WITH') {
      index += 1;
      const exception = tokens[index];
      if (!exception || ['AND', 'OR', 'WITH', '(', ')'].includes(exception)) throw new Error('missing exception');
      index += 1;
      return allowedLicenses.has(`${license} WITH ${exception}`);
    }
    return allowedLicenses.has(license);
  }

  function parseAnd() {
    let value = parsePrimary();
    while (tokens[index] === 'AND') {
      index += 1;
      value = parsePrimary() && value;
    }
    return value;
  }

  function parseOr() {
    let value = parseAnd();
    while (tokens[index] === 'OR') {
      index += 1;
      value = parseAnd() || value;
    }
    return value;
  }

  try {
    const value = parseOr();
    return index === tokens.length && value;
  } catch {
    return false;
  }
}

function toNpmPurl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function sha512IntegrityHex(integrity) {
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  return match ? Buffer.from(match[1], 'base64').toString('hex') : undefined;
}

function componentHasIntegrity(component, integrity) {
  const expected = sha512IntegrityHex(integrity);
  if (!expected) return false;
  return (component.externalReferences ?? []).some((reference) =>
    reference.type === 'distribution' &&
    (reference.hashes ?? []).some((hash) =>
      hash.alg === 'SHA-512' && hash.content.toLowerCase() === expected));
}

async function main() {
  const [lockText, policyText, sbomText, dependencyReviewConfig, thirdPartyNotices] = await Promise.all([
    readFile(path.join(root, 'package-lock.json'), 'utf8'),
    readFile(path.join(root, 'docs/compliance/dependency-license-policy.json'), 'utf8'),
    readFile(path.join(root, 'sbom.cdx.json'), 'utf8'),
    readFile(path.join(root, '.github/dependency-review-config.yml'), 'utf8'),
    readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
  ]);
  const lock = JSON.parse(lockText);
  const policy = JSON.parse(policyText);
  const sbom = JSON.parse(sbomText);
  const errors = [];
  assertPolicyShape(policy, errors);

  const noticeMarkers = new Map();
  for (const record of [...policy.reviewRules, ...policy.metadataOverrides]) {
    for (const marker of record.noticeMarkers ?? []) {
      if (typeof marker !== 'string' || marker.length < 24) {
        errors.push(`${record.id}.noticeMarkers 必须使用长度至少 24 的 exact marker。`);
        continue;
      }
      if (noticeMarkers.has(marker)) {
        errors.push(`${record.id}.noticeMarkers 与 ${noticeMarkers.get(marker)} 重复。`);
      }
      noticeMarkers.set(marker, record.id);
      if (!thirdPartyNotices.includes(marker)) {
        errors.push(`THIRD_PARTY_NOTICES.md 缺少 ${record.id} 的 exact marker：${marker}`);
      }
    }
  }

  if (parseYamlScalar(dependencyReviewConfig, 'fail-on-severity', errors) !== 'high') {
    errors.push("dependency review config 必须保持 fail-on-severity: 'high'。");
  }
  assertExactSet(
    parseYamlList(dependencyReviewConfig, 'fail-on-scopes', errors),
    ['runtime', 'development', 'unknown'],
    'dependency review config 的 fail-on-scopes',
    errors,
  );
  if (parseYamlScalar(dependencyReviewConfig, 'license-check', errors) !== 'true') {
    errors.push('dependency review config 必须保持 license-check: true。');
  }
  if (parseYamlScalar(dependencyReviewConfig, 'vulnerability-check', errors) !== 'true') {
    errors.push('dependency review config 必须保持 vulnerability-check: true。');
  }
  if (/^warn-only:\s*true\s*$/mu.test(dependencyReviewConfig)) {
    errors.push('dependency review config 不得启用 warn-only。');
  }

  const allowed = new Set(parseYamlList(dependencyReviewConfig, 'allow-licenses', errors));
  for (const license of allowed) {
    if (!/^[A-Za-z0-9][A-Za-z0-9.+-]*(?: WITH [A-Za-z0-9][A-Za-z0-9.+-]*)?$/.test(license)) {
      errors.push(`dependency review config 的 allow-licenses 只允许 SPDX identifier，不能使用表达式或自由文本：${license}`);
    }
  }
  for (const rule of policy.reviewRules) {
    for (const license of rule.mustNotBeGloballyAllowed) {
      if (allowed.has(license)) {
        errors.push(`${license} 只能按 ${rule.id} 精确复核，不得加入全局 allow-licenses。`);
      }
    }
  }
  const configuredReviewPurls = new Set(
    parseYamlList(dependencyReviewConfig, 'allow-dependencies-licenses', errors),
  );
  const expectedReviewPurls = new Set();
  const usedAllowedLicenses = new Set();
  const usedRuleIds = new Set();
  const counts = {
    production: 0,
    development: 0,
    'optional-production': 0,
    'optional-development': 0,
  };

  for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.includes('node_modules/') || !entry.version) continue;
    const dependencyClassification = classification(entry);
    counts[dependencyClassification] += 1;
    const override = findOverride(policy, packagePath, entry);
    const effectiveLicense = entry.license ?? override?.concludedLicense;
    if (!effectiveLicense) {
      errors.push(`${packagePath}@${entry.version} 缺少许可证 metadata，且没有精确 concluded-license override。`);
      continue;
    }
    if (override) usedRuleIds.add(override.id);
    if (isAllowedExpression(effectiveLicense, allowed)) {
      for (const token of tokenizeLicenseExpression(effectiveLicense) ?? []) {
        if (allowed.has(token)) usedAllowedLicenses.add(token);
      }
      continue;
    }
    const rule = findReviewRule(policy, packagePath, entry, effectiveLicense);
    if (!rule) {
      errors.push(
        `${packagePath}@${entry.version}（${dependencyClassification}）许可证 ${effectiveLicense} 未被 allowlist 或精确复核规则处置。`,
      );
      continue;
    }
    usedRuleIds.add(rule.id);
    expectedReviewPurls.add(toNpmPurl(dependencyName(packagePath), entry.version));
  }

  for (const rule of [...policy.reviewRules, ...policy.metadataOverrides]) {
    if (!usedRuleIds.has(rule.id)) errors.push(`${rule.id} 没有匹配当前 lockfile；删除陈旧规则或重新复核依赖。`);
  }
  for (const license of allowed) {
    if (!usedAllowedLicenses.has(license)) {
      errors.push(`全局 allow-license ${license} 没有被当前 lockfile 使用；删除宽余许可或提供当前依据。`);
    }
  }

  for (const override of policy.metadataOverrides) {
    expectedReviewPurls.add(toNpmPurl(override.package, override.version));
  }
  for (const purl of expectedReviewPurls) {
    if (!configuredReviewPurls.has(purl)) errors.push(`dependency review config 缺少已复核 PURL：${purl}`);
  }
  for (const purl of configuredReviewPurls) {
    if (!expectedReviewPurls.has(purl)) errors.push(`dependency review config 含无对应精确复核的 PURL：${purl}`);
  }

  const ffmpegEntry = lock.packages?.['node_modules/ffmpeg-static'];
  if (!ffmpegEntry || ffmpegEntry['dev'] !== true || ffmpegEntry['optional'] === true) {
    errors.push('ffmpeg-static 必须存在且保持非 optional 的 development dependency。');
  }

  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.6') {
    errors.push('sbom.cdx.json 必须是 CycloneDX 1.6 JSON。');
  }
  if (sbom.serialNumber || sbom.metadata?.timestamp) {
    errors.push('可重现 SBOM 不得含 serialNumber 或 metadata.timestamp。');
  }
  const toolComponents = sbom.metadata?.tools?.components ?? [];
  if (toolComponents.some((component) => component.name === 'npm' && !component.group)) {
    errors.push('可重现 SBOM 不得固化 ambient npm version。');
  }
  const cyclonedxTool = toolComponents.find(
    (component) => component.group === '@cyclonedx' && component.name === 'cyclonedx-npm',
  );
  const pinnedCyclonedxVersion = lock.packages?.['node_modules/@cyclonedx/cyclonedx-npm']?.version;
  if (!cyclonedxTool || cyclonedxTool.version !== pinnedCyclonedxVersion) {
    errors.push('SBOM generator metadata 必须匹配 lock 中精确固定的 @cyclonedx/cyclonedx-npm。');
  }
  const metadataProperties = new Map(
    (sbom.metadata?.properties ?? []).map((property) => [property.name, property.value]),
  );
  if (metadataProperties.get('zunfurl:distribution:model') !== policy.distribution.model) {
    errors.push('SBOM 的 distribution:model 与 policy 不一致。');
  }
  if (metadataProperties.get('zunfurl:distribution:bundled-third-party-dependencies') !== 'false') {
    errors.push('SBOM 必须明确 bundled-third-party-dependencies=false。');
  }

  const components = flattenComponents(sbom.components);
  const componentByPath = new Map(
    components.map((component) => [componentPackagePath(component), component]).filter(([packagePath]) => packagePath),
  );
  for (const [packagePath, lockEntry] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.includes('node_modules/') || !lockEntry.version) continue;
    const component = componentByPath.get(packagePath);
    if (!component) {
      errors.push(`package-lock dependency ${packagePath}@${lockEntry.version} 未进入 SBOM。`);
    } else if (component.version !== lockEntry.version) {
      errors.push(`package-lock dependency ${packagePath}@${lockEntry.version} 在 SBOM 中版本不一致。`);
    }
  }
  for (const component of components) {
    const packagePath = componentPackagePath(component);
    if (!packagePath?.includes('node_modules/')) continue;
    if (componentClassification(component) === 'workspace') continue;
    const lockEntry = lock.packages?.[packagePath];
    if (!lockEntry) {
      errors.push(`SBOM component ${packagePath} 无法映射到 package-lock.json。`);
      continue;
    }
    if (component.version !== lockEntry.version) {
      errors.push(`SBOM component ${packagePath} 版本 ${component.version} 与 lock ${lockEntry.version} 不一致。`);
    }
    const expectedClassification = classification(lockEntry);
    if (componentClassification(component) !== expectedClassification) {
      errors.push(`SBOM component ${packagePath} 分类不是 ${expectedClassification}。`);
    }
    if (licenseValues(component).length === 0) {
      errors.push(`SBOM component ${packagePath} 缺少 declared 或 concluded license。`);
    }
  }

  for (const override of policy.metadataOverrides) {
    const component = componentByPath.get(override.packagePath);
    const lockEntry = lock.packages?.[override.packagePath];
    const overrideProperty = component?.properties?.find(
      (property) => property.name === 'zunfurl:dependency:license-override',
    )?.value;
    const integrityProperty = component?.properties?.find(
      (property) => property.name === 'zunfurl:dependency:license-evidence-integrity',
    )?.value;
    if (
      !lockEntry ||
      lockEntry.version !== override.version ||
      lockEntry.integrity !== override.integrity ||
      !component ||
      componentName(component) !== override.package ||
      component.version !== override.version ||
      component.purl !== toNpmPurl(override.package, override.version) ||
      overrideProperty !== override.id ||
      integrityProperty !== override.integrity ||
      !componentHasIntegrity(component, override.integrity) ||
      !licenseValues(component).includes(override.concludedLicense)
    ) {
      errors.push(`${override.id} 的 package/path/version/integrity/concluded-license SBOM 映射不完整。`);
    }
  }

  if (errors.length > 0) {
    console.error('依赖许可证 Gate 失败：');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const sha256 = createHash('sha256').update(sbomText).digest('hex');
  console.log(
    `依赖许可证 Gate 通过：${components.length} 个 SBOM components；` +
    `prod=${counts.production}，dev=${counts.development}，` +
    `optional-prod=${counts['optional-production']}，optional-dev=${counts['optional-development']}；` +
    `SBOM SHA-256=${sha256}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
