import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const replacementCharacterPattern = /\uFFFD/u;
const repeatedQuestionMarkPattern = /\?{3,}/u;
const binaryExtensions = new Set([
  '.7z',
  '.avif',
  '.bin',
  '.bmp',
  '.dll',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.rar',
  '.tar',
  '.tgz',
  '.tif',
  '.tiff',
  '.ttf',
  '.wasm',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function decodeUtf8(buffer, displayPath) {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw new Error(`${displayPath}: 不是有效的 UTF-8 文本。`);
  }
}

function isKnownBinary(filePath, buffer) {
  return binaryExtensions.has(path.extname(filePath).toLowerCase()) || buffer.includes(0);
}

function isChineseSourcePath(filePath) {
  const normalized = toPosixPath(filePath);

  return (
    normalized.startsWith('apps/storefront/src/content/') && normalized.includes('/zh-cn/')
  ) || normalized.startsWith('docs/legal/zh/');
}

async function validateCandidateFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: repoRoot,
      encoding: 'buffer',
    },
  );
  const candidatePaths = output
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  let textCount = 0;
  let jsonCount = 0;
  let missingCount = 0;

  for (const relativePath of candidatePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    let buffer;

    try {
      buffer = await readFile(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        missingCount += 1;
        continue;
      }

      throw error;
    }

    if (isKnownBinary(relativePath, buffer)) continue;

    const text = decodeUtf8(buffer, relativePath);
    textCount += 1;
    assert(!replacementCharacterPattern.test(text), `${relativePath}: 包含替换字符 U+FFFD。`);

    if (isChineseSourcePath(relativePath)) {
      assert(
        !repeatedQuestionMarkPattern.test(text),
        `${relativePath}: 中文目录包含连续三个或更多问号。`,
      );
    }

    if (path.extname(relativePath).toLowerCase() === '.json') {
      try {
        JSON.parse(text);
      } catch (error) {
        throw new Error(`${relativePath}: JSON 解析失败：${error.message}`);
      }

      jsonCount += 1;
    }
  }

  return { jsonCount, missingCount, textCount };
}

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function validateBuiltChinesePages() {
  const distRoots = [path.join(repoRoot, 'dist'), path.join(repoRoot, 'apps/storefront/dist')];
  let checkedRoots = 0;
  let checkedFiles = 0;

  for (const distRoot of distRoots) {
    if (!(await directoryExists(distRoot))) continue;

    const chineseDistRoot = path.join(distRoot, 'zh-cn');
    assert(
      await directoryExists(chineseDistRoot),
      `${toPosixPath(path.relative(repoRoot, distRoot))}: 构建目录存在，但缺少 zh-cn 输出。`,
    );
    checkedRoots += 1;

    for (const absolutePath of await listFilesRecursively(chineseDistRoot)) {
      const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));
      const buffer = await readFile(absolutePath);

      if (isKnownBinary(relativePath, buffer)) continue;

      const text = decodeUtf8(buffer, relativePath);
      assert(!replacementCharacterPattern.test(text), `${relativePath}: 构建产物包含替换字符 U+FFFD。`);
      assert(
        !repeatedQuestionMarkPattern.test(text),
        `${relativePath}: 中文构建产物包含连续三个或更多问号。`,
      );
      checkedFiles += 1;
    }
  }

  return { checkedFiles, checkedRoots };
}

const candidate = await validateCandidateFiles();
const built = await validateBuiltChinesePages();
const distSummary = built.checkedRoots === 0
  ? '未发现 dist，已跳过构建产物检查'
  : `检查 ${built.checkedRoots} 个 dist 根目录中的 ${built.checkedFiles} 个中文文本产物`;

console.log(
  `Content encoding OK: ${candidate.textCount} 个候选文本文件通过 fatal UTF-8 与 U+FFFD 检查；` +
    `${candidate.jsonCount} 个 JSON 文件解析成功；中文源码无连续三个以上问号；${distSummary}。`,
);

if (candidate.missingCount > 0) {
  console.log(`备注：${candidate.missingCount} 个索引路径已从当前工作树删除，因此未作为文本读取。`);
}
