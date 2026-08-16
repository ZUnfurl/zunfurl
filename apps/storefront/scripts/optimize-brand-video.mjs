import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const projectRoot = process.cwd();
const videoDir = path.join(projectRoot, "public", "brand-assets", "video");
const supportedExtensions = new Set([".mp4", ".mov", ".m4v"]);

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function optimizeVideo(filePath) {
  const inputStats = await fs.stat(filePath);
  const tempPath = `${filePath}.optimized.mp4`;

  await runFfmpeg([
    "-y",
    "-i",
    filePath,
    "-an",
    "-vf",
    "scale='min(1600,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    tempPath,
  ]);

  const outputStats = await fs.stat(tempPath);

  if (outputStats.size < inputStats.size) {
    await fs.rename(tempPath, filePath);
    return {
      filePath,
      beforeBytes: inputStats.size,
      afterBytes: outputStats.size,
      replaced: true,
    };
  }

  await fs.rm(tempPath, { force: true });
  return {
    filePath,
    beforeBytes: inputStats.size,
    afterBytes: inputStats.size,
    replaced: false,
  };
}

async function main() {
  const files = await collectFiles(videoDir);
  const videoFiles = files.filter((filePath) =>
    supportedExtensions.has(path.extname(filePath).toLowerCase()),
  );

  if (videoFiles.length === 0) {
    console.log("No video files found.");
    return;
  }

  const results = [];

  for (const filePath of videoFiles) {
    results.push(await optimizeVideo(filePath));
  }

  const totalBefore = results.reduce((sum, item) => sum + item.beforeBytes, 0);
  const totalAfter = results.reduce((sum, item) => sum + item.afterBytes, 0);
  const savedBytes = totalBefore - totalAfter;
  const optimizedCount = results.filter((item) => item.replaced).length;

  console.log(`Processed ${results.length} video file(s).`);
  console.log(`Optimized ${optimizedCount} video file(s).`);
  console.log(`Size: ${(totalBefore / 1024 / 1024).toFixed(2)} MB -> ${(totalAfter / 1024 / 1024).toFixed(2)} MB.`);
  console.log(`Saved ${(savedBytes / 1024 / 1024).toFixed(2)} MB.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});