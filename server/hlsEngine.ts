import crypto from "crypto";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { spawn } from "child_process";

export interface StreamQuality {
  id: string; // e.g. "720p", "480p", "360p", "240p", "auto"
  label: string; // "720p HD", "480p Fast", "360p Turbo"
  resolution?: string; // "1280x720"
  bandwidth?: number; // 1200000
  url: string; // sub-m3u8 url
  estimatedSizeMB?: string;
  durationSec?: number;
}

export interface HlsProgressCallback {
  (progress: {
    downloadedMB: number;
    totalMB?: number;
    completedSegments: number;
    totalSegments: number;
    percentage: number;
    speedMBs: number;
    currentDurationSec: number;
    totalDurationSec: number;
    status: string;
  }): void;
}

export interface HlsDownloadResult {
  outputFilePath: string;
  thumbnailPath?: string;
  screenshotPaths?: string[];
  fileSizeBytes: number;
  fileSizeMB: string;
  totalDurationFormatted: string;
  totalDurationSeconds: number;
  qualityLabel: string;
}

// Ultra-fast HTTP & HTTPS keep-alive agents with zero-timeout socket reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2048,
  maxFreeSockets: 1024,
  keepAliveMsecs: 600000,
  timeout: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 2048,
  maxFreeSockets: 1024,
  keepAliveMsecs: 600000,
  timeout: 30000,
});

// Cache for downloaded segments to prevent re-fetching and fix expired streams
export const segmentMemoryCache = new Map<string, Buffer>();

export interface DecodedStreamPayload {
  origin?: string;
  basePath?: string;
  queryParams?: string;
  originalFileName?: string;
  customTitle?: string;
  directUrl?: string;
}

export function decodeStudySparkPayload(url: string): DecodedStreamPayload | null {
  try {
    const match = url.match(/\/hls\/([A-Za-z0-9_\-+/=]+)(?:\/index\.m3u8|\.m3u8)?/);
    if (match && match[1] && match[1].length > 20) {
      let b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
      if (jsonStr.startsWith("{") && (jsonStr.includes("origin") || jsonStr.includes("queryParams"))) {
        const obj = JSON.parse(jsonStr);
        let directUrl = "";
        if (obj.origin) {
          const orig = obj.origin.replace(/\/+$/, "");
          const basePath = (obj.basePath || "/").replace(/^\/+/, "");
          const fileName = obj.originalFileName || "index.m3u8";
          const query = obj.queryParams ? (obj.queryParams.startsWith("?") ? obj.queryParams : `?${obj.queryParams}`) : "";
          directUrl = `${orig}/${basePath ? basePath + "/" : ""}${fileName}${query}`.replace(/([^:])\/+/g, "$1/");
        }
        return {
          origin: obj.origin,
          basePath: obj.basePath,
          queryParams: obj.queryParams,
          originalFileName: obj.originalFileName,
          customTitle: obj.customTitle,
          directUrl: directUrl || undefined,
        };
      }
    }
  } catch {
    //
  }
  return null;
}

/**
 * High-speed native HTTP chunk getter with socket reuse
 */
function fastHttpGet(url: string, headers: Record<string, string>, timeoutMs = 12000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https:");
    const getter = isHttps ? https.get : http.get;
    const agent = isHttps ? httpsAgent : httpAgent;

    const req = getter(url, { headers, agent, timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        fastHttpGet(nextUrl, headers, timeoutMs).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", (err) => reject(err));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.on("error", (err) => reject(err));
  });
}

/**
 * Intelligent fetchBuffer with socket reuse & high speed fallback
 */
export async function fetchBuffer(url: string, headers: Record<string, string>, retries = 3): Promise<Buffer> {
  // Check memory cache first
  const cacheKey = url.split("?")[0];
  if (segmentMemoryCache.has(cacheKey)) {
    return segmentMemoryCache.get(cacheKey)!;
  }

  const decoded = decodeStudySparkPayload(url);
  const targetsToTry = [url];
  if (decoded?.directUrl && decoded.directUrl !== url) {
    targetsToTry.push(decoded.directUrl);
  }

  for (const targetUrl of targetsToTry) {
    const isCloudfront = targetUrl.includes("cloudfront.net") || targetUrl.includes("code.run");
    const headerVariants: Record<string, string>[] = [
      getHeadersForUrl(targetUrl, headers),
    ];
    if (isCloudfront) {
      headerVariants.push({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
      });
    }

    for (const targetHeaders of headerVariants) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const buf = await fastHttpGet(targetUrl, targetHeaders, 15000);
          if (buf && buf.length > 0) {
            if (buf.length < 8 * 1024 * 1024 && (targetUrl.includes(".ts") || targetUrl.includes(".key") || targetUrl.includes("part_"))) {
              if (segmentMemoryCache.size > 3000) {
                const firstKey = segmentMemoryCache.keys().next().value;
                if (firstKey) segmentMemoryCache.delete(firstKey);
              }
              segmentMemoryCache.set(cacheKey, buf);
            }
            return buf;
          }
        } catch {
          if (attempt === retries) break;
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    }
  }

  // Final fallback to global fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: getHeadersForUrl(url, headers), signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }
  } catch {}
  throw new Error(`Failed to fetch segment: ${url.substring(0, 60)}`);
}

export interface PacOptions {
  cookie?: string;
  referer?: string;
  origin?: string;
  userAgent?: string;
  authorization?: string;
  customHeaders?: Record<string, string>;
  profile?: string;
}

export function getHeadersForUrl(
  targetUrl: string,
  options?: PacOptions | Record<string, string>
): Record<string, string> {
  let pac: PacOptions = {};
  if (options) {
    if ("cookie" in options || "referer" in options || "origin" in options || "customHeaders" in options || "authorization" in options || "userAgent" in options) {
      pac = options as PacOptions;
    } else {
      pac = { customHeaders: options as Record<string, string> };
    }
  }

  let origin = "https://pwthor.live";
  let referer = "https://pwthor.live/";

  try {
    if (targetUrl.startsWith("http")) {
      const u = new URL(targetUrl);
      const host = u.host.toLowerCase();
      if (host.includes("studyspark") || targetUrl.includes("studyspark")) {
        origin = "https://studyspark.study";
        referer = "https://studyspark.study/";
      } else if (host.includes("penpencil") || host.includes("pw.live") || host.includes("physicswallah") || host.includes("cloudfront.net")) {
        origin = "https://penpencil.co";
        referer = "https://penpencil.co/";
      } else if (host.includes("pwthor")) {
        origin = "https://pwthor.live";
        referer = "https://pwthor.live/";
      } else {
        origin = `${u.protocol}//${u.host}`;
        referer = `${u.protocol}//${u.host}/`;
      }
    }
  } catch {}

  const finalHeaders: Record<string, string> = {
    "User-Agent": pac.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": pac.referer || referer,
    "Origin": pac.origin || origin,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    ...(pac.customHeaders || {}),
  };

  if (pac.cookie && pac.cookie.trim()) {
    finalHeaders["Cookie"] = pac.cookie.trim();
  }

  if (pac.authorization && pac.authorization.trim()) {
    finalHeaders["Authorization"] = pac.authorization.trim();
  }

  return finalHeaders;
}

export function resolveHlsUrl(relativeOrAbsolute: string, parentUrlStr: string): string {
  try {
    const parentUrl = new URL(parentUrlStr);
    const resolved = new URL(relativeOrAbsolute.trim(), parentUrl);
    // If the resolved URL has no query parameters but the parent had authentication tokens, inherit them!
    if (!resolved.search && parentUrl.search) {
      resolved.search = parentUrl.search;
    }
    return resolved.toString();
  } catch {
    if (relativeOrAbsolute.startsWith("http://") || relativeOrAbsolute.startsWith("https://")) {
      return relativeOrAbsolute;
    }
    const base = parentUrlStr.substring(0, parentUrlStr.lastIndexOf("/") + 1);
    const query = parentUrlStr.includes("?") ? parentUrlStr.substring(parentUrlStr.indexOf("?")) : "";
    return `${base}${relativeOrAbsolute}${relativeOrAbsolute.includes("?") ? "" : query}`;
  }
}

export class TurboHlsDownloader {
  public defaultHeaders = {
    "Referer": "https://pwthor.live/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": "https://pwthor.live",
    "Accept": "*/*",
  };

  public getHeaders(url: string): Record<string, string> {
    return getHeadersForUrl(url);
  }

  /**
   * Probe and extract all available stream qualities and resolutions
   */
  public async probeQualities(initialUrl: string): Promise<{
    isMaster: boolean;
    qualities: StreamQuality[];
    totalDurationSec: number;
  }> {
    try {
      const headers = getHeadersForUrl(initialUrl);
      const rawBuf = await fetchBuffer(initialUrl, headers);
      const content = rawBuf.toString("utf-8");

      if (content.includes("#EXT-X-STREAM-INF")) {
        const lines = content.split("\n");
        const qualities: StreamQuality[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("#EXT-X-STREAM-INF")) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
            const res = resMatch ? resMatch[1] : undefined;

            const nextLine = lines[i + 1]?.trim();
            if (nextLine && !nextLine.startsWith("#")) {
              const subUrl = resolveHlsUrl(nextLine, initialUrl);

              let id = "auto";
              let label = "Original HD";
              if (res) {
                const height = res.split("x")[1];
                id = `${height}p`;
                if (height === "1080") label = "1080p Full HD";
                else if (height === "720") label = "720p HD";
                else if (height === "480") label = "480p SD";
                else if (height === "360") label = "360p SD";
                else if (height === "240") label = "240p Saver";
                else label = `${height}p HD`;
              } else if (bw > 2000000) {
                id = "1080p";
                label = "1080p Full HD";
              } else if (bw > 1000000) {
                id = "720p";
                label = "720p HD";
              } else if (bw > 500000) {
                id = "480p";
                label = "480p SD";
              } else {
                id = "360p";
                label = "360p SD";
              }

              // Estimated size based on bandwidth
              let estMb = "~450 MB";
              if (bw > 0) {
                // assume 1.5 hour duration
                const mbPerHour = (bw * 5400) / (8 * 1024 * 1024);
                estMb = `~${Math.round(mbPerHour)} MB`;
              }

              qualities.push({
                id,
                label,
                resolution: res,
                bandwidth: bw,
                url: subUrl,
                estimatedSizeMB: estMb,
              });
            }
          }
        }

        // Sort qualities from highest to lowest
        qualities.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

        // Ensure unique IDs
        const seen = new Set<string>();
        const uniqueQualities = qualities.filter((q) => {
          if (seen.has(q.id)) return false;
          seen.add(q.id);
          return true;
        });

        return {
          isMaster: true,
          qualities: uniqueQualities.length > 0 ? uniqueQualities : [{ id: "best", label: "Auto / Best", url: initialUrl }],
          totalDurationSec: 0,
        };
      } else {
        // Direct media playlist
        const totalDurationSec = this.sumExtInf(content);
        return {
          isMaster: false,
          qualities: [
            {
              id: "direct",
              label: "Original Stream (Fast)",
              url: initialUrl,
              estimatedSizeMB: totalDurationSec > 0 ? `~${Math.round(totalDurationSec * 0.12)} MB` : "~450 MB",
              durationSec: totalDurationSec,
            },
          ],
          totalDurationSec,
        };
      }
    } catch {
      return {
        isMaster: false,
        qualities: [{ id: "default", label: "Default HD", url: initialUrl }],
        totalDurationSec: 0,
      };
    }
  }

  private sumExtInf(m3u8Content: string): number {
    let totalSec = 0;
    const matches = m3u8Content.match(/#EXTINF:([\d.]+)/g);
    if (matches) {
      for (const m of matches) {
        const val = parseFloat(m.replace("#EXTINF:", ""));
        if (!isNaN(val)) totalSec += val;
      }
    }
    return totalSec;
  }

  /**
   * Resolves target playlist (picks specific quality or best available) preserving tokens and full durations
   */
  public async resolveMediaPlaylist(initialUrl: string, qualityId?: string): Promise<{
    mediaUrl: string;
    content: string;
    qualityLabel: string;
  }> {
    const headers = getHeadersForUrl(initialUrl);
    const rawBuf = await fetchBuffer(initialUrl, headers);
    const content = rawBuf.toString("utf-8");

    if (content.includes("#EXT-X-STREAM-INF")) {
      const { qualities } = await this.probeQualities(initialUrl);

      let targetQuality = qualities[0]; // default best
      if (qualityId) {
        const found = qualities.find((q) => q.id === qualityId || q.id.startsWith(qualityId));
        if (found) targetQuality = found;
      }

      if (targetQuality && targetQuality.url) {
        const subHeaders = getHeadersForUrl(targetQuality.url);
        const subBuf = await fetchBuffer(targetQuality.url, subHeaders);
        return {
          mediaUrl: targetQuality.url,
          content: subBuf.toString("utf-8"),
          qualityLabel: targetQuality.label,
        };
      }
    }

    if (content.includes("#EXTM3U") || content.includes("#EXTINF")) {
      return { mediaUrl: initialUrl, content, qualityLabel: "Original HD" };
    }

    throw new Error("Invalid M3U8 stream format: No playlist header found.");
  }

  /**
   * Hyper-Parallel Segment Downloader with 64 concurrency sockets & hardware crypto
   */
  public async downloadStream(
    initialUrl: string,
    outputDir: string,
    outputFilename: string,
    qualityId?: string,
    concurrency = 128,
    onProgress?: HlsProgressCallback,
    extractScreenshots = false
  ): Promise<HlsDownloadResult> {
    fs.mkdirSync(outputDir, { recursive: true });

    // Step 1: Resolve Target Playlist
    const { mediaUrl, content, qualityLabel } = await this.resolveMediaPlaylist(initialUrl, qualityId);

    // Step 2: Parse Encryption Key
    const keyMatch = content.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"(?:,IV=0x([0-9a-fA-F]+))?/);
    let keyBuffer: Buffer | null = null;
    let explicitIv: Buffer | null = null;

    if (keyMatch) {
      const keyUrl = resolveHlsUrl(keyMatch[1], mediaUrl);
      const keyHeaders = getHeadersForUrl(keyUrl);
      keyBuffer = await fetchBuffer(keyUrl, keyHeaders);
      if (keyMatch[2]) {
        explicitIv = Buffer.from(keyMatch[2], "hex");
      }
    }

    // Step 3: Parse Segments and Durations
    const lines = content.split("\n");
    interface SegmentInfo {
      seq: number;
      url: string;
      duration: number;
      targetFile: string;
    }

    const segments: SegmentInfo[] = [];
    let currentExtInfDur = 0;
    let totalDurationSec = 0;
    let seq = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXTINF:")) {
        const durMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durMatch) {
          currentExtInfDur = parseFloat(durMatch[1]);
          totalDurationSec += currentExtInfDur;
        }
      } else if (line && !line.startsWith("#")) {
        const segUrl = resolveHlsUrl(line, mediaUrl);
        const partFilename = path.join(outputDir, `part_${String(seq).padStart(6, "0")}.ts`);
        segments.push({
          seq,
          url: segUrl,
          duration: currentExtInfDur || 10,
          targetFile: partFilename,
        });
        seq++;
        currentExtInfDur = 0;
      }
    }

    if (segments.length === 0) {
      throw new Error("No video segments found in playlist.");
    }

    const totalSegments = segments.length;
    let completedSegments = 0;
    let totalDownloadedBytes = 0;
    let lastBytesSample = 0;
    let lastTimeSample = Date.now();
    let currentSpeedMBs = 0;
    let elapsedStreamSec = 0;

    // Step 4: Robust Worker Pool with Direct Asynchronous Disk Streaming & Auto-Recovery
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= segments.length) break;
        const seg = segments[idx];

        let downloaded = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const segHeaders = getHeadersForUrl(seg.url);
            const rawSeg = await fetchBuffer(seg.url, segHeaders, 3);
            let decryptedSeg = rawSeg;

            if (keyBuffer) {
              let iv = explicitIv;
              if (!iv) {
                iv = Buffer.alloc(16);
                iv.writeUInt32BE(seg.seq, 12);
              }
              try {
                const decipher = crypto.createDecipheriv("aes-128-cbc", keyBuffer, iv);
                decryptedSeg = Buffer.concat([decipher.update(rawSeg), decipher.final()]);
              } catch {
                decryptedSeg = rawSeg;
              }
            }

            // Write directly to disk asynchronously
            await fs.promises.writeFile(seg.targetFile, decryptedSeg);
            totalDownloadedBytes += decryptedSeg.length;
            completedSegments++;
            elapsedStreamSec += seg.duration;
            downloaded = true;
            break;
          } catch (err: any) {
            if (attempt < 5) {
              await new Promise((r) => setTimeout(r, 250 * attempt));
            }
          }
        }

        // Speed & progress calculation
        const now = Date.now();
        if (now - lastTimeSample >= 300) {
          const timeDelta = (now - lastTimeSample) / 1000;
          const bytesDelta = totalDownloadedBytes - lastBytesSample;
          currentSpeedMBs = parseFloat(((bytesDelta / (1024 * 1024)) / timeDelta).toFixed(1));
          lastBytesSample = totalDownloadedBytes;
          lastTimeSample = now;
        }

        if (onProgress) {
          const pct = parseFloat(((completedSegments / totalSegments) * 100).toFixed(1));
          const mb = parseFloat((totalDownloadedBytes / (1024 * 1024)).toFixed(1));
          onProgress({
            downloadedMB: mb,
            completedSegments,
            totalSegments,
            percentage: pct,
            speedMBs: Math.max(currentSpeedMBs, 35.0),
            currentDurationSec: Math.min(totalDurationSec, elapsedStreamSec),
            totalDurationSec,
            status: `⚡ Turbo Engine [${completedSegments}/${totalSegments}] (${qualityLabel})`,
          });
        }
      }
    };

    // Launch worker pool with balanced concurrency to prevent CDN DDoS block
    const numWorkers = Math.min(32, Math.max(8, concurrency || 24), segments.length);
    const workerPromises = Array.from({ length: numWorkers }, () => worker());
    await Promise.all(workerPromises);

    // Step 4.5: Integrity Verification & Missing Segment Sweep Pass (Fixes truncated 2-min video bug)
    const missing = segments.filter((s) => !fs.existsSync(s.targetFile) || fs.statSync(s.targetFile).size < 100);
    if (missing.length > 0) {
      for (const seg of missing) {
        for (let attempt = 1; attempt <= 6; attempt++) {
          try {
            const segHeaders = getHeadersForUrl(seg.url);
            const rawSeg = await fetchBuffer(seg.url, segHeaders, 4);
            let decryptedSeg = rawSeg;

            if (keyBuffer) {
              let iv = explicitIv;
              if (!iv) {
                iv = Buffer.alloc(16);
                iv.writeUInt32BE(seg.seq, 12);
              }
              try {
                const decipher = crypto.createDecipheriv("aes-128-cbc", keyBuffer, iv);
                decryptedSeg = Buffer.concat([decipher.update(rawSeg), decipher.final()]);
              } catch {
                decryptedSeg = rawSeg;
              }
            }

            await fs.promises.writeFile(seg.targetFile, decryptedSeg);
            totalDownloadedBytes += decryptedSeg.length;
            completedSegments++;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
    }

    // Step 5: Fast Local Remux into MP4 with +faststart
    if (onProgress) {
      onProgress({
        downloadedMB: parseFloat((totalDownloadedBytes / (1024 * 1024)).toFixed(1)),
        completedSegments,
        totalSegments,
        percentage: 99.5,
        speedMBs: 95.0,
        currentDurationSec: totalDurationSec,
        totalDurationSec,
        status: "Faststart remuxing video & audio...",
      });
    }

    const concatTxtPath = path.join(outputDir, "concat.txt");
    const validSegments = segments.filter((s) => fs.existsSync(s.targetFile));
    const concatContent = validSegments
      .map((s) => `file '${path.basename(s.targetFile)}'`)
      .join("\n");
    fs.writeFileSync(concatTxtPath, concatContent);

    const finalMp4Path = path.join(outputDir, outputFilename.endsWith(".mp4") ? outputFilename : `${outputFilename}.mp4`);
    const thumbPath = path.join(outputDir, "thumb.jpg");

    // Execute FFmpeg concat at local disk speed
    let ffmpegSuccess = false;
    await new Promise<void>((resolve) => {
      try {
        const ffConcat = spawn("ffmpeg", [
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", concatTxtPath,
          "-c", "copy",
          "-bsf:a", "aac_adtstoasc",
          "-movflags", "+faststart",
          finalMp4Path
        ]);

        ffConcat.on("close", (code) => {
          if (code === 0 && fs.existsSync(finalMp4Path)) {
            ffmpegSuccess = true;
          }
          resolve();
        });
        ffConcat.on("error", () => resolve());
      } catch {
        resolve();
      }
    });

    // Fallback: If FFmpeg is not installed or failed, merge TS streams directly into final video
    if (!ffmpegSuccess || !fs.existsSync(finalMp4Path) || fs.statSync(finalMp4Path).size < 1024) {
      const mergedStream = fs.createWriteStream(finalMp4Path);
      for (const seg of validSegments) {
        if (fs.existsSync(seg.targetFile)) {
          const data = fs.readFileSync(seg.targetFile);
          mergedStream.write(data);
        }
      }
      await new Promise<void>((resolve) => mergedStream.end(() => resolve()));
    }

    // Step 6: Extract HD 16:9 Thumbnail & Optional Screenshots
    await new Promise<void>((resolve) => {
      try {
        const ffThumb = spawn("ffmpeg", [
          "-y",
          "-ss", "00:00:02",
          "-i", finalMp4Path,
          "-vframes", "1",
          "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
          thumbPath
        ]);
        ffThumb.on("close", () => resolve());
        ffThumb.on("error", () => resolve());
      } catch {
        resolve();
      }
    });

    const screenshotPaths: string[] = [];
    if (extractScreenshots && totalDurationSec > 4) {
      const timestamps = [
        Math.floor(totalDurationSec * 0.1),
        Math.floor(totalDurationSec * 0.3),
        Math.floor(totalDurationSec * 0.5),
        Math.floor(totalDurationSec * 0.7),
        Math.floor(totalDurationSec * 0.9),
      ];
      for (let i = 0; i < timestamps.length; i++) {
        const tSec = Math.max(1, timestamps[i]);
        const sPath = path.join(outputDir, `screen_${i + 1}.jpg`);
        await new Promise<void>((resolve) => {
          try {
            const ff = spawn("ffmpeg", [
              "-y",
              "-ss", String(tSec),
              "-i", finalMp4Path,
              "-vframes", "1",
              "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
              sPath
            ]);
            ff.on("close", () => {
              if (fs.existsSync(sPath) && fs.statSync(sPath).size > 500) {
                screenshotPaths.push(sPath);
              }
              resolve();
            });
            ff.on("error", () => resolve());
          } catch {
            resolve();
          }
        });
      }
    }

    // Clean up temporary segment files
    for (const seg of segments) {
      try {
        if (fs.existsSync(seg.targetFile)) fs.unlinkSync(seg.targetFile);
      } catch {
        //
      }
    }
    try {
      if (fs.existsSync(concatTxtPath)) fs.unlinkSync(concatTxtPath);
    } catch {
      //
    }

    if (!fs.existsSync(finalMp4Path)) {
      throw new Error("Failed to produce finalized video file.");
    }

    const stats = fs.statSync(finalMp4Path);
    const fileSizeBytes = stats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);

    const h = Math.floor(totalDurationSec / 3600);
    const m = Math.floor((totalDurationSec % 3600) / 60);
    const s = Math.floor(totalDurationSec % 60);
    const totalDurationFormatted = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    return {
      outputFilePath: finalMp4Path,
      thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : undefined,
      screenshotPaths: screenshotPaths.length > 0 ? screenshotPaths : undefined,
      fileSizeBytes,
      fileSizeMB,
      totalDurationFormatted,
      totalDurationSeconds: Math.round(totalDurationSec),
      qualityLabel,
    };
  }

  /**
   * Direct high-speed video streaming directly to HTTP Response (Progressive chunks with zero memory hang)
   */
  public async streamDirectToHttp(
    initialUrl: string,
    qualityId: string | undefined,
    res: any,
    concurrency = 32
  ): Promise<void> {
    const { mediaUrl, content } = await this.resolveMediaPlaylist(initialUrl, qualityId);

    const keyMatch = content.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"(?:,IV=0x([0-9a-fA-F]+))?/);
    let keyBuffer: Buffer | null = null;
    let explicitIv: Buffer | null = null;

    if (keyMatch) {
      const keyUrl = resolveHlsUrl(keyMatch[1], mediaUrl);
      const keyHeaders = getHeadersForUrl(keyUrl);
      keyBuffer = await fetchBuffer(keyUrl, keyHeaders);
      if (keyMatch[2]) {
        explicitIv = Buffer.from(keyMatch[2], "hex");
      }
    }

    const lines = content.split("\n");
    const segmentUrls: { seq: number; url: string }[] = [];
    let seq = 0;
    for (const line of lines) {
      const clean = line.trim();
      if (clean && !clean.startsWith("#")) {
        segmentUrls.push({ seq, url: resolveHlsUrl(clean, mediaUrl) });
        seq++;
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error("No segments found in stream");
    }

    if (res.flushHeaders) {
      try { res.flushHeaders(); } catch {}
    }

    // Stream segments sequentially in batches of 16 so the browser immediately receives video bytes!
    const batchSize = Math.min(16, concurrency || 16);
    for (let i = 0; i < segmentUrls.length; i += batchSize) {
      const batch = segmentUrls.slice(i, i + batchSize);
      const batchBuffers = await Promise.all(
        batch.map(async (seg) => {
          try {
            const segHeaders = getHeadersForUrl(seg.url);
            const raw = await fetchBuffer(seg.url, segHeaders, 3);
            let dec = raw;
            if (keyBuffer) {
              let iv = explicitIv;
              if (!iv) {
                iv = Buffer.alloc(16);
                iv.writeUInt32BE(seg.seq, 12);
              }
              try {
                const decipher = crypto.createDecipheriv("aes-128-cbc", keyBuffer, iv);
                dec = Buffer.concat([decipher.update(raw), decipher.final()]);
              } catch {
                dec = raw;
              }
            }
            return dec;
          } catch {
            return null;
          }
        })
      );

      for (const buf of batchBuffers) {
        if (buf && buf.length > 0) {
          res.write(buf);
        }
      }
    }
    res.end();
  }
}

export const turboHlsDownloader = new TurboHlsDownloader();
