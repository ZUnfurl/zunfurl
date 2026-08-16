import { readFile } from "node:fs/promises";
import { enabledLegalPages } from "gcss-config";

import type { ActiveLocale } from "../../i18n/config";
import { activeLocales } from "../../i18n/config";

export type LegalSlug =
  | "privacy-policy"
  | "terms-of-use"
  | "shipping-returns-policy"
  | "customer-service-contact";

interface LegalDocumentConfig {
  slug: LegalSlug;
  file: string;
  fallbackTitle: Record<ActiveLocale, string>;
  description: Record<ActiveLocale, string>;
}

export interface LegalPageEntry {
  locale: ActiveLocale;
  slug: LegalSlug;
}

export interface LegalPage {
  locale: ActiveLocale;
  slug: LegalSlug;
  title: string;
  description: string;
  bodyHtml: string;
  lastUpdated?: string;
  effectiveDate?: string;
}

const legalDocsRoot = new URL("../../../../../docs/legal/", import.meta.url);

const legalDocumentConfigs: LegalDocumentConfig[] = [
  {
    slug: "privacy-policy",
    file: "privacy-policy.md",
    fallbackTitle: {
      en: "Privacy Policy",
      fr: "Politique de confidentialite",
      "zh-cn": "隐私条款",
    },
    description: {
      en: "How Example Brand collects, uses, shares, and protects personal information.",
      fr: "Comment Example Brand collecte, utilise, partage et protege les informations personnelles.",
      "zh-cn": "Example Brand 如何收集、使用、共享和保护个人信息。",
    },
  },
  {
    slug: "terms-of-use",
    file: "terms-of-use.md",
    fallbackTitle: {
      en: "Terms of Use and Sale",
      fr: "Conditions d'utilisation et de vente",
      "zh-cn": "使用条款与销售条款",
    },
    description: {
      en: "Terms for using the Example Brand website and purchasing products.",
      fr: "Conditions applicables a l'utilisation du site Example Brand et a l'achat de produits.",
      "zh-cn": "Example Brand 网站使用和商品购买相关条款。",
    },
  },
  {
    slug: "shipping-returns-policy",
    file: "shipping-returns-policy.md",
    fallbackTitle: {
      en: "Shipping, Returns and Refunds",
      fr: "Livraison, retours et remboursements",
      "zh-cn": "送货、退货与退款政策",
    },
    description: {
      en: "Delivery, return, refund, and after-sales policy for Example Brand orders.",
      fr: "Politique de livraison, retours, remboursements et service apres-vente des commandes Example Brand.",
      "zh-cn": "Example Brand 订单配送、退货、退款和售后政策。",
    },
  },
  {
    slug: "customer-service-contact",
    file: "customer-service-contact.md",
    fallbackTitle: {
      en: "Contact and Customer Service",
      fr: "Contact et service client",
      "zh-cn": "联系我们与客服说明",
    },
    description: {
      en: "How to contact Example Brand and what information to prepare before submitting a request.",
      fr: "Comment contacter Example Brand et quelles informations preparer avant une demande.",
      "zh-cn": "如何联系 Example Brand，以及提交请求前建议准备的信息。",
    },
  },
];

const legalDocumentConfigBySlug = new Map(
  legalDocumentConfigs.map((config) => [config.slug, config]),
);
const enabledLegalSlugSet = new Set<LegalSlug>(enabledLegalPages);

export function isLegalSlug(value: string | undefined): value is LegalSlug {
  return Boolean(value && legalDocumentConfigBySlug.has(value as LegalSlug));
}

export function isEnabledLegalSlug(value: string | undefined): value is LegalSlug {
  return Boolean(value && enabledLegalSlugSet.has(value as LegalSlug));
}

export function getLegalEntries(): LegalPageEntry[] {
  return activeLocales.flatMap((locale) =>
    legalDocumentConfigs
      .filter((config) => enabledLegalSlugSet.has(config.slug))
      .map((config) => ({
        locale,
        slug: config.slug,
      })),
  );
}

export async function getLegalPage(locale: ActiveLocale, slug: LegalSlug): Promise<LegalPage> {
  if (!enabledLegalSlugSet.has(slug)) {
    throw new Error(`Legal page ${slug} is disabled by gcss.project.json.`);
  }

  const config = legalDocumentConfigBySlug.get(slug);

  if (!config) {
    throw new Error(`Unsupported legal slug: ${slug}`);
  }

  const localeDirectory = locale === "zh-cn" ? "zh" : locale;
  const markdownUrl = new URL(`${localeDirectory}/${config.file}`, legalDocsRoot);
  const markdown = redactDirectEmail(await readFile(markdownUrl, "utf8"), locale);
  const parsed = parseLegalMarkdown(markdown);

  return {
    locale,
    slug,
    title: parsed.title || config.fallbackTitle[locale],
    description: config.description[locale],
    bodyHtml: parsed.bodyHtml,
    lastUpdated: parsed.lastUpdated,
    effectiveDate: parsed.effectiveDate,
  };
}

function redactDirectEmail(markdown: string, locale: ActiveLocale) {
  const contactLabel: Record<ActiveLocale, string> = {
    en: "Contact form (/en/contact/)",
    fr: "formulaire de contact (/fr/contact/)",
    "zh-cn": "Contact 表单（/zh-cn/contact/）",
  };

  return markdown.replace(/service@example\.com/g, contactLabel[locale]);
}

function parseLegalMarkdown(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const firstHeading = lines.find((line) => line.startsWith("# "));
  const title = firstHeading?.replace(/^#\s+/, "").trim() ?? "";
  const bodyLines = firstHeading ? lines.slice(lines.indexOf(firstHeading) + 1) : lines;
  const metadata = extractMetadata(bodyLines);

  return {
    title,
    bodyHtml: renderMarkdown(bodyLines.join("\n")),
    ...metadata,
  };
}

function extractMetadata(lines: string[]) {
  const lastUpdated = findMetadataValue(lines, ["最后更新", "Last updated", "Derniere mise a jour"]);
  const effectiveDate = findMetadataValue(lines, ["生效日期", "Effective date", "Date d'effet"]);

  return { lastUpdated, effectiveDate };
}

function findMetadataValue(lines: string[], labels: string[]) {
  for (const line of lines) {
    const trimmed = line.trim();

    for (const label of labels) {
      if (trimmed.startsWith(`${label}:`) || trimmed.startsWith(`${label}：`)) {
        return trimmed.slice(label.length + 1).trim();
      }
    }
  }

  return undefined;
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);

    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];

      while (index < lines.length && (lines[index] ?? "").trim().startsWith("- ")) {
        items.push(`<li>${renderInline((lines[index] ?? "").trim().slice(2))}</li>`);
        index += 1;
      }

      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInline((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }

      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const paragraphLine = lines[index] ?? "";
      const paragraphTrimmed = paragraphLine.trim();

      if (
        !paragraphTrimmed ||
        paragraphTrimmed.startsWith("```") ||
        paragraphTrimmed.startsWith("- ") ||
        /^\d+\.\s+/.test(paragraphTrimmed) ||
        /^#{2,4}\s+/.test(paragraphTrimmed)
      ) {
        break;
      }

      paragraphLines.push(paragraphTrimmed);
      index += 1;
    }

    blocks.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function renderInline(value: string) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
