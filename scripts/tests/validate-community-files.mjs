/**
 * 验证 GitHub community health 文件与已冻结的 0.x Preview 治理决策一致。
 * Issue Forms 使用 JSON-compatible YAML，从而在不增加解析依赖的情况下做完整语法检查。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredFiles = [
  '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/docs.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'GOVERNANCE.md',
  'MAINTAINERS.md',
  'SECURITY.md',
  'SUPPORT.md',
];

const formPaths = [
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/docs.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
];

const governanceDisclosurePaths = [
  'docs/open-source-preview-release-plan.md',
  'docs/release-checklist.md',
  'docs/release-status.md',
];

const governancePolicyStart = '<!-- governance-policy-v1:begin -->';
const governancePolicyEnd = '<!-- governance-policy-v1:end -->';
const expectedGovernancePolicy = Object.freeze({
  policy_version: 1,
  mode: 'single-maintainer',
  qualified_write_maintainers: 1,
  require_pull_request: true,
  required_approving_reviews: 0,
  require_code_owner_review: false,
  require_status_checks: true,
  require_conversation_resolution: true,
  require_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  codeowners_role: 'routing-only',
  upgrade_when_qualified_write_maintainers_at_least: 2,
  upgraded_required_approving_reviews_minimum: 1,
  upgraded_require_code_owner_review: true,
});

const governanceDisclosureContradictions = Object.freeze([
  {
    label: 'single maintainer requires a positive approval count',
    fixture: '当前单维护者阶段要求 required_approving_reviews >= 1。',
    pattern: /(?:当前)?单维护者(?:(?!第二名|新增)[^\n]){0,120}required_approving_reviews\s*(?:>=|=)\s*[1-9]\d*/i,
  },
  {
    label: 'single maintainer enables CODEOWNERS review',
    fixture: '当前单维护者阶段 require_code_owner_review = true。',
    pattern: /(?:当前)?单维护者(?:(?!第二名|新增)[^\n]){0,120}require_code_owner_review\s*=\s*true/i,
  },
  {
    label: 'CODEOWNERS is presented as independent approval evidence',
    fixture: '当前 CODEOWNERS 构成独立批准证明。',
    pattern: /CODEOWNERS[^\n]{0,100}(?<!不)(?:构成|作为|等同于)[^\n]{0,60}(?:独立批准|独立审核)/i,
  },
  {
    label: 'single maintainer may push directly to main',
    fixture: '当前单维护者可以直接 push 到 main。',
    pattern: /(?:当前)?单维护者[^\n]{0,100}(?:允许|可以|可)[^\n]{0,40}(?:直接\s*push|direct\s+push)/i,
  },
  {
    label: 'single maintainer may force push',
    fixture: '当前单维护者允许 force push。',
    pattern: /(?:当前)?单维护者[^\n]{0,100}(?:允许|可以|可)[^\n]{0,40}force\s+push/i,
  },
  {
    label: 'single maintainer may delete the protected branch',
    fixture: '当前单维护者允许 branch deletion。',
    pattern: /(?:当前)?单维护者[^\n]{0,100}(?:允许|可以|可)[^\n]{0,40}(?:branch\s+deletion|删除[^\n]{0,20}(?:main|默认分支))/i,
  },
  {
    label: 'required checks are optional',
    fixture: '当前单维护者不要求 required checks。',
    pattern: /(?:不要求|无需|可以关闭|可关闭)[^\n]{0,60}required (?:status )?checks/i,
  },
  {
    label: 'conversation resolution is optional',
    fixture: '当前单维护者不要求 conversation resolution。',
    pattern: /(?:不要求|无需|可以关闭|可关闭)[^\n]{0,60}conversation resolution/i,
  },
  {
    label: 'linear history is optional',
    fixture: '当前单维护者不要求 linear history。',
    pattern: /(?:不要求|无需|可以关闭|可关闭)[^\n]{0,60}linear history/i,
  },
]);

const expectedSecurityEmail = 'mp4102@gmail.com';
const expectedPvrUrl = 'https://github.com/ZUnfurl/zunfurl/security/advisories/new';
const decoder = new TextDecoder('utf-8', { fatal: true });

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function readRequiredText(root, repositoryPath, errors) {
  try {
    const bytes = await readFile(path.join(root, ...repositoryPath.split('/')));
    return decoder.decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  } catch (error) {
    errors.push(`Cannot read ${repositoryPath} as UTF-8: ${error.message}`);
    return '';
  }
}

function requirePatterns(errors, repositoryPath, source, requirements) {
  for (const [label, pattern] of requirements) {
    if (!pattern.test(source)) {
      errors.push(`${repositoryPath} must state ${label}.`);
    }
  }
}

function validateNoReleasePlaceholders(errors, repositoryPath, source) {
  const forbidden = [
    /\b(?:TBD|FIXME|CHANGEME)\b/i,
    /\[INSERT\s+(?:CONTACT|EMAIL|NAME)[^\]]*\]/i,
    /<国家\s*\/\s*地区>/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      errors.push(`${repositoryPath} contains an unresolved release placeholder: ${pattern}`);
    }
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function validateGovernancePolicyContract(source, errors, repositoryPath = 'GOVERNANCE.md') {
  const startCount = countOccurrences(source, governancePolicyStart);
  const endCount = countOccurrences(source, governancePolicyEnd);
  if (startCount !== 1 || endCount !== 1) {
    errors.push(
      `${repositoryPath} must contain exactly one governance-policy-v1 marker pair; ` +
      `found ${startCount} start and ${endCount} end markers.`,
    );
    return null;
  }

  const startIndex = source.indexOf(governancePolicyStart) + governancePolicyStart.length;
  const endIndex = source.indexOf(governancePolicyEnd, startIndex);
  if (endIndex < startIndex) {
    errors.push(`${repositoryPath} governance-policy-v1 markers are out of order.`);
    return null;
  }

  const fencedBlock = source.slice(startIndex, endIndex);
  const match = /^\n```json\n([\s\S]+)\n```\n$/.exec(fencedBlock);
  if (!match) {
    errors.push(`${repositoryPath} governance-policy-v1 must be one exact fenced JSON block.`);
    return null;
  }

  let policy;
  try {
    policy = JSON.parse(match[1]);
  } catch (error) {
    errors.push(`${repositoryPath} governance-policy-v1 must be valid JSON: ${error.message}`);
    return null;
  }

  const canonicalPolicyJson = JSON.stringify(expectedGovernancePolicy, null, 2);
  if (match[1] !== canonicalPolicyJson) {
    errors.push(
      `${repositoryPath} governance-policy-v1 must exactly match the canonical field order, ` +
      'format, and values.',
    );
  }

  if (!isPlainObject(policy)) {
    errors.push(`${repositoryPath} governance-policy-v1 root must be an object.`);
    return null;
  }

  const expectedKeys = Object.keys(expectedGovernancePolicy).sort();
  const actualKeys = Object.keys(policy).sort();
  const missingKeys = expectedKeys.filter((key) => !Object.hasOwn(policy, key));
  const unknownKeys = actualKeys.filter((key) => !Object.hasOwn(expectedGovernancePolicy, key));
  if (missingKeys.length > 0) {
    errors.push(`${repositoryPath} governance-policy-v1 is missing keys: ${missingKeys.join(', ')}.`);
  }
  if (unknownKeys.length > 0) {
    errors.push(`${repositoryPath} governance-policy-v1 has unknown keys: ${unknownKeys.join(', ')}.`);
  }

  for (const [key, expectedValue] of Object.entries(expectedGovernancePolicy)) {
    if (Object.hasOwn(policy, key) && policy[key] !== expectedValue) {
      errors.push(
        `${repositoryPath} governance-policy-v1.${key} must be ` +
        `${JSON.stringify(expectedValue)}; found ${JSON.stringify(policy[key])}.`,
      );
    }
  }
  return policy;
}

function renderGovernancePolicyFixture(policy) {
  return (
    `${governancePolicyStart}\n` +
    '```json\n' +
    `${JSON.stringify(policy, null, 2)}\n` +
    '```\n' +
    governancePolicyEnd
  );
}

function runGovernancePolicyNegativeTests(errors) {
  const positiveErrors = [];
  validateGovernancePolicyContract(
    renderGovernancePolicyFixture(expectedGovernancePolicy),
    positiveErrors,
    'governance self-test positive fixture',
  );
  if (positiveErrors.length > 0) {
    errors.push(`Governance policy positive self-test failed: ${positiveErrors.join(' | ')}`);
  }

  const withoutDeletionRule = { ...expectedGovernancePolicy };
  delete withoutDeletionRule.allow_deletions;
  const duplicateApprovalField = renderGovernancePolicyFixture(expectedGovernancePolicy).replace(
    '  "required_approving_reviews": 0,',
    '  "required_approving_reviews": 1,\n  "required_approving_reviews": 0,',
  );
  const policyMutations = [
    ['policy version drift', { policy_version: 2 }],
    ['single-maintainer mode changed', { mode: 'multi-maintainer' }],
    ['maintainer count no longer matches the roster', { qualified_write_maintainers: 2 }],
    ['unknown field', { bypass_allowed: true }],
    ['required approval raised without a second maintainer', { required_approving_reviews: 1 }],
    ['CODEOWNERS review enabled without a second maintainer', { require_code_owner_review: true }],
    ['pull request bypass', { require_pull_request: false }],
    ['required checks disabled', { require_status_checks: false }],
    ['conversation resolution disabled', { require_conversation_resolution: false }],
    ['linear history disabled', { require_linear_history: false }],
    ['force pushes allowed', { allow_force_pushes: true }],
    ['branch deletion allowed', { allow_deletions: true }],
    ['CODEOWNERS promoted from routing to approval evidence', { codeowners_role: 'approval' }],
    [
      'upgrade delayed past the second maintainer',
      { upgrade_when_qualified_write_maintainers_at_least: 3 },
    ],
    ['upgrade approval minimum weakened', { upgraded_required_approving_reviews_minimum: 0 }],
    ['upgrade CODEOWNERS review disabled', { upgraded_require_code_owner_review: false }],
  ];
  const negativeCases = [
    ['missing marker block', ''],
    [
      'malformed JSON',
      `${governancePolicyStart}\n\`\`\`json\n{\n\`\`\`\n${governancePolicyEnd}`,
    ],
    ['missing required field', renderGovernancePolicyFixture(withoutDeletionRule)],
    ['duplicate approval field', duplicateApprovalField],
    ...policyMutations.map(([label, mutation]) => [
      label,
      renderGovernancePolicyFixture({ ...expectedGovernancePolicy, ...mutation }),
    ]),
  ];

  for (const [label, source] of negativeCases) {
    const caseErrors = [];
    validateGovernancePolicyContract(source, caseErrors, `governance negative fixture: ${label}`);
    if (caseErrors.length === 0) {
      errors.push(`Governance policy negative self-test was accepted: ${label}.`);
    }
  }
  return negativeCases.length;
}

function validateGovernanceDisclosure(repositoryPath, source, errors) {
  requirePatterns(errors, repositoryPath, source, [
    ['single-maintainer required approvals equal zero', /required_approving_reviews\s*=\s*0/],
    ['single-maintainer CODEOWNERS review disabled', /require_code_owner_review\s*=\s*false/],
    ['pull requests remain required', /(?:必须|强制)[^\n]*(?:Pull Request|\bPR\b)|(?:Pull Request|\bPR\b)[^\n]*(?:必须|强制)/],
    ['required status checks remain enabled', /required (?:status )?checks/i],
    ['conversation resolution remains enabled', /conversation resolution/i],
    ['linear history remains enabled', /linear history/i],
    ['force pushes remain forbidden', /(?:禁止|不允许)[^\n]*force push|force push[^\n]*(?:禁止|不允许)/i],
    ['branch deletion remains forbidden', /(?:禁止|不允许)[^\n]*(?:branch )?(?:deletion|删除)|(?:branch )?(?:deletion|删除)[^\n]*(?:禁止|不允许)/i],
    ['CODEOWNERS is routing only, not independent approval', /CODEOWNERS[\s\S]*(?:只[^\n]*路由|routing-only)[\s\S]*(?:不[^\n]*独立批准|不是独立批准|不构成独立批准)/i],
    ['the second qualified write maintainer upgrade trigger', /第二名[\s\S]*write[\s\S]*required_approving_reviews\s*>=\s*1[\s\S]*require_code_owner_review\s*=\s*true/i],
    ['PR #5 sole-maintainer zero-independent-review disclosure', /PR #5[\s\S]{0,600}唯一维护者[\s\S]{0,600}(?:SUCCESS|全绿)[\s\S]{0,600}(?:批准(?:为|是)\s*`?0`?|`0`\s*个[^\n]*独立)/i],
  ]);

  const obsoletePromises = [
    /`main`[^\n]*(?:至少一次审核|至少\s*1\s*次审核)[^\n]*CODEOWNERS/i,
    /独立审核策略仍未完成/,
  ];
  for (const pattern of obsoletePromises) {
    if (pattern.test(source)) {
      errors.push(`${repositoryPath} retains an obsolete multi-maintainer promise: ${pattern}`);
    }
  }

  for (const { label, pattern } of governanceDisclosureContradictions) {
    if (pattern.test(source)) {
      errors.push(`${repositoryPath} contains contradictory governance disclosure [${label}].`);
    }
  }
}

function runGovernanceDisclosureNegativeTests(baseSource, errors) {
  for (const { fixture, label } of governanceDisclosureContradictions) {
    const caseErrors = [];
    validateGovernanceDisclosure(
      `governance disclosure negative fixture: ${label}`,
      `${baseSource}\n\n${fixture}\n`,
      caseErrors,
    );
    if (!caseErrors.some((message) => message.includes(`[${label}]`))) {
      errors.push(`Governance disclosure contradiction self-test was accepted: ${label}.`);
    }
  }
  return governanceDisclosureContradictions.length;
}

function validateIssueForm({ repositoryPath, source, errors }) {
  let form;
  try {
    // JSON 是 YAML 1.2 的严格子集；保持表单 JSON-compatible 可避免隐藏解析差异。
    form = JSON.parse(source);
  } catch (error) {
    errors.push(`${repositoryPath} must be valid JSON-compatible YAML: ${error.message}`);
    return null;
  }

  if (!isPlainObject(form)) {
    errors.push(`${repositoryPath} root must be an object.`);
    return null;
  }
  const allowedTopLevel = new Set(['assignees', 'body', 'description', 'labels', 'name', 'title']);
  for (const key of Object.keys(form)) {
    if (!allowedTopLevel.has(key)) {
      errors.push(`${repositoryPath} has unsupported top-level property: ${key}`);
    }
  }
  if (!isNonEmptyString(form.name) || form.name.length > 64) {
    errors.push(`${repositoryPath}.name must contain 1-64 characters.`);
  }
  if (!isNonEmptyString(form.description) || form.description.length > 200) {
    errors.push(`${repositoryPath}.description must contain 1-200 characters.`);
  }
  if (!Array.isArray(form.body) || form.body.length === 0) {
    errors.push(`${repositoryPath}.body must be a non-empty array.`);
    return form;
  }
  if (form.labels !== undefined &&
      (!Array.isArray(form.labels) || form.labels.some((entry) => !isNonEmptyString(entry)))) {
    errors.push(`${repositoryPath}.labels must be a string array when present.`);
  }

  const allowedTypes = new Set(['checkboxes', 'dropdown', 'input', 'markdown', 'textarea']);
  const ids = new Set();
  for (const [index, item] of form.body.entries()) {
    const label = `${repositoryPath}.body[${index}]`;
    if (!isPlainObject(item) || !allowedTypes.has(item.type) || !isPlainObject(item.attributes)) {
      errors.push(`${label} must define a supported type and attributes object.`);
      continue;
    }
    const allowedItemKeys = new Set(['attributes', 'id', 'type', 'validations']);
    for (const key of Object.keys(item)) {
      if (!allowedItemKeys.has(key)) {
        errors.push(`${label} has unsupported property: ${key}`);
      }
    }

    if (item.type === 'markdown') {
      if (!isNonEmptyString(item.attributes.value)) {
        errors.push(`${label}.attributes.value must be a non-empty string.`);
      }
      if (item.id !== undefined || item.validations !== undefined) {
        errors.push(`${label} markdown blocks must not define id or validations.`);
      }
      continue;
    }

    if (!isNonEmptyString(item.id) || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id)) {
      errors.push(`${label}.id must use 1-64 letters, numbers, underscores, or hyphens.`);
    } else if (ids.has(item.id)) {
      errors.push(`${repositoryPath} has duplicate body id: ${item.id}`);
    } else {
      ids.add(item.id);
    }
    if (!isNonEmptyString(item.attributes.label)) {
      errors.push(`${label}.attributes.label must be a non-empty string.`);
    }
    if (item.validations !== undefined) {
      if (!isPlainObject(item.validations) ||
          Object.keys(item.validations).some((key) => key !== 'required') ||
          (item.validations.required !== undefined &&
            typeof item.validations.required !== 'boolean')) {
        errors.push(`${label}.validations may contain only a boolean required value.`);
      }
    }

    if (item.type === 'dropdown') {
      if (!Array.isArray(item.attributes.options) || item.attributes.options.length === 0 ||
          item.attributes.options.some((entry) => !isNonEmptyString(entry))) {
        errors.push(`${label}.attributes.options must be a non-empty string array.`);
      }
      if (item.attributes.multiple !== undefined && typeof item.attributes.multiple !== 'boolean') {
        errors.push(`${label}.attributes.multiple must be boolean when present.`);
      }
    }

    if (item.type === 'checkboxes') {
      if (!Array.isArray(item.attributes.options) || item.attributes.options.length === 0) {
        errors.push(`${label}.attributes.options must be a non-empty array.`);
      } else {
        for (const [optionIndex, option] of item.attributes.options.entries()) {
          if (!isPlainObject(option) || !isNonEmptyString(option.label) ||
              (option.required !== undefined && typeof option.required !== 'boolean')) {
            errors.push(`${label}.attributes.options[${optionIndex}] is invalid.`);
          }
        }
      }
    }

    if (item.type === 'input' &&
        ('options' in item.attributes || 'render' in item.attributes || 'value' in item.attributes)) {
      errors.push(`${label} input attributes must not use options, render, or value.`);
    }
  }

  const serialized = JSON.stringify(form);
  if (!/framework_version/.test(serialized)) {
    errors.push(`${repositoryPath} must collect framework version or commit.`);
  }
  if (!/(?:客户数据|客户信息)/.test(serialized) || !/secret/i.test(serialized)) {
    errors.push(`${repositoryPath} must warn against customer data and secrets.`);
  }
  return form;
}

function validateIssueChooser({ repositoryPath, source, errors }) {
  let config;
  try {
    config = JSON.parse(source);
  } catch (error) {
    errors.push(`${repositoryPath} must be valid JSON-compatible YAML: ${error.message}`);
    return;
  }
  if (!isPlainObject(config) || config.blank_issues_enabled !== false ||
      !Array.isArray(config.contact_links) || config.contact_links.length === 0) {
    errors.push(`${repositoryPath} must disable blank issues and define contact_links.`);
    return;
  }
  const urls = new Set();
  for (const [index, contact] of config.contact_links.entries()) {
    if (!isPlainObject(contact) || !isNonEmptyString(contact.name) ||
        !isNonEmptyString(contact.about) || !/^https:\/\//.test(contact.url ?? '')) {
      errors.push(`${repositoryPath}.contact_links[${index}] is invalid.`);
    } else {
      urls.add(contact.url);
    }
  }
  if (!urls.has(expectedPvrUrl)) {
    errors.push(`${repositoryPath} must route security reports to ${expectedPvrUrl}.`);
  }
}

function validateCodeowners(source, errors) {
  const effectiveLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (effectiveLines[0] !== '* @mp4102') {
    errors.push('.github/CODEOWNERS must start with the default rule "* @mp4102".');
  }
  for (const line of effectiveLines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2 || parts.slice(1).some((owner) => owner !== '@mp4102')) {
      errors.push(`.github/CODEOWNERS has an unexpected owner rule: ${line}`);
    }
  }
  const emailDomainSuffix = '@gmail' + '.com';
  if (source.includes(emailDomainSuffix)) {
    errors.push('.github/CODEOWNERS must use a GitHub handle, not an email address.');
  }
}

/** 验证社区文件存在、结构可解析，并与 Phase 0 决策保持一致。 */
export async function validateCommunityFiles({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const errors = [];
  const sources = new Map();

  for (const repositoryPath of requiredFiles) {
    const source = await readRequiredText(resolvedRoot, repositoryPath, errors);
    sources.set(repositoryPath, source);
    validateNoReleasePlaceholders(errors, repositoryPath, source);
  }

  for (const repositoryPath of governanceDisclosurePaths) {
    const source = await readRequiredText(resolvedRoot, repositoryPath, errors);
    sources.set(repositoryPath, source);
    validateNoReleasePlaceholders(errors, repositoryPath, source);
  }

  requirePatterns(errors, 'CONTRIBUTING.md', sources.get('CONTRIBUTING.md'), [
    ['the official DCO 1.1 reference', /https:\/\/developercertificate\.org\//],
    ['DCO sign-off commands', /git commit -s[\s\S]*Signed-off-by:|Signed-off-by:[\s\S]*git commit -s/],
    ['inbound=outbound and no CLA', /inbound=outbound[\s\S]*(?:不要求|无)[^\n]*CLA|(?:不要求|无)[^\n]*CLA[\s\S]*inbound=outbound/],
    ['Windows npm.cmd commands', /npm\.cmd (?:ci|run)/],
    ['all A1/A2/B/C profiles', /\bA1\b[\s\S]*\bA2\b[\s\S]*\bB\b[\s\S]*\bC\b/],
    ['customer-data and secret restrictions', /客户数据[\s\S]*secret|secret[\s\S]*客户数据/i],
    ['asset-rights restrictions', /(?:素材|资产)[\s\S]*(?:许可|授权|权利)|(?:许可|授权|权利)[\s\S]*(?:素材|资产)/],
    ['human commits require per-commit DCO', /每个人类贡献者的每个 commit[\s\S]*Signed-off-by/],
    ['co-authored commits are rejected for the first Preview', /不接受 `Co-authored-by` 多作者 commit/],
    ['the narrow authenticated Dependabot exception', /唯一自动化例外[\s\S]*dependabot\[bot\][\s\S]*固定 bot ID[\s\S]*verified\/valid/],
    ['required checks do not prove workflow integrity', /GitHub Actions App source 绑定不证明 workflow[\s\S]*绿色状态不能替代[\s\S]*人工审阅/],
  ]);

  requirePatterns(errors, 'CODE_OF_CONDUCT.md', sources.get('CODE_OF_CONDUCT.md'), [
    ['a private enforcement email', new RegExp(`mailto:${expectedSecurityEmail.replace('.', '\\.')}|${expectedSecurityEmail.replace('.', '\\.')}`)],
    ['the Contributor Covenant 2.1 reference', /contributor-covenant\.org\/version\/2\/1\/code_of_conduct\//],
    ['scope, reporting, enforcement, and reconsideration', /适用范围[\s\S]*私密报告[\s\S]*处理原则[\s\S]*重新考虑/],
    ['the single-contact limitation', /没有独立内部申诉|不存在独立治理机构/],
  ]);
  if (/## Our Pledge|Community Impact Guidelines|Instances of abusive, harassing/.test(
    sources.get('CODE_OF_CONDUCT.md'),
  )) {
    errors.push('CODE_OF_CONDUCT.md must remain an original policy, not a copied third-party template.');
  }

  requirePatterns(errors, 'SECURITY.md', sources.get('SECURITY.md'), [
    ['latest 0.x Preview support only', /只为最新公开发布的 `0\.x` Preview/],
    ['GitHub Private Vulnerability Reporting', new RegExp(expectedPvrUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))],
    ['the security email', new RegExp(expectedSecurityEmail.replace('.', '\\.'))],
    ['no public security issues', /不要[^\n]*(?:公开 Issue|公开.*Issue)/],
    ['best effort without a fixed SLA', /best effort[\s\S]*(?:不承诺固定|不提供免费 SLA)/i],
    ['the non-independent fallback disclosure', /不是独立备用通道/],
  ]);

  requirePatterns(errors, 'SUPPORT.md', sources.get('SUPPORT.md'), [
    ['best-effort support without a free SLA', /best-effort[\s\S]*不提供免费[^\n]*SLA/i],
    ['customer-private ownership boundaries', /客户自己的 Private repository[\s\S]*平台所有权边界/],
    ['security and conduct routing', /SECURITY\.md[\s\S]*CODE_OF_CONDUCT\.md/],
  ]);

  requirePatterns(errors, 'GOVERNANCE.md', sources.get('GOVERNANCE.md'), [
    ['maintainer-led governance', /maintainer-led/],
    ['release and security authority', /Release[\s\S]*Security|release[\s\S]*security/],
    ['Profile contract stewardship', /A1\/A2\/B\/C Profile/],
    ['succession responsibilities', /继任[\s\S]*(?:轮换|撤销权限)/],
    ['the single-maintainer limitation', /当前只有一位维护者/],
    ['the trusted metadata-only DCO status publisher', /metadata-only workflow[\s\S]*不 checkout、fetch 或执行 Pull Request head[\s\S]*statuses: write/],
    ['the narrow Dependabot DCO exception', /唯一免签对象[\s\S]*dependabot\[bot\][\s\S]*verified\/valid/],
    ['single-maintainer workflow-control review limitation', /required-check source 绑定[\s\S]*不能证明[\s\S]*workflow[\s\S]*绿色状态不能替代[\s\S]*审阅/],
  ]);
  validateGovernancePolicyContract(sources.get('GOVERNANCE.md'), errors);
  validateGovernanceDisclosure('GOVERNANCE.md', sources.get('GOVERNANCE.md'), errors);
  for (const repositoryPath of governanceDisclosurePaths) {
    validateGovernanceDisclosure(repositoryPath, sources.get(repositoryPath), errors);
  }
  const governanceNegativeCaseCount =
    runGovernancePolicyNegativeTests(errors) +
    runGovernanceDisclosureNegativeTests(sources.get('GOVERNANCE.md'), errors);

  const maintainers = sources.get('MAINTAINERS.md');
  requirePatterns(errors, 'MAINTAINERS.md', maintainers, [
    ['Noodle Freeman as the public maintainer', /\| Noodle Freeman \|/],
    ['the @mp4102 GitHub identity', /\[@mp4102\]\(https:\/\/github\.com\/mp4102\)/],
    ['the security and conduct contact', new RegExp(expectedSecurityEmail.replace('.', '\\.'))],
    ['the lack of an independent backup', /没有第二位维护者[\s\S]*不构成冗余/],
  ]);
  const maintainerRows = maintainers
    .split('\n')
    .filter((line) => /^\|/.test(line) && !/公开署名/.test(line) && !/^\|\s*:?-+/.test(line));
  if (maintainerRows.length !== 1) {
    errors.push(`MAINTAINERS.md must list exactly one active maintainer; found ${maintainerRows.length}.`);
  }

  validateCodeowners(sources.get('.github/CODEOWNERS'), errors);

  const names = new Set();
  for (const repositoryPath of formPaths) {
    const form = validateIssueForm({ repositoryPath, source: sources.get(repositoryPath), errors });
    if (form?.name) {
      if (names.has(form.name)) {
        errors.push(`Issue form names must be unique: ${form.name}`);
      }
      names.add(form.name);
    }
  }
  validateIssueChooser({
    repositoryPath: '.github/ISSUE_TEMPLATE/config.yml',
    source: sources.get('.github/ISSUE_TEMPLATE/config.yml'),
    errors,
  });

  const bugForm = sources.get('.github/ISSUE_TEMPLATE/bug.yml');
  requirePatterns(errors, '.github/ISSUE_TEMPLATE/bug.yml', bugForm, [
    ['profile collection', /"id": "profile"/],
    ['Node/npm environment collection', /OS:\\nNode:\\nnpm:/],
    ['minimal reproduction', /"id": "reproduction"/],
    ['sanitized configuration', /"id": "sanitized_config"/],
    ['test evidence', /"id": "evidence"/],
    ['private security routing', /SECURITY\.md/],
  ]);

  const pullRequest = sources.get('.github/PULL_REQUEST_TEMPLATE.md');
  requirePatterns(errors, '.github/PULL_REQUEST_TEMPLATE.md', pullRequest, [
    ['framework version', /Framework version/],
    ['all A1/A2/B/C profiles', /\bA1\b[\s\S]*\bA2\b[\s\S]*\bB\b[\s\S]*\bC\b/],
    ['minimal reproduction and sanitized configuration', /最小复现[\s\S]*脱敏配置/],
    ['Node and npm environment evidence', /Node：[\s\S]*npm：/],
    ['Windows validation commands', /npm\.cmd run test:phase5/],
    ['DCO sign-off', /DCO `Signed-off-by`/],
    ['human-only DCO and Dependabot exception', /所有人类贡献 commit[\s\S]*Dependabot 自动更新/],
    ['customer data and secret restrictions', /客户数据[\s\S]*secret/],
    ['rights evidence', /资产许可清单[\s\S]*第三方材料/],
  ]);

  return {
    errors: sortedUnique(errors),
    governanceDisclosureCount: governanceDisclosurePaths.length,
    governanceNegativeCaseCount,
    issueFormCount: formPaths.length,
    requiredFileCount: requiredFiles.length,
  };
}

export async function runCli() {
  const result = await validateCommunityFiles();
  if (result.errors.length > 0) {
    console.error(`Community health gate FAILED: ${result.errors.length} issue(s).`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return result;
  }
  console.log(
    `Community health gate OK: ${result.requiredFileCount} files and ` +
    `${result.issueFormCount} Issue Forms validated; ` +
    `${result.governanceDisclosureCount} governance disclosures and ` +
    `${result.governanceNegativeCaseCount} negative governance cases checked.`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
