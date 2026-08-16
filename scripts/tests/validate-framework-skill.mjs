import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve('.agents/skills/gcss-v3-site-framework');
const skillPath = path.join(root, 'SKILL.md');
const skill = await readFile(skillPath, 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

assert(skill.startsWith('---\n'), 'Skill must start with YAML frontmatter.');
assert(/\nname:\s*gcss-v3-site-framework\n/.test(skill), 'Skill frontmatter must declare the framework name.');
assert(/\ndescription:\s*\S/.test(skill), 'Skill frontmatter must include a description.');
assert(skill.split(/\r?\n/).length < 300, 'Main SKILL.md must remain concise; move detail into references.');

const references = [...skill.matchAll(/`(references\/[^`]+\.md)`/g)].map((match) => match[1]);
assert(references.length >= 10, 'Skill must route detailed work into reference files.');
for (const relativePath of new Set(references)) await access(path.join(root, relativePath));

const ownershipReferencePath = 'references/platform-ownership-and-handoff.md';
assert(references.includes(ownershipReferencePath), 'Skill must route platform ownership and handoff work.');
const ownershipReference = await readFile(path.join(root, ownershipReferencePath), 'utf8');
assert(ownershipReference.includes('代理注册”是实施职责，不改变资产所有权'), 'Ownership reference must preserve client ownership during proxy registration.');
assert(ownershipReference.includes('客户专属 GitHub Organization'), 'Ownership reference must require a client GitHub Organization from day one.');

const workflowReferencePath = 'references/new-project-workflow.md';
assert(references.includes(workflowReferencePath), 'Skill must route every profile through the shared new-project workflow.');
const workflowReference = await readFile(path.join(root, workflowReferencePath), 'utf8');
for (const expected of ['公开框架 Template repository', 'Use this template', '客户专属 GitHub Organization', 'Codex 本地项目', 'dry-run', '完全交付']) {
  assert(workflowReference.includes(expected), `Shared new-project workflow must include ${expected}.`);
}

for (const guideName of ['new-project-static-brand.md', 'new-project-cms-brand.md', 'new-project-retail.md']) {
  const guide = await readFile(path.join(root, 'references', guideName), 'utf8');
  assert(guide.includes('new-project-workflow.md'), `${guideName} must inherit the shared new-project workflow.`);
  assert(guide.includes('公开框架 Template repository'), `${guideName} must use the public upstream template.`);
  assert(guide.includes('客户专属 GitHub Organization'), `${guideName} must preserve client repository ownership.`);
  assert(guide.includes('完全交付'), `${guideName} must preserve the complete-handoff gate.`);
}

const startupPolicy = await readFile('docs/project-startup-and-handoff.md', 'utf8');
for (const expected of ['ZUnfurl', '公开 GitHub Template repository', 'A1、A2、B、C', 'Use this template', 'Include all branches', '客户专属 GitHub Organization', 'Codex 本地项目', '完全交付门槛']) {
  assert(startupPolicy.includes(expected), `Startup and handoff policy must include ${expected}.`);
}

const consistencyDocs = {
  agents: await readFile('AGENTS.md', 'utf8'),
  readme: await readFile('README.md', 'utf8'),
  templatePlan: await readFile('docs/gcss-v3-site-framework-template-plan.md', 'utf8'),
  customerIndex: await readFile('docs/customer-operations.md', 'utf8'),
};
for (const [name, document] of Object.entries(consistencyDocs)) {
  assert(document.includes('公开框架 Template repository'), `${name} must identify the public upstream template.`);
  assert(document.includes('客户专属 GitHub Organization'), `${name} must use the client-specific GitHub Organization startup rule.`);
  assert(document.includes('完全交付'), `${name} must use the complete-handoff rule.`);
  assert(!document.includes('新仓库或干净副本'), `${name} must not allow an ambiguous clean-copy startup path.`);
  assert(!/私有(?:框架仓库|框架 Template repository| Template repository)/.test(document), `${name} must not describe the public upstream as private.`);
}

const publicPositioningDocuments = {
  agents: consistencyDocs.agents,
  readme: consistencyDocs.readme,
  skill,
  profiles: await readFile(path.join(root, 'references/profiles.md'), 'utf8'),
};
for (const [name, document] of Object.entries(publicPositioningDocuments)) {
  assert(
    document.includes('Retail Catalog & Content Foundation') || document.includes('零售目录与内容运营基础框架'),
    `${name} must use the approved C public positioning.`,
  );
}

assert(skill.includes('local project rooted at the cloned client repository'), 'Skill must reject initialization from the framework or another client workspace.');

const mentionedScripts = [...skill.matchAll(/npm\.cmd run ([a-z0-9:.-]+)/gi)].map((match) => match[1]);
for (const scriptName of new Set(mentionedScripts)) {
  assert(packageJson.scripts[scriptName], `Skill references missing npm script: ${scriptName}.`);
}

try {
  await access('docs/codex-skills/gcss-v3-site-framework/SKILL.md');
  throw new Error('Legacy docs/codex-skills copy must be removed to prevent Skill drift.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const agentMetadata = await readFile(path.join(root, 'agents/openai.yaml'), 'utf8');
assert(agentMetadata.includes('gcss-v3-site-framework'), 'Skill agent metadata must reference the framework.');

console.log(`Framework Skill OK: ${new Set(references).size} references and ${new Set(mentionedScripts).size} commands validated.`);
