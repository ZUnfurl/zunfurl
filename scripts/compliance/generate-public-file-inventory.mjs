import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_JSON = 'docs/compliance/public-file-inventory.json';
const OUTPUT_MARKDOWN = 'docs/compliance/public-file-inventory.md';
const SOURCE_DATE = '2026-08-15';

const selfEvidencePaths = new Set([OUTPUT_JSON, OUTPUT_MARKDOWN]);

const exactSourceDecisions = new Map([
  [
    'docs/astro-sanity-shopify-cloudflare-retail-framework-v2.1.md',
    ['exclude', 'OLD_ARCHITECTURE_WITH_PRIVATE_METRICS'],
  ],
  [
    'docs/client-v3-architecture-advantages.md',
    ['exclude', 'COMMERCIAL_SALES_COLLATERAL'],
  ],
  [
    'docs/contact-lightweight-form-design.md',
    ['rewrite', 'PUBLIC_CONTACT_DESIGN_REWRITE'],
  ],
  [
    'docs/customer-operations.md',
    ['rewrite', 'RETAIL_CATALOG_TERMINOLOGY_REWRITE'],
  ],
  [
    'docs/customer-operations-retail.md',
    ['rewrite', 'RETAIL_CATALOG_TERMINOLOGY_REWRITE'],
  ],
  [
    'docs/customer-product-operations.md',
    ['rewrite', 'RETAIL_CATALOG_TERMINOLOGY_REWRITE'],
  ],
  [
    'docs/framework-module-audit.md',
    ['exclude', 'INTERNAL_IMPLEMENTATION_AUDIT'],
  ],
  [
    'docs/framework-productization-plan.md',
    ['exclude', 'INTERNAL_COMMERCIAL_PLAN'],
  ],
  [
    'docs/gcss-v3-site-framework-template-plan.md',
    ['rewrite', 'PUBLIC_ARCHITECTURE_REWRITE'],
  ],
  [
    'docs/project-startup-and-handoff.md',
    ['rewrite', 'PUBLIC_REPOSITORY_WORKFLOW_REWRITE'],
  ],
  [
    'docs/site-image-source-migration-plan.md',
    ['exclude', 'INTERNAL_MIGRATION_PLAN'],
  ],
  [
    'docs/storefront-page-layering.md',
    ['exclude', 'INTERNAL_MIGRATION_CHRONOLOGY'],
  ],
]);

const reasonCodes = {
  ASSET_REPLACEMENT_REQUIRED: '来源提交中的媒体或品牌视觉权利证据不足，必须用已登记素材替换。',
  COMMERCIAL_SALES_COLLATERAL: '面向客户的销售说辞包含超出首个 Preview 的能力表达，不进入公共候选。',
  CURRENT_PUBLIC_SOURCE: '当前实现或公共说明属于候选范围，可保留并继续接受后续 Gate。',
  GENERATED_LOCKFILE: '可重现安装所需的生成锁文件；保留并由依赖 Gate 验证。',
  INTERNAL_COMMERCIAL_PLAN: '内部商业分层和产品化计划不属于开源使用者文档。',
  INTERNAL_IMPLEMENTATION_AUDIT: '实现过程审计已经漂移，不能作为公开权威。',
  INTERNAL_MIGRATION_CHRONOLOGY: '内部页面演进和迁移时间线不属于公开契约。',
  INTERNAL_MIGRATION_PLAN: '内部迁移计划已由 Skill 的稳定图片政策取代。',
  INTERNAL_PROJECT_LOG: '私有工程日志含仓库状态、阶段证据或内部判断，从公共候选排除。',
  OLD_ARCHITECTURE_WITH_PRIVATE_METRICS: '旧架构文档包含来源站点指标和已不支持的交易、Preview、Backup/Restore 表述。',
  PUBLIC_ARCHITECTURE_REWRITE: '保留主题，但必须改写为 ZUnfurl 公开架构和当前能力矩阵。',
  PUBLIC_CONTACT_DESIGN_REWRITE: 'Contact 设计保留技术价值，但需删除时效价格、内部状态和未验证表述。',
  PUBLIC_REPOSITORY_WORKFLOW_REWRITE: '原文假定私有框架模板，公开仓库发布前必须改写启动口径。',
  RETAIL_CATALOG_TERMINOLOGY_REWRITE: 'C 必须改称 Retail Catalog & Content Foundation，并删除框架提供购买流程的暗示。',
  REWRITTEN_CANDIDATE_PENDING_GATE: '工作树中已提供候选替换，仍需对应编码、文本或资产 Gate 验证。',
  SOURCE_LEGAL_REWRITE_REQUIRED: '来源提交中的中文法律示例损坏，必须以中性 UTF-8 示例重写。',
  SOURCE_FILE_REMOVED_FROM_CANDIDATE: '工作树已移除来源文件；公共候选不得继续携带该 blob。',
  SOURCE_TEXT_REWRITE_REQUIRED: '来源提交中的中文示例损坏，必须以中性 UTF-8 示例重写。',
  WORKTREE_COMPLIANCE_EVIDENCE: '本地一次性扫描证据，不进入最终公共源码树。',
};

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.root ?? process.cwd(),
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function splitNull(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean).map(toPosixPath);
}

function classify(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (relativePath.startsWith('.agents/skills/')) return 'skill';
  if (relativePath.startsWith('.github/workflows/')) return 'workflow';
  if (relativePath.startsWith('docs/project-log/')) return 'internal-log';
  if (relativePath.startsWith('docs/legal/')) return 'legal-template';
  if (
    relativePath.startsWith('docs/customer-') ||
    relativePath === 'docs/client-v3-architecture-advantages.md' ||
    relativePath === 'docs/project-startup-and-handoff.md'
  ) return 'commercial-delivery-doc';
  if (relativePath.startsWith('docs/compliance/')) return 'compliance-evidence';
  if (
    relativePath.startsWith('docs/open-source-') ||
    relativePath === 'docs/release-policy.md' ||
    relativePath === 'docs/release-status.md' ||
    relativePath === 'docs/roadmap.md'
  ) return 'governance-doc';
  if (relativePath.startsWith('docs/')) return 'architecture-doc';
  if (relativePath.includes('/public/brand-assets/logo/')) return 'logo';
  if (relativePath.endsWith('/favicon.ico') || relativePath.endsWith('/favicon.svg')) return 'favicon';
  if (relativePath.includes('/public/brand-assets/video/') || ['.mp4', '.webm'].includes(extension)) return 'video';
  if (relativePath.includes('/public/brand-assets/') || ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(extension)) return 'image';
  if (relativePath.startsWith('apps/storefront/src/content/')) return 'example-content';
  if (relativePath.startsWith('scripts/tests/')) return 'test';
  if (relativePath.startsWith('scripts/')) return 'tooling';
  if (relativePath === 'package-lock.json') return 'generated';
  if (
    relativePath.endsWith('package.json') ||
    relativePath.endsWith('tsconfig.json') ||
    relativePath.endsWith('wrangler.toml') ||
    relativePath === '.env.example' ||
    relativePath === 'gcss.project.json' ||
    relativePath === 'gcss.project.schema.json'
  ) return 'configuration';
  if (relativePath === 'README.md' || relativePath === 'AGENTS.md') return 'repository-doc';
  return 'source-code';
}

function sourceDecision(relativePath, category) {
  if (relativePath.startsWith('docs/project-log/')) {
    return { decision: 'exclude', reasonCode: 'INTERNAL_PROJECT_LOG' };
  }
  if (exactSourceDecisions.has(relativePath)) {
    const [decision, reasonCode] = exactSourceDecisions.get(relativePath);
    return { decision, reasonCode };
  }
  if (
    relativePath.startsWith('apps/storefront/public/brand-assets/') ||
    relativePath === 'apps/storefront/public/favicon.ico' ||
    relativePath === 'apps/storefront/public/favicon.svg'
  ) {
    return { decision: 'rewrite', reasonCode: 'ASSET_REPLACEMENT_REQUIRED' };
  }
  if (
    relativePath.startsWith('apps/storefront/src/content/pages/zh-cn/') ||
    relativePath.startsWith('apps/storefront/src/content/product-locale-pages/zh-cn/')
  ) {
    return { decision: 'rewrite', reasonCode: 'SOURCE_TEXT_REWRITE_REQUIRED' };
  }
  if (relativePath.startsWith('docs/legal/zh/')) {
    return { decision: 'rewrite', reasonCode: 'SOURCE_LEGAL_REWRITE_REQUIRED' };
  }
  if (category === 'generated') {
    return { decision: 'include', reasonCode: 'GENERATED_LOCKFILE' };
  }
  return { decision: 'include', reasonCode: 'CURRENT_PUBLIC_SOURCE' };
}

function overlayDecision(relativePath, category, sourceRecord) {
  if (relativePath.startsWith('docs/project-log/')) {
    return { decision: 'exclude', reasonCode: 'INTERNAL_PROJECT_LOG' };
  }
  if (
    relativePath === 'docs/compliance/public-text-scan-current.json' ||
    relativePath === 'docs/compliance/public-text-scan-history.json'
  ) {
    return { decision: 'exclude', reasonCode: 'WORKTREE_COMPLIANCE_EVIDENCE' };
  }
  if (sourceRecord?.decision === 'rewrite' && ['example-content', 'legal-template', 'image', 'logo', 'video', 'favicon'].includes(category)) {
    return { decision: 'include', reasonCode: 'REWRITTEN_CANDIDATE_PENDING_GATE' };
  }
  return sourceDecision(relativePath, category);
}

function parseTreeRecord(record) {
  const separator = record.indexOf('\t');
  const metadata = record.slice(0, separator).trim().split(/\s+/);
  return {
    blobSha: metadata[2],
    path: toPosixPath(record.slice(separator + 1)),
    sizeBytes: Number(metadata[3]),
  };
}

async function fileDigest(absolutePath) {
  const buffer = await readFile(absolutePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function collectSourceFiles(root, sourceCommit) {
  const raw = runGit(['ls-tree', '-r', '-l', '-z', sourceCommit], { root, encoding: 'buffer' });
  return splitNull(raw).map(parseTreeRecord).map((entry) => {
    const category = classify(entry.path);
    return { ...entry, category, ...sourceDecision(entry.path, category) };
  });
}

async function collectWorktreeOverlay(root, sourceCommit, sourceFiles) {
  const modified = splitNull(runGit(['diff', '--name-only', '-z', sourceCommit], { root, encoding: 'buffer' }));
  const untracked = splitNull(runGit(['ls-files', '--others', '--exclude-standard', '-z'], { root, encoding: 'buffer' }));
  const paths = [...new Set([...modified, ...untracked])]
    .filter((relativePath) => !selfEvidencePaths.has(relativePath))
    .sort();
  const sourceByPath = new Map(sourceFiles.map((entry) => [entry.path, entry]));
  const overlay = [];

  for (const relativePath of paths) {
    const absolutePath = path.resolve(root, relativePath);
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      overlay.push({
        path: relativePath,
        status: 'deleted',
        category: sourceByPath.get(relativePath)?.category ?? classify(relativePath),
        decision: 'exclude',
        reasonCode: 'SOURCE_FILE_REMOVED_FROM_CANDIDATE',
      });
      continue;
    }
    if (!fileStat.isFile()) continue;
    const category = classify(relativePath);
    overlay.push({
      path: relativePath,
      status: sourceByPath.has(relativePath) ? 'modified' : 'untracked',
      sizeBytes: fileStat.size,
      sha256: await fileDigest(absolutePath),
      category,
      ...overlayDecision(relativePath, category, sourceByPath.get(relativePath)),
    });
  }

  return overlay;
}

function summarize(entries) {
  const summary = {};
  for (const entry of entries) summary[entry.decision] = (summary[entry.decision] ?? 0) + 1;
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

function markdownTable(rows) {
  return [
    '| 路径 | 类别 | 决定 | 原因 |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| \`${row.path}\` | ${row.category} | ${row.decision} | ${reasonCodes[row.reasonCode]} |`),
  ].join('\n');
}

async function loadScanSummary(root, relativePath) {
  try {
    const document = JSON.parse(await readFile(path.resolve(root, relativePath), 'utf8'));
    const byRule = {};
    for (const finding of document.findings ?? []) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
    return {
      findings: document.findings?.length ?? 0,
      scanned: document.mode === 'history' ? document.scannedTextBlobs : document.scannedTextFiles,
      byRule,
    };
  } catch {
    return null;
  }
}

function buildMarkdown({ inventory, currentScan, historyScan }) {
  const sourceByPath = new Map(inventory.sourceFiles.map((entry) => [entry.path, entry]));
  const worktreeByPath = new Map(inventory.worktreeOverlay.map((entry) => [entry.path, entry]));
  const effective = (relativePath) => worktreeByPath.get(relativePath) ?? sourceByPath.get(relativePath);
  const projectLogs = [
    'docs/project-log/daily/2026-07-07.md',
    'docs/project-log/daily/2026-07-10.md',
    'docs/project-log/daily/2026-08-15.md',
  ].map(effective).filter(Boolean);
  const commercialDocs = [
    'docs/client-v3-architecture-advantages.md',
    'docs/framework-productization-plan.md',
    'docs/customer-operations.md',
    'docs/customer-operations-static-brand.md',
    'docs/customer-operations-cms-brand.md',
    'docs/customer-operations-retail.md',
    'docs/customer-page-operations.md',
    'docs/customer-product-operations.md',
    'docs/project-startup-and-handoff.md',
  ].map(effective).filter(Boolean);
  const oldArchitectureDocs = [
    'docs/astro-sanity-shopify-cloudflare-retail-framework-v2.1.md',
    'docs/contact-lightweight-form-design.md',
    'docs/framework-module-audit.md',
    'docs/gcss-v3-site-framework-template-plan.md',
    'docs/site-image-source-migration-plan.md',
    'docs/storefront-page-layering.md',
  ].map(effective).filter(Boolean);
  const historyByRule = historyScan
    ? Object.entries(historyScan.byRule).map(([rule, count]) => `\`${rule}\` ${count}`).join('、')
    : '尚未生成';

  return `# 公开文件清单与处置决定

> 清单日期：${SOURCE_DATE}
>
> 候选源 commit：\`${inventory.sourceCommit}\`
>
> 机器清单：\`docs/compliance/public-file-inventory.json\`

本清单固定 Phase 1 的来源树，并把工作树中的净化替换作为 overlay 单独记录。来源 commit 的 ${inventory.sourceFiles.length} 个 tracked path 均记录 Git blob SHA、字节数、类别和 \`include / rewrite / exclude\` 决定。清单文件本身不递归登记；Phase 6 必须在冻结候选 commit 后重新生成最终 tree manifest。

## 决定语义

- \`include\`：属于公共候选范围，但仍需通过对应 Content、Rights、Security 或 Engineering Gate。
- \`rewrite\`：不得发布来源 blob；只有通过 Gate 的工作树替换才能进入候选。
- \`exclude\`：不进入公共候选树，也不通过修改旧历史来隐藏；新公共历史从批准树重新建立。

来源树决定汇总：\`${JSON.stringify(inventory.sourceDecisionSummary)}\`。当前工作树 overlay 汇总：\`${JSON.stringify(inventory.worktreeDecisionSummary)}\`。

## 项目日志逐项决定

${markdownTable(projectLogs)}

项目日志只留在私有档案。面向公共使用者的稳定信息必须进入 README、Release Status、Roadmap、Security 或版本化迁移说明，而不是复制内部时间线。

## 商业交付材料逐项决定

${markdownTable(commercialDocs)}

静态站、CMS 品牌站和页面运营手册可以保留；涉及 C 的文档必须统一改称 Retail Catalog & Content Foundation，不得暗示框架提供 Cart、Checkout、支付、订单或履约。

## 旧架构与迁移文档逐项决定

${markdownTable(oldArchitectureDocs)}

旧 C v2.1 文档含来源站点流量指标，并把动态购买、Preview、Backup 和 Restore 写成现有架构，因此直接排除。需要保留的主题应从当前实现和 Release Status 重新写，而不是修补旧结论。

## Fixture 净化

- Shopify 测试店铺统一改成明确虚构的 \`example-store.myshopify.com\` 或 \`example-brand-test.myshopify.com\`。
- 13 位拟真 Product ID 改成全零 ID；最小合约测试允许 \`Product/1\`，并在显式 allowlist 中登记。
- 文档邮箱统一使用 \`example.com\`；D-10 Security/CoC 邮箱只在批准的治理文档中按摘要哈希放行。
- Schema \`$id\` 已从未控制的 HTTPS 域名改为已批准的稳定 URN。

## 文本与历史扫描

- 当前树：${currentScan ? `扫描 ${currentScan.scanned} 个文本文件，未批准命中 ${currentScan.findings}` : '尚未生成报告'}。
- 可达历史：${historyScan ? `扫描 ${historyScan.scanned} 个文本 blob，发现 ${historyScan.findings} 个未批准命中（${historyByRule}）` : '尚未生成报告'}。
- 报告只保存路径、行号、规则和摘要哈希；不保存或回显疑似值。
- 历史报告是生成净化新历史的输入，不能据此改写现有私有仓库历史。

执行命令：

\`\`\`powershell
node scripts/tests/validate-public-text.mjs --current --report docs/compliance/public-text-scan-current.json
node scripts/tests/validate-public-text.mjs --history --report docs/compliance/public-text-scan-history.json
node scripts/compliance/generate-public-file-inventory.mjs
\`\`\`
`;
}

export async function generateInventory({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const sourceCommit = runGit(['rev-parse', 'HEAD'], { root: resolvedRoot }).trim();
  const sourceFiles = await collectSourceFiles(resolvedRoot, sourceCommit);
  const worktreeOverlay = await collectWorktreeOverlay(resolvedRoot, sourceCommit, sourceFiles);
  const inventory = {
    schemaVersion: 1,
    inventoryDate: SOURCE_DATE,
    sourceCommit,
    scope: {
      source: 'git ls-tree -r -l <sourceCommit>',
      overlay: 'tracked modifications and non-ignored untracked files',
      selfEvidencePaths: [...selfEvidencePaths].sort(),
      note: '自引用清单不递归登记；冻结候选 commit 后必须重新生成最终 tree manifest。',
    },
    reasonCodes,
    sourceDecisionSummary: summarize(sourceFiles),
    worktreeDecisionSummary: summarize(worktreeOverlay),
    sourceFiles,
    worktreeOverlay,
  };
  const currentScan = await loadScanSummary(resolvedRoot, 'docs/compliance/public-text-scan-current.json');
  const historyScan = await loadScanSummary(resolvedRoot, 'docs/compliance/public-text-scan-history.json');
  const markdown = buildMarkdown({ inventory, currentScan, historyScan });

  await mkdir(path.resolve(resolvedRoot, 'docs/compliance'), { recursive: true });
  await writeFile(path.resolve(resolvedRoot, OUTPUT_JSON), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  await writeFile(path.resolve(resolvedRoot, OUTPUT_MARKDOWN), markdown, 'utf8');
  return inventory;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateInventory()
    .then((inventory) => {
      console.log(
        `Public file inventory generated: source=${inventory.sourceFiles.length}; overlay=${inventory.worktreeOverlay.length}.`,
      );
    })
    .catch((error) => {
      console.error(`Public file inventory error: ${error.message}`);
      process.exitCode = 1;
    });
}
