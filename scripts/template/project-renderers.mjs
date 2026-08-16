import { getProjectFeatureFlags } from './project-config.mjs';

const profileLabel = {
  'static-brand': 'A 静态品牌官网',
  'cms-brand': 'B 可自维护品牌官网',
  retail: 'C 零售目录与内容运营基础框架 / C Retail Catalog & Content Foundation',
};

export function renderWranglerToml(config) {
  const flags = getProjectFeatureFlags(config);
  const lines = [
    `# Generated from gcss.project.json for ${config.identity.projectName}.`,
    `name = "${config.deployment.workerName}"`,
    'main = "entry.mjs"',
    'compatibility_date = "2026-07-10"',
    '',
    '[vars]',
    `SITE_PROFILE = "${config.delivery.profile}"`,
    `SITE_FEATURE_CONTACT_FORM = "${config.features.contactForm}"`,
    `GITHUB_REPOSITORY = "${config.deployment.githubRepository}"`,
    'GITHUB_API_VERSION = "2022-11-28"',
    `CONTACT_FORM_ENABLED = "${config.features.contactForm}"`,
    'CONTACT_DAILY_LIMIT = "60"',
    'CONTACT_HOURLY_LIMIT = "10"',
    'CONTACT_IP_HOURLY_LIMIT = "3"',
    'CONTACT_IP_DAILY_LIMIT = "8"',
    'CONTACT_EMAIL_HOURLY_LIMIT = "2"',
    'CONTACT_EMAIL_DAILY_LIMIT = "5"',
    'CONTACT_MESSAGE_MAX_LENGTH = "2000"',
    '',
  ];

  if (flags.contactForm || flags.contentCms) {
    lines.push(
      '[[durable_objects.bindings]]',
      'name = "GCSS_COORDINATOR"',
      'class_name = "GcssCoordinator"',
      '',
      '[[migrations]]',
      'tag = "v1"',
      'new_sqlite_classes = ["GcssCoordinator"]',
      '',
    );
  }

  lines.push(
    '[assets]',
    'directory = "../storefront/dist"',
    'binding = "ASSETS"',
    'html_handling = "auto-trailing-slash"',
    'not_found_handling = "404-page"',
    '',
  );
  return lines.join('\n');
}

export function renderEnvExample(config) {
  const flags = getProjectFeatureFlags(config);
  const lines = [
    '# 由 gcss.project.json 派生。真实 secret 只写入本地 .env、平台 secret 或 GitHub Actions secrets。',
    `SITE_PROFILE=${config.delivery.profile}`,
    `SANITY_STUDIO_SITE_PROFILE=${config.delivery.profile}`,
    `CONTENT_SOURCE=${config.delivery.contentSource}`,
    `SITE_FEATURE_CONTACT_FORM=${config.features.contactForm}`,
    '',
  ];

  if (flags.contentCms) {
    lines.push(
      '# Sanity 构建只读配置',
      'SANITY_PROJECT_ID=',
      'SANITY_DATASET=development',
      'SANITY_API_VERSION=2026-06-20',
      'SANITY_USE_CDN=true',
      'SANITY_API_READ_TOKEN=',
      '',
      '# Sanity Studio 公开构建配置',
      'SANITY_STUDIO_PROJECT_ID=',
      'SANITY_STUDIO_DATASET=development',
      `SANITY_STUDIO_HOST=${config.deployment.studioHost}`,
      `SANITY_STUDIO_STOREFRONT_ORIGIN=https://${config.identity.domain}`,
      '',
      '# Sanity webhook -> Worker -> GitHub repository_dispatch',
      'SANITY_WEBHOOK_SECRET=',
      'GITHUB_DISPATCH_TOKEN=',
      '',
    );
  }

  if (flags.commerce) {
    lines.push(
      '# Shopify Storefront API 只读目录映射；不包含交易能力，不要填写 Admin API token',
      'SHOPIFY_STORE_DOMAIN=',
      'SHOPIFY_STOREFRONT_ACCESS_TOKEN=',
      'SHOPIFY_STOREFRONT_API_VERSION=2026-04',
      'SANITY_STUDIO_SHOPIFY_STORE_DOMAIN=',
      'SANITY_STUDIO_SHOPIFY_STOREFRONT_ACCESS_TOKEN=',
      'SANITY_STUDIO_SHOPIFY_STOREFRONT_API_VERSION=2026-04',
      'SHOPIFY_WEBHOOK_SECRET=',
      '',
    );
  }

  if (flags.contactForm) {
    lines.push(
      '# Contact 表单：Turnstile + Resend + Durable Object 原子限流',
      'PUBLIC_TURNSTILE_SITE_KEY=',
      'TURNSTILE_SECRET_KEY=',
      'RESEND_API_KEY=',
      'CONTACT_RECIPIENT_EMAIL=',
      'RESEND_FROM_EMAIL=',
      'CONTACT_HMAC_SECRET=',
      `CONTACT_ALLOWED_ORIGINS=https://${config.identity.domain}`,
      'CONTACT_FORM_ENABLED=true',
      '',
    );
  }

  lines.push(
    '# GitHub Actions / Cloudflare 部署凭据',
    'CLOUDFLARE_ACCOUNT_ID=',
    'CLOUDFLARE_API_TOKEN=',
    '',
  );
  return lines.join('\n');
}

export function renderRobotsTxt(config) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: https://${config.identity.domain}/sitemap.xml`,
    '',
  ].join('\n');
}

export function renderReadmeSummary(config) {
  const features = getProjectFeatureFlags(config);
  return [
    '<!-- gcss-project-summary:start -->',
    `> 当前项目：**${config.identity.brandName}**  \\`,
    `> 交付方案：**${profileLabel[config.delivery.profile]}**  \\`,
    `> 正式域名：\`${config.identity.domain}\`  \\`,
    `> 内容源：\`${config.delivery.contentSource}\`；语言：\`${config.delivery.locales.join(', ')}\`  \\`,
    `> Contact：${features.contactForm ? '启用' : '关闭'}；Shopify 只读目录映射：${features.commerce ? '启用' : '关闭'}`,
    '<!-- gcss-project-summary:end -->',
  ].join('\n');
}

export function upsertReadmeSummary(source, config) {
  const summary = renderReadmeSummary(config);
  const markerPattern = /<!-- gcss-project-summary:start -->[\s\S]*?<!-- gcss-project-summary:end -->/;
  let content = markerPattern.test(source)
    ? source.replace(markerPattern, summary)
    : source.replace(/^(#[^\r\n]+\r?\n)/, `$1\n${summary}\n`);

  content = content.replace(/^#\s+[^\r\n]+/m, `# ${config.identity.projectName}`);
  return content;
}
