/**
 * 验证公开候选树中 Markdown 的本地链接、图片路径和 Markdown 标题锚点。
 * 外部 URL 只检查协议边界，不做网络请求；远端可达性在发布阶段单独验证。
 */

import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const decoder = new TextDecoder('utf-8', { fatal: true });
const excludedMarkdownPrefixes = [
  'docs/project-log/',
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function listGitCandidates(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return sortedUnique(
    output.split('\0').filter(Boolean).map((entry) => entry.replaceAll('\\', '/')),
  );
}

async function collectExistingPaths(root) {
  const files = new Set();
  const directories = new Set(['']);

  for (const repositoryPath of listGitCandidates(root)) {
    let entry;
    try {
      entry = await lstat(path.join(root, ...repositoryPath.split('/')));
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }
    files.add(repositoryPath);
    let directory = path.posix.dirname(repositoryPath);
    while (directory !== '.') {
      directories.add(directory);
      const parent = path.posix.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }

  return { directories, files };
}

function maskFencedCode(source) {
  return source.replace(
    /(^|\n)[ \t]*(```+|~~~+)[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g,
    (match) => match.replace(/[^\n]/g, ' '),
  );
}

function maskCode(source) {
  const withoutFences = maskFencedCode(source);
  return withoutFences.replace(/(`+)([^\n]*?)\1/g, (match) => match.replace(/[^\n]/g, ' '));
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function parseDestination(rawDestination) {
  const trimmed = rawDestination.trim();
  if (trimmed.startsWith('<')) {
    const closing = trimmed.indexOf('>');
    return closing > 0 ? trimmed.slice(1, closing) : trimmed;
  }
  const titleMatch = trimmed.match(/^(\S+?)(?:\s+["'(].*)?$/);
  return titleMatch?.[1] ?? trimmed;
}

function collectMarkdownDestinations(source) {
  const masked = maskCode(source);
  const links = [];
  const inlinePattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  const definitionPattern = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(\S+|<[^>]+>)/gm;

  for (const match of masked.matchAll(inlinePattern)) {
    links.push({ destination: parseDestination(match[1]), line: lineAt(masked, match.index) });
  }
  for (const match of masked.matchAll(definitionPattern)) {
    links.push({ destination: parseDestination(match[1]), line: lineAt(masked, match.index) });
  }
  return links;
}

function githubSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function collectMarkdownAnchors(source) {
  const masked = maskFencedCode(source);
  const anchors = new Set();
  const slugCounts = new Map();
  const headingPattern = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
  for (const match of masked.matchAll(headingPattern)) {
    const base = githubSlug(match[1]);
    if (!base) {
      continue;
    }
    const count = slugCounts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    slugCounts.set(base, count + 1);
  }
  for (const match of masked.matchAll(/<a\s+(?:name|id)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1]);
  }
  return anchors;
}

function isExternalDestination(destination) {
  return /^(?:https?:|mailto:|tel:|data:|app:|ftp:)/i.test(destination) ||
    destination.startsWith('//');
}

function decodeLinkComponent(value, label, errors) {
  try {
    return decodeURIComponent(value);
  } catch {
    errors.push(`${label} contains invalid percent encoding: ${value}`);
    return null;
  }
}

/** 验证 Git 候选 Markdown 文件中的本地目标与标题锚点。 */
export async function validateMarkdownLinks({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const errors = [];
  const { directories, files } = await collectExistingPaths(resolvedRoot);
  const markdownFiles = [...files]
    .filter((entry) => entry.toLowerCase().endsWith('.md'))
    .filter((entry) => !excludedMarkdownPrefixes.some((prefix) => entry.startsWith(prefix)))
    .sort();
  const sourceCache = new Map();
  const anchorCache = new Map();
  let linkCount = 0;

  async function readMarkdown(repositoryPath) {
    if (!sourceCache.has(repositoryPath)) {
      const bytes = await readFile(path.join(resolvedRoot, ...repositoryPath.split('/')));
      sourceCache.set(repositoryPath, decoder.decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
    }
    return sourceCache.get(repositoryPath);
  }

  for (const sourcePath of markdownFiles) {
    let source;
    try {
      source = await readMarkdown(sourcePath);
    } catch (error) {
      errors.push(`${sourcePath} is not valid UTF-8: ${error.message}`);
      continue;
    }

    for (const link of collectMarkdownDestinations(source)) {
      linkCount += 1;
      const label = `${sourcePath}:${link.line}`;
      const destination = link.destination.trim();
      if (!destination) {
        errors.push(`${label} has an empty Markdown destination.`);
        continue;
      }
      if (isExternalDestination(destination)) {
        continue;
      }

      const hashIndex = destination.indexOf('#');
      const rawPath = hashIndex >= 0 ? destination.slice(0, hashIndex) : destination;
      const rawFragment = hashIndex >= 0 ? destination.slice(hashIndex + 1) : '';
      const withoutQuery = rawPath.split('?', 1)[0];
      const decodedPath = decodeLinkComponent(withoutQuery, label, errors);
      const decodedFragment = decodeLinkComponent(rawFragment, label, errors);
      if (decodedPath === null || decodedFragment === null) {
        continue;
      }

      let targetPath;
      if (!decodedPath) {
        targetPath = sourcePath;
      } else if (decodedPath.startsWith('/')) {
        targetPath = path.posix.normalize(decodedPath.slice(1));
      } else {
        targetPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), decodedPath));
      }

      if (targetPath === '..' || targetPath.startsWith('../') || path.posix.isAbsolute(targetPath)) {
        errors.push(`${label} escapes the repository: ${destination}`);
        continue;
      }
      if (!files.has(targetPath) && !directories.has(targetPath)) {
        errors.push(`${label} points to a missing or case-mismatched local target: ${destination}`);
        continue;
      }

      if (decodedFragment && files.has(targetPath) && targetPath.toLowerCase().endsWith('.md')) {
        if (!anchorCache.has(targetPath)) {
          try {
            anchorCache.set(targetPath, collectMarkdownAnchors(await readMarkdown(targetPath)));
          } catch (error) {
            errors.push(`${label} cannot read anchor target ${targetPath}: ${error.message}`);
            continue;
          }
        }
        if (!anchorCache.get(targetPath).has(decodedFragment)) {
          errors.push(`${label} points to a missing Markdown anchor: ${destination}`);
        }
      }
    }
  }

  return {
    errors: sortedUnique(errors),
    linkCount,
    markdownFileCount: markdownFiles.length,
  };
}

export async function runCli() {
  const result = await validateMarkdownLinks();
  if (result.errors.length > 0) {
    console.error(`Markdown link gate FAILED: ${result.errors.length} issue(s).`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return result;
  }
  console.log(
    `Markdown link gate OK: ${result.linkCount} links across ` +
    `${result.markdownFileCount} Markdown files validated.`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
