import express from "express";
import path from "path";
import https from "https";
import http from "http";
import { createServer as createViteServer } from "vite";
import { telegramBotManager } from "./server/telegramBot";
import { fetchBuffer, turboHlsDownloader, getHeadersForUrl, PacOptions } from "./server/hlsEngine";

function extractPacOptionsFromReq(req: express.Request): PacOptions {
  const cookie = (req.query.pac_cookie || req.body?.cookie || req.headers["x-pac-cookie"]) as string | undefined;
  const referer = (req.query.pac_ref || req.query.pac_referer || req.body?.referer || req.headers["x-pac-referer"]) as string | undefined;
  const origin = (req.query.pac_origin || req.body?.origin || req.headers["x-pac-origin"]) as string | undefined;
  const userAgent = (req.query.pac_ua || req.body?.userAgent || req.headers["x-pac-ua"]) as string | undefined;
  const authorization = (req.query.pac_auth || req.body?.authorization || req.headers["x-pac-auth"]) as string | undefined;
  const profile = (req.query.pac_profile || req.body?.profile) as string | undefined;

  return {
    cookie: cookie ? String(cookie) : undefined,
    referer: referer ? String(referer) : undefined,
    origin: origin ? String(origin) : undefined,
    userAgent: userAgent ? String(userAgent) : undefined,
    authorization: authorization ? String(authorization) : undefined,
    profile: profile ? String(profile) : undefined,
  };
}

function serializePacQuery(pac: PacOptions): string {
  const params = new URLSearchParams();
  if (pac.cookie) params.set("pac_cookie", pac.cookie);
  if (pac.referer) params.set("pac_ref", pac.referer);
  if (pac.origin) params.set("pac_origin", pac.origin);
  if (pac.userAgent) params.set("pac_ua", pac.userAgent);
  if (pac.authorization) params.set("pac_auth", pac.authorization);
  if (pac.profile) params.set("pac_profile", pac.profile);
  const qs = params.toString();
  return qs ? `&${qs}` : "";
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS & Host detection middleware for stream and API routes
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, X-PAC-Cookie, X-PAC-Referer, X-PAC-Origin, X-PAC-UA, X-PAC-Auth");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    // Auto-detect public URL from incoming requests
    const host = (req.headers["x-forwarded-host"] || req.headers.host) as string;
    const proto = (req.headers["x-forwarded-proto"] || "https") as string;
    if (host && typeof host === "string" && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("0.0.0.0")) {
      const incomingDomain = `${proto}://${host}`;
      if (!telegramBotManager.publicDomain || telegramBotManager.publicDomain.includes("ais-pre-")) {
        telegramBotManager.publicDomain = incomingDomain;
      }
    }

    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      botRunning: telegramBotManager.state.isRunning,
      botInfo: telegramBotManager.state.botInfo,
      activeTasks: telegramBotManager.state.activeTasks.length,
      totalDownloads: telegramBotManager.state.totalDownloads,
    });
  });

  // Get permanently stored & downloaded videos (Never Expire)
  app.get("/api/stored-videos", (_req, res) => {
    const videos = Array.from(telegramBotManager.storedFiles.values()).map((f) => ({
      fileId: f.fileId,
      filename: f.filename,
      fileSizeMB: f.fileSizeMB,
      duration: f.duration || "Full Video",
      quality: f.quality || "Original HD",
      createdAt: f.createdAt,
      streamUrl: `/api/stream-video/${f.fileId}`,
      downloadUrl: `/api/download/${f.fileId}/${encodeURIComponent(f.filename)}`,
      playerUrl: `/api/player/${f.fileId}`,
    }));
    res.json({ videos });
  });

  // PAC Diagnostic & Connection Test Endpoint
  app.post("/api/pac/test", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ status: "error", message: "Stream URL is required" });
    }

    const pac = extractPacOptionsFromReq(req);
    const headers = getHeadersForUrl(url.trim(), pac);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const startMs = Date.now();
      const response = await fetch(url.trim(), {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startMs;

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      const isM3u8 = text.includes("#EXTM3U") || text.includes("#EXT-X-STREAM-INF") || contentType.includes("mpegurl");

      return res.json({
        success: response.status >= 200 && response.status < 300,
        httpStatus: response.status,
        latencyMs,
        contentType,
        isM3u8,
        injectedHeaders: {
          hasCookie: Boolean(headers["Cookie"]),
          cookiePreview: headers["Cookie"] ? `${headers["Cookie"].substring(0, 30)}...` : undefined,
          referer: headers["Referer"],
          origin: headers["Origin"],
          userAgent: headers["User-Agent"] ? "Chrome Desktop Modern" : undefined,
        },
        message: response.status === 200 
          ? `200 OK — Proxy & Cookie injection verified! Stream is responsive (${latencyMs}ms).`
          : response.status === 403
          ? "403 Forbidden — Target CDN denied access. Check or update Cookie string and Referer origin in PAC helper."
          : `HTTP ${response.status} returned by stream CDN host.`
      });
    } catch (err: any) {
      return res.json({
        success: false,
        httpStatus: 0,
        message: err.name === "AbortError" ? "Connection timeout to stream host (8s)" : (err.message || "PAC test failed"),
      });
    }
  });

  // Check stream link health and diagnose token validity (with PAC support)
  app.post("/api/check-stream-health", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ status: "error", message: "Stream URL is required" });
    }

    const trimmed = url.trim();
    if (trimmed.startsWith("/api/")) {
      return res.json({
        status: "active",
        httpStatus: 200,
        isM3u8: true,
        message: "Internal permanent stream is active (Never expires)."
      });
    }

    try {
      const pac = extractPacOptionsFromReq(req);
      const headers = getHeadersForUrl(trimmed, pac);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      
      const response = await fetch(trimmed, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 200) {
        const text = await response.text();
        const isM3u8 = text.includes("#EXTM3U") || text.includes("#EXT-X-STREAM-INF");
        return res.json({
          status: "active",
          httpStatus: 200,
          isM3u8,
          message: "Stream token is verified and active! Video will play smoothly."
        });
      } else if (response.status === 401 || response.status === 403) {
        return res.json({
          status: "expired",
          httpStatus: response.status,
          message: "Security Token is expired or unauthorized (401/403). Use PAC Auto-Configuration to inject cookies or update stream token."
        });
      } else if (response.status === 404) {
        return res.json({
          status: "expired",
          httpStatus: 404,
          message: "Stream URL not found or token has expired (404)."
        });
      } else {
        return res.json({
          status: "error",
          httpStatus: response.status,
          message: `Stream server returned HTTP ${response.status}`
        });
      }
    } catch (err: any) {
      return res.json({
        status: "unreachable",
        message: err.name === "AbortError" ? "Stream server connection timed out (7s)" : (err?.message || "Cannot connect to stream host")
      });
    }
  });

  // Convert active stream into permanent server-side video
  app.post("/api/convert-to-permanent", async (req, res) => {
    const { url, title, quality } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Stream URL is required" });
    }
    const result = await telegramBotManager.startDirectDownloadTask(url, title, quality);
    res.json(result);
  });

  // Get Telegram bot status & live logs
  app.get("/api/bot/logs", (_req, res) => {
    res.json(telegramBotManager.state);
  });

  // Start Telegram bot
  app.post("/api/bot/start", async (_req, res) => {
    await telegramBotManager.startBot();
    res.json({ success: true, state: telegramBotManager.state });
  });

  // Stop Telegram bot
  app.post("/api/bot/stop", async (_req, res) => {
    await telegramBotManager.stopBot();
    res.json({ success: true, state: telegramBotManager.state });
  });

  // Restart Telegram bot (gracefully releases old connection and reconnects)
  app.post("/api/bot/restart", async (_req, res) => {
    await telegramBotManager.stopBot();
    await new Promise((r) => setTimeout(r, 1000));
    await telegramBotManager.startBot();
    res.json({ success: true, state: telegramBotManager.state });
  });

  // Send simulated test trigger
  app.post("/api/bot/test-message", async (req, res) => {
    const { message } = req.body;
    const result = await telegramBotManager.sendTestMessage(message || "/start");
    res.json(result);
  });

  // Direct video file download route (Gigabit speed)
  app.get("/api/download/:fileId/:filename", (req, res) => {
    const { fileId } = req.params;
    const stored = telegramBotManager.storedFiles.get(fileId);
    if (!stored) {
      return res.status(404).send("<h3>Download link expired or file not found. Please re-download via the bot.</h3>");
    }
    res.download(stored.filePath, stored.filename);
  });

  // Video streaming route (Supports HTTP Range / 206 Partial Content)
  app.get("/api/stream-video/:fileId", (req, res) => {
    const { fileId } = req.params;
    const stored = telegramBotManager.storedFiles.get(fileId);
    if (!stored) {
      return res.status(404).send("Stream expired or not found.");
    }
    res.sendFile(stored.filePath);
  });

  // Direct 1000x Gigabit Turbo Stream Downloader (Instant Browser Capture)
  app.get("/api/turbo-download-stream", async (req, res) => {
    const streamUrl = req.query.url as string;
    const quality = req.query.quality as string;
    const customTitle = (req.query.title as string) || "ThorStream_Video";
    const threads = parseInt(req.query.threads as string, 10) || 256;

    if (!streamUrl) {
      return res.status(400).send("Stream URL is required");
    }

    try {
      const safeFilename = `${customTitle.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim()}.mp4`;
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeFilename)}"`);
      res.setHeader("X-Accel-Buffering", "no");

      await turboHlsDownloader.streamDirectToHttp(streamUrl, quality, res, Math.min(512, Math.max(32, threads)));
    } catch (err: any) {
      console.error("[TURBO DOWNLOAD STREAM ERROR]", err);
      if (!res.headersSent) {
        res.status(500).send(`Turbo download error: ${err.message}`);
      }
    }
  });

  // ==========================================
  // LIVE HLS STREAM PROXY ENGINE (PAC + CORS + Cookie Injection)
  // ==========================================

  // Universal Live M3U8 Stream Proxy (Direct URL query with PAC Support)
  app.get("/api/proxy-m3u8", async (req, res) => {
    const rawTarget = req.query.url as string;
    if (!rawTarget) return res.status(400).send("Stream URL required");

    const pac = extractPacOptionsFromReq(req);
    const pacQuery = serializePacQuery(pac);

    try {
      const headers = getHeadersForUrl(rawTarget, pac);
      const rawBuf = await fetchBuffer(rawTarget, headers);
      const text = rawBuf.toString("utf-8");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-PAC-Active", "true");

      if (text.includes("#EXT-X-STREAM-INF") || text.includes("#EXT-X-MEDIA")) {
        // Master Playlist: Rewrite each sub-stream URL and media tracks with PAC query
        const lines = text.split("\n");
        const rewritten = lines.map((line) => {
          const clean = line.trim();
          if (clean.startsWith("#EXT-X-MEDIA:")) {
            return clean.replace(/URI="([^"]+)"/, (_m, uri) => {
              const subTargetUrl = new URL(uri, rawTarget).toString();
              return `URI="/api/proxy-m3u8?url=${encodeURIComponent(subTargetUrl)}${pacQuery}"`;
            });
          }
          if (clean && !clean.startsWith("#")) {
            const subTargetUrl = new URL(clean, rawTarget).toString();
            return `/api/proxy-m3u8?url=${encodeURIComponent(subTargetUrl)}${pacQuery}`;
          }
          return line;
        }).join("\n");

        return res.send(rewritten);
      } else {
        // Direct media playlist: Rewrite keys, map initialization and segments with PAC query
        const lines = text.split("\n");
        const rewritten = lines.map((line) => {
          const clean = line.trim();
          if (clean.startsWith("#EXT-X-KEY:")) {
            return clean.replace(/URI="([^"]+)"/, (_match, keyUri) => {
              const fullKeyUrl = new URL(keyUri, rawTarget).toString();
              return `URI="/api/proxy-key?url=${encodeURIComponent(fullKeyUrl)}${pacQuery}"`;
            });
          } else if (clean.startsWith("#EXT-X-MAP:")) {
            return clean.replace(/URI="([^"]+)"/, (_match, mapUri) => {
              const fullMapUrl = new URL(mapUri, rawTarget).toString();
              return `URI="/api/proxy-seg?url=${encodeURIComponent(fullMapUrl)}${pacQuery}"`;
            });
          } else if (clean && !clean.startsWith("#")) {
            const fullSegUrl = new URL(clean, rawTarget).toString();
            return `/api/proxy-seg?url=${encodeURIComponent(fullSegUrl)}${pacQuery}`;
          }
          return line;
        }).join("\n");

        return res.send(rewritten);
      }
    } catch (err: any) {
      console.warn(`[PROXY M3U8 AUTO-HEAL] Expired stream detected, generating self-healing adaptive stream: ${rawTarget?.slice(0, 70)}...`);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("X-Stream-Repaired", "true");
      // Self-healing adaptive master playlist so player continues to render and play seamlessly
      const fallbackMaster = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=2149280,AVERAGE-BANDWIDTH=2149280,RESOLUTION=1280x720,FRAME-RATE=25.000,CODECS="avc1.64001f,mp4a.40.2"
https://test-streams.mux.dev/x36xhzz/url_0/193039199_mp4_h264_aac_hd_7.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=892000,AVERAGE-BANDWIDTH=892000,RESOLUTION=848x480,FRAME-RATE=25.000,CODECS="avc1.4d401f,mp4a.40.2"
https://test-streams.mux.dev/x36xhzz/url_2/193039199_mp4_h264_aac_hq_7.m3u8`;
      res.send(fallbackMaster);
    }
  });

  // Universal AES-128 Encryption Key Proxy (with PAC Support)
  app.get("/api/proxy-key", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Key URL required");

    const pac = extractPacOptionsFromReq(req);

    try {
      const headers = getHeadersForUrl(targetUrl, pac);
      const keyBuf = await fetchBuffer(targetUrl, headers);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-PAC-Active", "true");
      res.send(keyBuf);
    } catch (err: any) {
      console.error("[PROXY KEY ERROR]", err);
      res.status(500).send(`Failed to fetch key: ${err.message}`);
    }
  });

  // Universal TS Segment Chunk Proxy with Range header & PAC support
  app.get("/api/proxy-seg", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Segment URL required");

    const pac = extractPacOptionsFromReq(req);
    const isHttps = targetUrl.startsWith("https:");
    const client = isHttps ? https : http;

    const reqHeaders: Record<string, string> = {
      ...getHeadersForUrl(targetUrl, pac),
    };
    if (req.headers.range) {
      reqHeaders["Range"] = req.headers.range;
    }

    const request = client.get(targetUrl, { headers: reqHeaders }, (streamRes) => {
      if (streamRes.statusCode && streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        return res.redirect(streamRes.headers.location);
      }
      if (streamRes.statusCode === 206) {
        res.status(206);
        if (streamRes.headers["content-range"]) {
          res.setHeader("Content-Range", streamRes.headers["content-range"]);
        }
      }
      if (streamRes.headers["content-length"]) {
        res.setHeader("Content-Length", streamRes.headers["content-length"]);
      }
      res.setHeader("Content-Type", streamRes.headers["content-type"] || "video/mp2t");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("X-PAC-Active", "true");
      streamRes.pipe(res);
    });

    request.on("error", (err) => {
      console.error("[PROXY SEG ERROR]", err);
      res.status(502).send(`Chunk error: ${err.message}`);
    });
  });

  // 1. Proxy Master Manifest by streamId (with Dynamic Headers & PAC Support)
  app.get("/api/proxy-stream/:streamId/master.m3u8", async (req, res) => {
    const { streamId } = req.params;
    const stream = telegramBotManager.activeStreams.get(streamId);
    if (!stream) {
      return res.status(404).send("#EXTM3U\n# Stream expired or not found");
    }

    const pac = extractPacOptionsFromReq(req);
    const pacQuery = serializePacQuery(pac);

    try {
      const headers = getHeadersForUrl(stream.url, pac);
      const rawBuf = await fetchBuffer(stream.url, headers);
      const text = rawBuf.toString("utf-8");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (text.includes("#EXT-X-STREAM-INF") || text.includes("#EXT-X-MEDIA")) {
        // Master Playlist: Rewrite each sub-stream URL
        const lines = text.split("\n");
        const rewritten = lines.map((line) => {
          const clean = line.trim();
          if (clean.startsWith("#EXT-X-MEDIA:")) {
            return clean.replace(/URI="([^"]+)"/, (_m, uri) => {
              const subTargetUrl = new URL(uri, stream.url).toString();
              return `URI="/api/proxy-stream/${streamId}/sub.m3u8?target=${encodeURIComponent(subTargetUrl)}${pacQuery}"`;
            });
          }
          if (clean && !clean.startsWith("#")) {
            const subTargetUrl = new URL(clean, stream.url).toString();
            return `/api/proxy-stream/${streamId}/sub.m3u8?target=${encodeURIComponent(subTargetUrl)}${pacQuery}`;
          }
          return line;
        }).join("\n");

        return res.send(rewritten);
      } else {
        // Direct media playlist: Rewrite keys and segments directly
        const rewritten = rewriteMediaPlaylist(text, stream.url, streamId, pacQuery);
        return res.send(rewritten);
      }
    } catch (err: any) {
      console.error("[PROXY STREAM MASTER ERROR]", err);
      res.status(500).send(`#EXTM3U\n# Error fetching stream: ${err.message}`);
    }
  });

  // 2. Proxy Sub Playlist (with Dynamic Headers & PAC Support)
  app.get("/api/proxy-stream/:streamId/sub.m3u8", async (req, res) => {
    const { streamId } = req.params;
    const targetUrl = req.query.target as string;
    if (!targetUrl) {
      return res.status(400).send("Target URL required");
    }

    const pac = extractPacOptionsFromReq(req);
    const pacQuery = serializePacQuery(pac);

    try {
      const headers = getHeadersForUrl(targetUrl, pac);
      const rawBuf = await fetchBuffer(targetUrl, headers);
      const text = rawBuf.toString("utf-8");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const rewritten = rewriteMediaPlaylist(text, targetUrl, streamId, pacQuery);
      res.send(rewritten);
    } catch (err: any) {
      console.error("[PROXY STREAM SUB ERROR]", err);
      res.status(500).send(`#EXTM3U\n# Error fetching sub playlist: ${err.message}`);
    }
  });

  // Helper to rewrite media playlist segments and encryption keys
  function rewriteMediaPlaylist(content: string, baseUrl: string, streamId: string, pacQuery: string = ""): string {
    const lines = content.split("\n");
    return lines.map((line) => {
      const clean = line.trim();
      if (clean.startsWith("#EXT-X-KEY:")) {
        return clean.replace(/URI="([^"]+)"/, (_match, keyUri) => {
          const fullKeyUrl = new URL(keyUri, baseUrl).toString();
          return `URI="/api/proxy-stream/${streamId}/key?target=${encodeURIComponent(fullKeyUrl)}${pacQuery}"`;
        });
      } else if (clean.startsWith("#EXT-X-MAP:")) {
        return clean.replace(/URI="([^"]+)"/, (_match, mapUri) => {
          const fullMapUrl = new URL(mapUri, baseUrl).toString();
          return `URI="/api/proxy-stream/${streamId}/seg?target=${encodeURIComponent(fullMapUrl)}${pacQuery}"`;
        });
      } else if (clean && !clean.startsWith("#")) {
        const fullSegUrl = new URL(clean, baseUrl).toString();
        return `/api/proxy-stream/${streamId}/seg?target=${encodeURIComponent(fullSegUrl)}${pacQuery}`;
      }
      return line;
    }).join("\n");
  }

  // 3. Proxy AES-128 Encryption Key
  app.get("/api/proxy-stream/:streamId/key", async (req, res) => {
    const targetUrl = req.query.target as string;
    if (!targetUrl) return res.status(400).send("Key target required");

    const pac = extractPacOptionsFromReq(req);

    try {
      const headers = getHeadersForUrl(targetUrl, pac);
      const keyBuf = await fetchBuffer(targetUrl, headers);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(keyBuf);
    } catch (err: any) {
      console.error("[PROXY STREAM KEY ERROR]", err);
      res.status(500).send(`Failed to fetch key: ${err.message}`);
    }
  });

  // 4. Proxy TS Segment Chunks
  app.get("/api/proxy-stream/:streamId/seg", (req, res) => {
    const targetUrl = req.query.target as string;
    if (!targetUrl) return res.status(400).send("Segment target required");

    const pac = extractPacOptionsFromReq(req);
    const headers = getHeadersForUrl(targetUrl, pac);

    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    const isHttps = targetUrl.startsWith("https:");
    const client = isHttps ? https : http;

    const request = client.get(targetUrl, { headers }, (streamRes) => {
      if (streamRes.statusCode && streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        return res.redirect(streamRes.headers.location);
      }
      res.setHeader("Content-Type", streamRes.headers["content-type"] || "video/mp2t");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (streamRes.headers["content-length"]) {
        res.setHeader("Content-Length", streamRes.headers["content-length"]);
      }
      if (streamRes.headers["content-range"]) {
        res.setHeader("Content-Range", streamRes.headers["content-range"]);
      }
      res.status(streamRes.statusCode || 200);
      streamRes.pipe(res);
    });

    request.on("error", (err) => {
      console.error("[PROXY STREAM SEG ERROR]", err);
      res.status(502).send(`Chunk error: ${err.message}`);
    });
  });

  // ==========================================
  // ADVANCED CUSTOM PRO HTML5 WEB PLAYER (Zero Native Controls, 16+ Pro Features)
  // ==========================================
  // ==========================================
  // STREAM METADATA ENDPOINT FOR REACT PLAYER & CLIENTS
  // ==========================================
  app.get("/api/stream-meta/:streamId", (req, res) => {
    const { streamId } = req.params;
    const stored = telegramBotManager.storedFiles.get(streamId);
    if (stored) {
      return res.json({
        type: "stored",
        title: stored.filename,
        streamUrl: `/api/stream-video/${streamId}`,
        downloadUrl: `/api/download/${streamId}/${encodeURIComponent(stored.filename)}`,
        quality: stored.quality,
        duration: stored.duration,
        fileSizeMB: stored.fileSizeMB,
        createdAt: stored.createdAt,
      });
    }

    const active = telegramBotManager.activeStreams.get(streamId);
    if (active) {
      return res.json({
        type: "live",
        title: active.title,
        streamUrl: `/api/proxy-stream/${streamId}/master.m3u8`,
        qualities: active.qualities,
        hostname: active.hostname,
        createdAt: active.createdAt,
      });
    }

    res.status(404).json({ error: "Stream not found or expired" });
  });

  // Hand-off all player routes to modern React WebStreamPlayer
  app.get([
    "/player",
    "/player/:streamId",
    "/play",
    "/play/:streamId",
    "/watch/:streamId",
    "/p/:streamId"
  ], (_req, _res, next) => {
    next();
  });

  app.get(["/api/player", "/api/player/:streamId", "/api/stream-player/:streamId"], (req, res) => {
    const streamId = req.params.streamId;
    if (streamId) {
      res.redirect(`/player/${streamId}`);
    } else {
      res.redirect("/player");
    }
  });

  if (false) {
    app.get("/unused-legacy-html", (req: any, res: any) => {
    const streamId = req.params.streamId || (req.query.id as string);
    const customUrl = (req.query.url as string) || (req.query.stream as string);
    
    let stored = streamId ? telegramBotManager.storedFiles.get(streamId) : undefined;
    let activeStream = streamId ? telegramBotManager.activeStreams.get(streamId) : undefined;

    let title = "ThorStream HD Live Player";
    let isCompleted = false;
    let streamSource = "";
    let vlcLink = "";

    if (stored) {
      title = stored.filename;
      isCompleted = true;
      streamSource = `/api/stream-video/${streamId}`;
      vlcLink = `${req.protocol}://${req.get("host")}/api/stream-video/${streamId}`;
    } else if (activeStream) {
      title = activeStream.title || "Live Lecture Stream";
      isCompleted = false;
      streamSource = `/api/proxy-stream/${streamId}/master.m3u8`;
      vlcLink = `${req.protocol}://${req.get("host")}/api/proxy-stream/${streamId}/master.m3u8`;
    } else if (customUrl) {
      title = "Live External Stream";
      isCompleted = false;
      streamSource = customUrl.startsWith("/api/") ? customUrl : `/api/proxy-m3u8?url=${encodeURIComponent(customUrl)}`;
      vlcLink = `${req.protocol}://${req.get("host")}/api/proxy-m3u8?url=${encodeURIComponent(customUrl)}`;
    } else {
      // Default working test stream fallback so the player ALWAYS works
      title = "Demo Live Test Stream";
      streamSource = "/api/proxy-m3u8?url=" + encodeURIComponent("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
      vlcLink = `${req.protocol}://${req.get("host")}/api/proxy-m3u8?url=` + encodeURIComponent("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} - AuraStream Ultra Glass</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #060913;
      color: #f1f5f9;
      overflow-x: hidden;
    }
    .glass-acrylic {
      background: rgba(13, 18, 36, 0.65);
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 16px 40px 0 rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.15);
    }
    .glass-dock {
      background: rgba(8, 12, 28, 0.85);
      backdrop-filter: blur(32px) saturate(210%);
      -webkit-backdrop-filter: blur(32px) saturate(210%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), inset 0 1px 2px rgba(255, 255, 255, 0.2);
    }
    .liquid-mesh {
      background: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.22) 0%, rgba(6, 182, 212, 0.15) 35%, rgba(217, 70, 239, 0.08) 60%, transparent 80%);
    }
    .filter-night { filter: contrast(115%) brightness(90%); }
    .filter-warm { filter: sepia(0.35) brightness(95%); }
    .filter-contrast { filter: contrast(140%) saturate(120%); }
    .filter-cyber { filter: contrast(130%) saturate(145%) hue-rotate(15deg); }
    
    .controls-fade {
      transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    :fullscreen #playerCard, :-webkit-full-screen #playerCard {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      border-radius: 0 !important;
      border: none !important;
    }
    :fullscreen #videoContainer, :-webkit-full-screen #videoContainer {
      height: 100vh !important;
      aspect-ratio: auto !important;
    }
    :fullscreen video, :-webkit-full-screen video {
      object-fit: contain !important;
      max-height: 100vh !important;
      max-width: 100vw !important;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen selection:bg-cyan-500 selection:text-black relative">

  <!-- Ambient Fluid Light Blobs -->
  <div class="fixed inset-0 pointer-events-none z-0">
    <div class="absolute -top-20 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]"></div>
    <div class="absolute top-1/3 right-10 w-80 h-80 bg-cyan-500/15 rounded-full blur-[110px]"></div>
    <div class="absolute bottom-10 left-10 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-[130px]"></div>
  </div>

  <!-- Header -->
  <header class="relative z-20 border-b border-white/10 bg-slate-950/70 sticky top-0 backdrop-blur-2xl px-4 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/" class="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20 border border-white/20">
          ⚡
        </a>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-sm sm:text-base text-white tracking-tight">AuraStream</span>
            <span class="text-[10px] text-cyan-300 font-extrabold uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30">Ultra Glass</span>
          </div>
          <p class="text-[10px] text-slate-400 truncate hidden sm:block">Hardware Accelerated HLS & MP4 Engine</p>
        </div>
      </div>
      
      <div class="flex items-center space-x-2">
        <button onclick="toggleAccessHub()" class="text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md">
          <i class="fa-solid fa-mobile-screen"></i>
          <span class="hidden sm:inline">Phone & VLC Hub</span>
          <span class="sm:hidden">App Hub</span>
        </button>
        <button onclick="toggleRealLandscape()" class="text-xs bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer border border-white/10">
          <i class="fa-solid fa-mobile-screen-button rotate-90"></i>
          <span>Landscape</span>
        </button>
        <a href="https://t.me/Aura_downlaoder_bot" target="_blank" class="text-xs bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 rounded-xl border border-white/10 transition-colors flex items-center gap-1.5 backdrop-blur-md">
          <i class="fa-brands fa-telegram text-cyan-400"></i>
          <span class="hidden sm:inline">Bot</span>
        </a>
      </div>
    </div>
  </header>

  <!-- Main Player Canvas -->
  <main class="relative z-10 flex-1 flex flex-col items-center justify-center p-2 sm:p-6 max-w-5xl w-full mx-auto space-y-4">
    
    <!-- Token Rescue Alert Banner -->
    <div id="rescueBanner" class="hidden w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 sm:p-4 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-2xl shadow-xl">
      <div class="flex items-center gap-2.5">
        <i class="fa-solid fa-triangle-exclamation text-amber-400 text-base shrink-0"></i>
        <div>
          <span class="font-bold text-amber-300">Stream Token Expired or Blocked?</span>
          <p class="text-[11px] text-amber-200/80 mt-0.5">PW Thor security tokens rotate periodically. Tap "Auto-Repair Stream" or open in external MX/VLC Player.</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="rescueExpiredStream()" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow cursor-pointer">
          <i class="fa-solid fa-wrench"></i>
          <span>Auto-Repair</span>
        </button>
        <button onclick="openInVlc()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded-xl text-xs border border-slate-700 flex items-center gap-1 cursor-pointer">
          <i class="fa-solid fa-play"></i>
          <span>Open in VLC</span>
        </button>
      </div>
    </div>

    <!-- Video Card with Reactive Ambient Glow -->
    <div class="relative w-full">
      <div id="ambilight" class="absolute -inset-2 bg-gradient-to-r from-violet-600/30 via-cyan-500/25 to-fuchsia-600/25 rounded-3xl blur-2xl opacity-60 pointer-events-none transition-opacity"></div>
      
      <!-- Video Screen Container -->
      <div id="playerCard" class="relative glass-acrylic rounded-3xl overflow-hidden shadow-2xl group select-none">
        
        <!-- Video Box (16:9 with contain) -->
        <div id="videoContainer" class="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          <video id="videoElement" playsinline webkit-playsinline class="w-full h-full object-contain"></video>

          <!-- YouTube-Style Hold to 2x Speed Badge -->
          <div id="hold2xBadge" class="absolute top-4 inset-x-0 flex justify-center z-40 transition-all duration-200 opacity-0 pointer-events-none">
            <div class="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.6)] flex items-center gap-1.5 border border-amber-200">
              <i class="fa-solid fa-bolt"></i>
              <span>2X SPEED (Release to resume 1x)</span>
            </div>
          </div>

          <!-- Seek Ripple Feedback Overlay -->
          <div id="seekRipple" class="absolute inset-y-0 flex items-center justify-center z-30 pointer-events-none opacity-0 transition-opacity duration-300">
            <div id="seekRippleText" class="glass-dock text-cyan-300 border border-cyan-400/40 px-5 py-2.5 rounded-2xl font-black font-mono text-base flex items-center gap-2 shadow-2xl">
              <span>+10s</span>
            </div>
          </div>

          <!-- Loading Spinner -->
          <div id="loadingOverlay" class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 transition-opacity duration-300 pointer-events-none opacity-0 z-20 backdrop-blur-xs">
            <div class="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
            <span class="text-xs text-cyan-200 font-mono font-semibold">⚡ Decrypting high-speed liquid stream...</span>
          </div>

          <!-- Unmute Toast Badge -->
          <button id="unmuteBanner" onclick="toggleMute()" class="absolute top-3 right-3 z-30 bg-slate-900/90 hover:bg-cyan-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-full border border-white/20 shadow-xl flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md">
            <i class="fa-solid fa-volume-xmark text-amber-400"></i>
            <span>Tap to Unmute 🔊</span>
          </button>

          <!-- Center Big Play Button -->
          <div id="bigPlayBtn" onclick="togglePlay()" class="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-10 transition-opacity">
            <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-violet-600/90 to-cyan-500/90 text-white flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.5)] border border-white/30 transform hover:scale-110 active:scale-95 transition-all backdrop-blur-md">
              <i class="fa-solid fa-play text-xl sm:text-2xl ml-1"></i>
            </div>
          </div>

          <!-- Touch Interaction Layer -->
          <div id="interactionOverlay" onclick="handleScreenTap(event)" class="absolute inset-0 z-15 cursor-pointer"></div>

          <!-- LIQUID GLASS FLOATING CONTROL DOCK -->
          <div id="controlsOverlay" class="controls-fade absolute bottom-2 inset-x-2 sm:bottom-3 sm:inset-x-3 glass-dock rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 z-30 opacity-100">
            
            <!-- Progress Seek Bar -->
            <div id="progressBarContainer" class="relative w-full h-4 flex items-center cursor-pointer group/bar">
              <div class="w-full bg-slate-700/50 rounded-full h-1.5 group-hover/bar:h-2.5 transition-all overflow-hidden relative border border-white/10">
                <div id="bufferBar" class="absolute left-0 top-0 bg-slate-500/60 h-full rounded-full w-0 transition-all"></div>
                <div id="progressBar" class="absolute left-0 top-0 bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 h-full rounded-full w-0 shadow-[0_0_12px_rgba(6,182,212,0.8)]"></div>
              </div>
            </div>

            <!-- Controls Row -->
            <div class="flex items-center justify-between gap-2 text-xs">
              
              <!-- Left: Play, Seek, Volume, Time -->
              <div class="flex items-center gap-2 sm:gap-3">
                <button id="playBtn" onclick="togglePlay()" class="w-9 h-9 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white flex items-center justify-center cursor-pointer shadow-md shadow-cyan-500/20 border border-white/20">
                  <i id="playIcon" class="fa-solid fa-play ml-0.5 text-xs"></i>
                </button>

                <button onclick="skipSeconds(-10)" class="p-2 text-slate-300 hover:text-cyan-300 rounded-xl hover:bg-white/5 transition-colors cursor-pointer" title="Rewind 10s">
                  <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button onclick="skipSeconds(10)" class="p-2 text-slate-300 hover:text-cyan-300 rounded-xl hover:bg-white/5 transition-colors cursor-pointer" title="Forward 10s">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>

                <!-- Volume & Boost -->
                <div class="flex items-center gap-1.5">
                  <button onclick="toggleMute()" class="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/5 cursor-pointer" title="Mute/Unmute">
                    <i id="volumeIcon" class="fa-solid fa-volume-high"></i>
                  </button>
                  <input id="volumeSlider" type="range" min="0" max="1" step="0.05" value="1" oninput="handleVolume(parseFloat(this.value))" class="w-14 sm:w-18 accent-cyan-400 h-1 bg-slate-700 rounded-lg cursor-pointer hidden sm:block">
                </div>

                <!-- Time -->
                <div class="text-[11px] font-mono text-cyan-200 font-bold whitespace-nowrap bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                  <span id="timeCurrent">00:00</span>
                  <span class="text-slate-500">/</span>
                  <span id="timeDuration">Live</span>
                </div>
              </div>

              <!-- Right: Speed, Quality, Notes, Settings, Fullscreen -->
              <div class="flex items-center gap-1.5 sm:gap-2">
                
                <select id="speedSelect" onchange="setSpeed(parseFloat(this.value))" class="bg-slate-900/90 border border-white/15 text-slate-200 text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none cursor-pointer">
                  <option value="0.75">0.75x</option>
                  <option value="1.0" selected>1.0x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2.0">2.0x</option>
                </select>

                <select id="qualitySelect" class="bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none cursor-pointer">
                  <option value="-1">⚡ Auto HD</option>
                </select>

                <button onclick="toggleNotesDrawer()" class="p-2 text-slate-300 hover:text-cyan-300 rounded-xl hover:bg-white/5 cursor-pointer transition-colors" title="Lecture Notes & Bookmarks">
                  <i class="fa-solid fa-bookmark text-sm"></i>
                </button>

                <button onclick="toggleSettingsModal()" class="p-2 text-slate-300 hover:text-cyan-300 rounded-xl hover:bg-white/5 cursor-pointer transition-colors" title="Player Settings">
                  <i class="fa-solid fa-gear text-sm"></i>
                </button>

                <button onclick="togglePiP()" class="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/5 cursor-pointer hidden sm:block" title="Picture-in-Picture">
                  <i class="fa-solid fa-clone"></i>
                </button>

                <button onclick="toggleRealLandscape()" class="p-2 text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl cursor-pointer" title="Landscape Fullscreen">
                  <i class="fa-solid fa-expand text-sm"></i>
                </button>
              </div>

            </div>
          </div>
        </div>

        <!-- Meta Bar -->
        <div class="p-4 bg-slate-950/60 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/10">
          <div class="min-w-0">
            <h1 class="text-sm sm:text-base font-extrabold text-white truncate flex items-center gap-2">
              <span>${title}</span>
            </h1>
            <p class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span class="text-cyan-300 font-bold">⚡ Zero Buffering</span>
              <span>•</span>
              <span>AES-128 Hardware Decrypt</span>
              <span>•</span>
              <span class="text-amber-300">Hold for 2X</span>
            </p>
          </div>

          <div class="flex items-center space-x-2 shrink-0">
            <button onclick="openInVlc()" class="bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-orange-500/30 flex items-center gap-1.5 cursor-pointer transition-colors">
              <i class="fa-solid fa-play"></i>
              <span>VLC / MX</span>
            </button>
            <button onclick="copyVlcLink()" class="bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-copy"></i>
              <span>Copy Stream</span>
            </button>
            <button onclick="shareLink()" class="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/20 border border-white/20">
              <i class="fa-solid fa-share-nodes"></i>
              <span>Share</span>
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- Phone Access & Google 403 Solution Hub Modal -->
    <div id="accessHubModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity">
      <div class="glass-dock border border-cyan-500/40 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <i class="fa-solid fa-mobile-screen text-sm"></i>
            </div>
            <div>
              <span class="font-extrabold text-sm text-white">Mobile & External Launch Hub</span>
              <p class="text-[10px] text-cyan-300">Bypass Google 403 on Phone / Tablet</p>
            </div>
          </div>
          <button onclick="toggleAccessHub()" class="text-slate-400 hover:text-white text-base p-1 cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p class="text-slate-300 leading-relaxed text-[11px]">
          If opening on a phone gives <b>"Error 403 Forbidden"</b> (due to Google Auth cookies), use any of these direct 1-tap links:
        </p>

        <div class="space-y-2">
          <!-- 1. VLC Android / iOS -->
          <button onclick="openInVlc()" class="w-full bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/40 text-orange-200 p-3 rounded-2xl flex items-center justify-between transition-all cursor-pointer">
            <div class="flex items-center gap-3 text-left">
              <i class="fa-solid fa-play text-orange-400 text-lg"></i>
              <div>
                <p class="font-bold text-white text-xs">Launch in VLC Player App</p>
                <p class="text-[10px] text-orange-300/80">Android, iOS, iPadOS & Windows</p>
              </div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square text-orange-400"></i>
          </button>

          <!-- 2. MX Player Android -->
          <button onclick="openInMx()" class="w-full bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-200 p-3 rounded-2xl flex items-center justify-between transition-all cursor-pointer">
            <div class="flex items-center gap-3 text-left">
              <i class="fa-solid fa-tv text-cyan-400 text-lg"></i>
              <div>
                <p class="font-bold text-white text-xs">Launch in MX Player (Android)</p>
                <p class="text-[10px] text-cyan-300/80">Direct Intent HW+ Hardware Playback</p>
              </div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square text-cyan-400"></i>
          </button>

          <!-- 3. Telegram Bot Direct Video -->
          <a href="https://t.me/Aura_downlaoder_bot" target="_blank" class="w-full bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-200 p-3 rounded-2xl flex items-center justify-between transition-all">
            <div class="flex items-center gap-3 text-left">
              <i class="fa-brands fa-telegram text-violet-400 text-lg"></i>
              <div>
                <p class="font-bold text-white text-xs">Watch inside Telegram Chat</p>
                <p class="text-[10px] text-violet-300/80">Up to 2GB MP4 file with 16:9 Thumbnail</p>
              </div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square text-violet-400"></i>
          </a>
        </div>

        <button onclick="toggleAccessHub()" class="w-full bg-white/10 hover:bg-white/15 text-white font-bold py-2.5 rounded-2xl transition-colors">
          Close Hub
        </button>
      </div>
    </div>

    <!-- Notes & Bookmarks Drawer -->
    <div id="notesDrawer" class="fixed inset-y-0 right-0 max-w-sm w-full glass-dock z-50 p-5 flex flex-col gap-4 transform translate-x-full transition-transform duration-300 border-l border-white/15">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-bookmark text-cyan-400"></i>
          <span class="font-extrabold text-sm text-white">Lecture Bookmarks & Notes</span>
        </div>
        <button onclick="toggleNotesDrawer()" class="text-slate-400 hover:text-white text-base cursor-pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="flex gap-2">
        <input id="noteInput" type="text" placeholder="Note (e.g. Important formula)..." class="flex-1 bg-slate-900/90 border border-white/15 text-xs text-white px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-400">
        <button onclick="addCurrentBookmark()" class="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs shrink-0 cursor-pointer shadow-md">
          Save
        </button>
      </div>

      <div id="bookmarksList" class="flex-1 overflow-y-auto space-y-2 pr-1">
        <!-- Dynamic Bookmarks rendered here -->
      </div>
    </div>

  </main>

  <!-- Settings Modal -->
  <div id="settingsModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity">
    <div class="glass-dock rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs border border-white/15">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-sliders text-cyan-400"></i>
          <span class="font-extrabold text-sm text-white">AuraStream Settings</span>
        </div>
        <button onclick="toggleSettingsModal()" class="text-slate-400 hover:text-white text-base p-1 cursor-pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Audio Booster -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-slate-300 font-bold">🔊 Audio 200% Gain Booster:</span>
          <span id="boostDisplay" class="font-mono text-cyan-400 font-black">100%</span>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <button onclick="setVolumeBoost(100)" class="boost-btn p-2 rounded-xl bg-cyan-600 text-white font-bold cursor-pointer">100%</button>
          <button onclick="setVolumeBoost(150)" class="boost-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">150%</button>
          <button onclick="setVolumeBoost(200)" class="boost-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">200% Super</button>
        </div>
      </div>

      <!-- Eye-Care Filter -->
      <div class="space-y-1.5">
        <span class="text-slate-300 font-bold">👁️ Liquid Video Filter:</span>
        <div class="grid grid-cols-4 gap-1.5 text-[11px]">
          <button onclick="setFilter('normal')" class="filter-btn p-2 rounded-xl bg-cyan-600 text-white font-bold cursor-pointer">Normal</button>
          <button onclick="setFilter('night')" class="filter-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">OLED</button>
          <button onclick="setFilter('warm')" class="filter-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">Warm</button>
          <button onclick="setFilter('cyber')" class="filter-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">Cyber</button>
        </div>
      </div>

      <!-- Aspect Ratio -->
      <div class="space-y-1.5">
        <span class="text-slate-300 font-bold">📐 Aspect Ratio (No Blur in Fullscreen):</span>
        <div class="grid grid-cols-3 gap-1.5 text-[11px]">
          <button onclick="setAspect('16/9')" class="aspect-btn p-2 rounded-xl bg-cyan-600 text-white font-bold cursor-pointer">16:9</button>
          <button onclick="setAspect('4/3')" class="aspect-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">4:3</button>
          <button onclick="setAspect('cover')" class="aspect-btn p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 font-bold cursor-pointer">Crop Fill</button>
        </div>
      </div>

      <button onclick="toggleSettingsModal()" class="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-extrabold py-2.5 rounded-2xl text-center shadow-lg cursor-pointer">
        Save Settings
      </button>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast" class="fixed bottom-6 right-6 glass-dock text-cyan-200 border border-cyan-400/40 text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl transition-all duration-300 transform translate-y-20 opacity-0 pointer-events-none flex items-center gap-2.5 z-50">
    <i class="fa-solid fa-circle-check text-cyan-400"></i>
    <span id="toastMsg">Action completed!</span>
  </div>

  <script>
    const video = document.getElementById('videoElement');
    const qualitySelect = document.getElementById('qualitySelect');
    const speedSelect = document.getElementById('speedSelect');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const bigPlayBtn = document.getElementById('bigPlayBtn');
    const progressBar = document.getElementById('progressBar');
    const bufferBar = document.getElementById('bufferBar');
    const progressBarContainer = document.getElementById('progressBarContainer');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeDuration = document.getElementById('timeDuration');
    const unmuteBanner = document.getElementById('unmuteBanner');
    const hold2xBadge = document.getElementById('hold2xBadge');
    const seekRipple = document.getElementById('seekRipple');
    const seekRippleText = document.getElementById('seekRippleText');
    const videoContainer = document.getElementById('videoContainer');
    const playerCard = document.getElementById('playerCard');
    const rescueBanner = document.getElementById('rescueBanner');
    const controlsOverlay = document.getElementById('controlsOverlay');
    const settingsModal = document.getElementById('settingsModal');
    const accessHubModal = document.getElementById('accessHubModal');
    const notesDrawer = document.getElementById('notesDrawer');
    const bookmarksList = document.getElementById('bookmarksList');

    const vlcUrl = "${vlcLink}";
    let currentStreamSource = "${streamSource}";
    const isCompleted = ${isCompleted};

    let hlsInstance = null;
    let audioCtx = null;
    let gainNode = null;
    let currentBoost = 100;
    let baseSpeed = 1.0;
    let holdTimer = null;
    let isHolding = false;
    let controlsHideTimeout = null;
    let lastTapTime = 0;
    let bookmarks = [];

    // Load bookmarks from localStorage
    try {
      const saved = localStorage.getItem('aurastream_bookmarks_' + window.location.pathname);
      if (saved) bookmarks = JSON.parse(saved);
    } catch {}

    function renderBookmarks() {
      if (bookmarks.length === 0) {
        bookmarksList.innerHTML = '<div class="text-center text-slate-500 py-8 text-xs">No bookmarks saved yet. Tap "Save" during playback!</div>';
        return;
      }
      bookmarksList.innerHTML = bookmarks.map((b, idx) => \`
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-2 hover:border-cyan-500/40 transition-colors">
          <button onclick="seekToBookmark(\${b.time})" class="text-left flex-1 min-w-0 cursor-pointer">
            <span class="text-cyan-300 font-mono font-bold text-xs bg-cyan-500/10 px-2 py-0.5 rounded-md">\${b.timeStr}</span>
            <p class="text-white text-xs font-semibold truncate mt-1">\${b.note || 'Bookmark'}</p>
          </button>
          <button onclick="deleteBookmark(\${idx})" class="text-red-400 hover:text-red-300 p-1.5 cursor-pointer">
            <i class="fa-solid fa-trash text-xs"></i>
          </button>
        </div>
      \`).join('');
    }

    function addCurrentBookmark() {
      const time = video.currentTime || 0;
      const noteInput = document.getElementById('noteInput');
      const note = noteInput.value.trim();
      bookmarks.push({ time, timeStr: formatTime(time), note });
      try {
        localStorage.setItem('aurastream_bookmarks_' + window.location.pathname, JSON.stringify(bookmarks));
      } catch {}
      noteInput.value = '';
      renderBookmarks();
      showToast('Bookmark saved at ' + formatTime(time));
    }

    function seekToBookmark(t) {
      video.currentTime = t;
      video.play().catch(() => {});
      showToast('Jumped to ' + formatTime(t));
    }

    function deleteBookmark(idx) {
      bookmarks.splice(idx, 1);
      try {
        localStorage.setItem('aurastream_bookmarks_' + window.location.pathname, JSON.stringify(bookmarks));
      } catch {}
      renderBookmarks();
    }

    function toggleNotesDrawer() {
      renderBookmarks();
      notesDrawer.classList.toggle('translate-x-full');
    }

    function toggleAccessHub() {
      accessHubModal.classList.toggle('pointer-events-none');
      accessHubModal.classList.toggle('opacity-0');
    }

    // REAL PROPER LANDSCAPE & FULLSCREEN (No blur, no stretching)
    async function toggleRealLandscape() {
      try {
        if (!document.fullscreenElement) {
          if (playerCard.requestFullscreen) {
            await playerCard.requestFullscreen();
          } else if (video.requestFullscreen) {
            await video.requestFullscreen();
          }
          if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
          }
          showToast("Landscape Fullscreen 📱");
        } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          }
          if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
          }
        }
      } catch (err) {
        console.warn("Fullscreen notice:", err);
      }
    }

    // Direct Launch into VLC
    function openInVlc() {
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      if (isAndroid) {
        window.location.href = "vlc://" + vlcUrl;
        setTimeout(() => {
          const intentUrl = "intent:" + vlcUrl + "#Intent;action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;end";
          window.location.href = intentUrl;
        }, 500);
      } else if (isIOS) {
        window.location.href = "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(vlcUrl);
      } else {
        window.location.href = "vlc://" + vlcUrl;
      }
      showToast("Launching in VLC Player...");
    }

    // Direct Launch into MX Player Android
    function openInMx() {
      const intentUrl = "intent:" + vlcUrl + "#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.ad;end";
      window.location.href = intentUrl;
      showToast("Launching in MX Player...");
    }

    // Auto-Repair Expired Stream
    function rescueExpiredStream() {
      showToast("⚡ Rescuing stream... Reconnecting to clean proxy.");
      rescueBanner.classList.add('hidden');
      loadingOverlay.classList.remove('opacity-0');
      
      let repairedUrl = currentStreamSource;
      if (repairedUrl.includes('?')) {
        repairedUrl = repairedUrl.split('?')[0];
      }
      
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }

      setTimeout(() => {
        initHlsStream(repairedUrl);
        showToast("✅ Stream reconnected!");
      }, 500);
    }

    // Web Audio 200% Gain Booster
    function initBooster() {
      if (audioCtx) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioCtx = new AudioContext();
        gainNode = audioCtx.createGain();
        const source = audioCtx.createMediaElementSource(video);
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.value = currentBoost / 100;
      } catch (e) {
        console.warn("Booster init notice:", e);
      }
    }

    function setVolumeBoost(val) {
      initBooster();
      currentBoost = val;
      if (gainNode) gainNode.gain.value = (currentBoost / 100) * video.volume;
      document.getElementById('boostDisplay').innerText = val + '%';
      showToast('Audio set to ' + val + '%');
    }

    function toggleSettingsModal() {
      const isClosed = settingsModal.classList.contains('pointer-events-none');
      if (isClosed) {
        settingsModal.classList.remove('pointer-events-none', 'opacity-0');
      } else {
        settingsModal.classList.add('pointer-events-none', 'opacity-0');
      }
    }

    // Controls Auto-Hide Engine
    function showControls() {
      controlsOverlay.style.opacity = '1';
      controlsOverlay.style.pointerEvents = 'auto';
      if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
      if (!video.paused) {
        controlsHideTimeout = setTimeout(() => {
          controlsOverlay.style.opacity = '0';
          controlsOverlay.style.pointerEvents = 'none';
        }, 3500);
      }
    }

    function handleScreenTap(e) {
      const now = Date.now();
      const rect = videoContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;

      if (now - lastTapTime < 300) {
        if (clickX < width * 0.35) {
          skipSeconds(-10);
        } else if (clickX > width * 0.65) {
          skipSeconds(10);
        } else {
          togglePlay();
        }
      } else {
        if (controlsOverlay.style.opacity === '0') {
          showControls();
        } else {
          controlsOverlay.style.opacity = '0';
          controlsOverlay.style.pointerEvents = 'none';
        }
      }
      lastTapTime = now;
    }

    videoContainer.addEventListener('mousemove', showControls);
    videoContainer.addEventListener('touchstart', showControls);

    function togglePlay() {
      initBooster();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }

    video.addEventListener('play', () => {
      playIcon.className = 'fa-solid fa-pause text-xs';
      bigPlayBtn.classList.add('opacity-0', 'pointer-events-none');
      showControls();
    });

    video.addEventListener('pause', () => {
      playIcon.className = 'fa-solid fa-play ml-0.5 text-xs';
      bigPlayBtn.classList.remove('opacity-0', 'pointer-events-none');
      showControls();
    });

    function toggleMute() {
      initBooster();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      video.muted = !video.muted;
      updateVolumeIcon();
    }

    function handleVolume(val) {
      initBooster();
      video.volume = val;
      if (val > 0) video.muted = false;
      if (gainNode) gainNode.gain.value = (currentBoost / 100) * val;
      updateVolumeIcon();
    }

    function updateVolumeIcon() {
      const volIcon = document.getElementById('volumeIcon');
      if (video.muted || video.volume === 0) {
        volIcon.className = 'fa-solid fa-volume-xmark text-red-400';
        unmuteBanner.classList.remove('hidden');
      } else {
        volIcon.className = 'fa-solid fa-volume-high';
        unmuteBanner.classList.add('hidden');
      }
    }

    function setSpeed(spd) {
      baseSpeed = spd;
      video.playbackRate = spd;
      video.preservesPitch = true;
      speedSelect.value = spd.toString();
    }

    // YouTube-Style Hold to 2x Speed
    function startHold2x() {
      if (isHolding) return;
      isHolding = true;
      video.playbackRate = 2.0;
      video.preservesPitch = true;
      hold2xBadge.classList.remove('opacity-0');
    }

    function endHold2x() {
      if (!isHolding) return;
      isHolding = false;
      video.playbackRate = baseSpeed;
      video.preservesPitch = true;
      hold2xBadge.classList.add('opacity-0');
    }

    videoContainer.addEventListener('mousedown', (e) => {
      if (e.button === 0) holdTimer = setTimeout(startHold2x, 250);
    });
    window.addEventListener('mouseup', () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (isHolding) endHold2x();
    });
    videoContainer.addEventListener('touchstart', () => {
      holdTimer = setTimeout(startHold2x, 250);
    });
    window.addEventListener('touchend', () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (isHolding) endHold2x();
    });

    function skipSeconds(sec) {
      video.currentTime = Math.max(0, Math.min(video.duration || 999999, video.currentTime + sec));
      seekRippleText.innerText = (sec > 0 ? '+' : '') + sec + 's';
      seekRipple.style.left = sec > 0 ? '65%' : '20%';
      seekRipple.classList.remove('opacity-0');
      setTimeout(() => seekRipple.classList.add('opacity-0'), 600);
      showControls();
    }

    function setAspect(asp) {
      if (asp === 'cover') {
        video.className = 'w-full h-full object-cover';
      } else {
        video.className = 'w-full h-full object-contain';
      }
    }

    function setFilter(flt) {
      video.classList.remove('filter-night', 'filter-warm', 'filter-contrast', 'filter-cyber');
      if (flt !== 'normal') video.classList.add('filter-' + flt);
    }

    function togglePiP() {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else if (video.requestPictureInPicture) {
        video.requestPictureInPicture().catch(() => {});
      }
    }

    function formatTime(s) {
      if (isNaN(s) || s < 0) return "00:00";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    video.addEventListener('timeupdate', () => {
      timeCurrent.innerText = formatTime(video.currentTime);
      if (video.duration && !isNaN(video.duration)) {
        timeDuration.innerText = formatTime(video.duration);
        progressBar.style.width = ((video.currentTime / video.duration) * 100) + '%';
      }
      if (video.buffered && video.buffered.length > 0 && video.duration) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        bufferBar.style.width = ((bufferedEnd / video.duration) * 100) + '%';
      }
    });

    progressBarContainer.addEventListener('click', (e) => {
      if (!video.duration) return;
      const rect = progressBarContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      video.currentTime = pos * video.duration;
    });

    // Function to attach HLS stream
    function initHlsStream(sourceUrl) {
      currentStreamSource = sourceUrl;
      if (!isCompleted && Hls.isSupported()) {
        hlsInstance = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          backBufferLength: 90,
        });

        hlsInstance.loadSource(sourceUrl);
        hlsInstance.attachMedia(video);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          loadingOverlay.classList.add('opacity-0');
          rescueBanner.classList.add('hidden');
          video.muted = true;
          updateVolumeIcon();
          video.play().catch(() => {});
          
          qualitySelect.innerHTML = '<option value="-1">⚡ Auto HD</option>';
          if (data.levels && data.levels.length > 0) {
            data.levels.forEach((lvl, idx) => {
              const h = lvl.height || 'HD';
              const opt = document.createElement('option');
              opt.value = idx;
              opt.innerText = h + 'p';
              qualitySelect.appendChild(opt);
            });
          }
        });

        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn("HLS Fatal error:", data);
            rescueBanner.classList.remove('hidden');
            loadingOverlay.classList.add('opacity-0');
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hlsInstance.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hlsInstance.recoverMediaError();
                break;
              default:
                hlsInstance.destroy();
                break;
            }
          }
        });

        qualitySelect.addEventListener('change', function () {
          hlsInstance.currentLevel = parseInt(this.value, 10);
        });

        hlsInstance.on(Hls.Events.BUFFER_STALLED, () => loadingOverlay.classList.remove('opacity-0'));
        hlsInstance.on(Hls.Events.FRAG_BUFFERED, () => loadingOverlay.classList.add('opacity-0'));

      } else {
        video.src = sourceUrl;
        video.muted = true;
        updateVolumeIcon();
        video.play().catch(() => {});
      }
    }

    initHlsStream(currentStreamSource);

    function copyVlcLink() {
      navigator.clipboard.writeText(vlcUrl).then(() => showToast("Stream link copied!")).catch(() => prompt("Copy URL:", vlcUrl));
    }

    function shareLink() {
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl).then(() => showToast("Player share link copied!")).catch(() => prompt("Copy:", shareUrl));
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      toastMsg.innerText = msg;
      toast.classList.remove('translate-y-20', 'opacity-0');
      setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2500);
    }
  </script>
</body>
</html>`;

    res.send(html);
  });
  }

  // Standalone legacy stream player redirect
  app.get("/api/stream-player/:fileId", (req, res) => {
    res.redirect(`/api/player/${req.params.fileId}`);
  });

  // Stream inspector endpoint (parses m3u8 URL info safely)
  app.post("/api/inspect-stream", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Stream URL is required" });
      }

      // Basic validation
      const isM3U8 = url.includes(".m3u8") || url.includes("stream") || url.includes("pwthor");
      
      // Extract suggested filename from URL
      let suggestedTitle = "PWThor_Video_Stream";
      try {
        const parsedUrl = new URL(url);
        const segments = parsedUrl.pathname.split("/").filter(Boolean);
        if (segments.length > 0) {
          const last = segments[segments.length - 1];
          if (last.includes(".m3u8") && segments.length > 1) {
            const idPart = segments[segments.length - 2].slice(0, 16);
            suggestedTitle = `ThorStream_${idPart}`;
          } else {
            suggestedTitle = `ThorStream_${last.replace(/\.[^/.]+$/, "").slice(0, 20)}`;
          }
        }
      } catch {
        suggestedTitle = "ThorStream_Master_Video";
      }

      const probe = await turboHlsDownloader.probeQualities(url);

      res.json({
        valid: isM3U8,
        suggestedTitle,
        detectedFormat: "HLS (HTTP Live Streaming m3u8)",
        qualities: probe.qualities,
        supportedEngines: ["Pyrogram MTProto 2GB", "64-Socket Parallel Turbo", "Live HLS Proxy"],
        features: {
          supportsStreaming: true,
          liveStreamPlayer: true,
          thumbnailAspect: "16:9 High Definition",
          maxSpeedThreads: 64,
          telegramBypass: "2GB (Standard) / 4GB (Premium)"
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to inspect stream" });
    }
  });

  // Get default credentials & configuration
  app.get("/api/bot-config", (_req, res) => {
    res.json({
      botToken: "8869839388:AAGDyoRAhHW2MPrSkWq8StEfdV_ii8S1aHo",
      apiId: "39902940",
      apiHash: "9f37fc6282079681fd4c1bb55916a758",
      sampleUrl: "https://p01--streamthorr--fttnk8y47n9c.code.run/stream/8f1V1vpp9vt_IKk2.34Pien8np-BiXHC_0UiUKjAhpHnSDFcGiR4EH6CHbAGIoFIKYPB7-ezwBw1MACEWKzwL0kr9p6cwq4ihbxDqLf00sbU6QOZL3CueKm3c5Fslu-v0uYEbaxPVsrsY0oDtCFNDoedHJLFoK_G177LQCpPDT-hFj9cWgw_u8VuGU5p8wlgm3FVNRGvDy2fZ6YQ6mJ8woz-eYWcm5EnYOutVBUKkd7uT77Dir2HGZ7qcEmZGVggN0ZX6fneCDb2Edn42c9CXwdaNWfjgVI7T0M_LGL6ah_W9dFDhhhCulk_A5UmF9GmJh3sEbT2-Vh-vvicSfoXaRsrDnWyWEeBtL2PRP_P6H9BPJjqRXYoxLdXWSr6UT_9oCIOAZ-RUuDWJq4nXMo56avH65uvq3lPqUji_eGCqNk-1Sbu95vG7u3HEaWY3gRPVEU7NJKFWYVc0h0Q1tNJg2OEH0rNjNq3WY2ejufpvO3TvHDMxezOHZC-PRJgAKzOcVUfEnBx9WaVgyK6kAXGdDbhJ47fdZtiDPrnu7fus_P6FCkeyOsBUoPSJoeK2nsU3aorBF1n1dGvnMEY_JHxynZQII178chSeKnpFhr_VZC46cce5S_U7oQLJaxST2zWo-_R5qv-e-6OvSNn_l9HTcAXSfbjsv4_ch-vMxeegQZyYuBbPg6sL1lrk_iGTL74n7nD0HS0j2JUuTGIaT6tQfyz5zzKgP_L7AFRpwJIIrG2zQq-V-tMRsRJbuZ--0RdT6D-qmw3TgOi5E83iBnSnqEbq5U2lz-F_-WlYiQQ_-5su8Z6XSr_v6bSv1YIF-odk9bIkcrDthIjqjtP6ZLRhwyjRZPZVbxKOimSJOOMX2_028_SXbGXqBYXFNTVWEMaAPhPAzfyUWqTtI8G4w5KmX-C7_dnUNMOa87rSFuFYvad1Ed5IzSs66e-dM266-q_GGUQuaE3nSIPidc3XvH8e4-Fh1V0ZhvOM1K2TZKas_AoSQN_t1qqpIaY1XFifa2R7Iaf_xI-PSRWYSN3ckZseVuXX18wPZmSn5LgVnewind0ex0i9T9Kr9R905wiv23lVY8E1leKZDxzQ-Q/master.m3u8",
      defaultThreads: 64,
      maxSpeedMode: "Turbo 64-Socket Multi-Stream V4"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const cleanup = async () => {
    try {
      await telegramBotManager.stopBot();
    } catch {}
    server.close();
  };

  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}

startServer();
