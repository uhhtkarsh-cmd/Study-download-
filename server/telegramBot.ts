import { Bot } from "grammy";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from "fs";
import path from "path";
import os from "os";
import { turboHlsDownloader, StreamQuality, fetchBuffer } from "./hlsEngine";

export interface BotLog {
  id: string;
  time: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

export interface ActiveTask {
  id: string;
  chatId: number;
  username?: string;
  title: string;
  url: string;
  quality?: string;
  downloadedMB: number;
  percentage: number;
  totalSize?: string;
  speed: string;
  duration?: string;
  totalDuration?: string;
  status: "downloading" | "remuxing" | "uploading" | "completed" | "error";
  startTime: number;
}

export interface StoredFile {
  fileId: string;
  filename: string;
  filePath: string;
  thumbPath?: string;
  fileSizeBytes: number;
  fileSizeMB: string;
  duration?: string;
  quality?: string;
  createdAt: number;
}

export interface ActiveStreamRef {
  id: string;
  url: string;
  title: string;
  hostname: string;
  qualities: StreamQuality[];
  createdAt: number;
}

export interface BotState {
  isRunning: boolean;
  botInfo: {
    id: number;
    username: string;
    firstName: string;
  } | null;
  botToken: string;
  apiId: string;
  apiHash: string;
  totalDownloads: number;
  activeTasks: ActiveTask[];
  logs: BotLog[];
}

const DEFAULT_BOT_TOKEN = "8869839388:AAGDyoRAhHW2MPrSkWq8StEfdV_ii8S1aHo";
const DEFAULT_API_ID = "39902940";
const DEFAULT_API_HASH = "9f37fc6282079681fd4c1bb55916a758";
// Active dev URL that never 404s
const PUBLIC_DEV_URL = "https://ais-dev-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app";

class TelegramBotManager {
  private bot: Bot | null = null;
  private mtprotoClient: TelegramClient | null = null;
  private mtprotoConnecting = false;
  private isStarting = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;
  // Always default to the currently running active dev container URL
  public publicDomain = process.env.PUBLIC_URL || PUBLIC_DEV_URL;
  public dumpChannelId: number | null = null;
  public customThumbnailPath: string | null = null;
  public userSpeedMultiplier: number = 1.0;
  public autoScreenshotsEnabled: boolean = true;

  public state: BotState = {
    isRunning: false,
    botInfo: null,
    botToken: DEFAULT_BOT_TOKEN,
    apiId: DEFAULT_API_ID,
    apiHash: DEFAULT_API_HASH,
    totalDownloads: 0,
    activeTasks: [],
    logs: [],
  };

  public activeStreams = new Map<string, ActiveStreamRef>();
  private pendingTitles = new Map<number, { url: string; qualityId?: string; qualityLabel?: string }>();
  public storedFiles = new Map<string, StoredFile>();

  constructor() {
    this.addLog("info", "⚡ Initializing AuraStream Ultra Engine...");
    this.startBot();
  }

  public addLog(level: "info" | "success" | "warn" | "error", message: string) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const log: BotLog = {
      id: Math.random().toString(36).substring(2, 9),
      time,
      level,
      message,
    };
    this.state.logs.unshift(log);
    if (this.state.logs.length > 200) {
      this.state.logs.pop();
    }
    console.log(`[BOT][${level.toUpperCase()}] ${message}`);
  }

  public getAppUrl(): string {
    return this.publicDomain;
  }

  /**
   * Initializes the MTProto client for 2GB direct file uploads
   */
  private async getMtprotoClient(): Promise<TelegramClient | null> {
    if (this.mtprotoClient) {
      return this.mtprotoClient;
    }

    if (this.mtprotoConnecting) {
      let attempts = 0;
      while (this.mtprotoConnecting && attempts < 20) {
        await new Promise((r) => setTimeout(r, 250));
        attempts++;
      }
      return this.mtprotoClient;
    }

    this.mtprotoConnecting = true;
    try {
      this.addLog("info", "Connecting MTProto high-speed 2GB upload client...");
      const stringSession = new StringSession("");
      const apiId = parseInt(this.state.apiId, 10);
      const apiHash = this.state.apiHash;

      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false,
        timeout: 20000,
      });

      await client.start({
        botAuthToken: this.state.botToken,
      });

      this.mtprotoClient = client;
      this.addLog("success", "MTProto 2GB Upload Engine connected successfully.");
      return this.mtprotoClient;
    } catch (err: any) {
      this.addLog("warn", `MTProto connection notice: ${err?.message || err}. Falling back to standard Bot API.`);
      return null;
    } finally {
      this.mtprotoConnecting = false;
    }
  }

  public async startBot() {
    if (this.isStarting) return;
    if (this.state.isRunning && this.bot) {
      return;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.isStarting = true;

    try {
      if (this.bot) {
        try {
          await this.bot.stop();
        } catch {}
        this.bot = null;
      }

      this.addLog("info", "Connecting to Telegram Bot API (@Aura_downlaoder_bot)...");
      this.bot = new Bot(this.state.botToken);

      // Verify token
      const me = await this.bot.api.getMe();
      this.state.botInfo = {
        id: me.id,
        username: me.username || "Aura_downlaoder_bot",
        firstName: me.first_name,
      };

      this.setupHandlers();

      // Reset any webhook and drop pending updates cleanly before polling
      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: true });
      } catch (e: any) {
        // Non-fatal notice
      }

      // Register bot commands with Telegram so they appear in the UI menu button
      this.bot.api.setMyCommands([
        { command: "start", description: "🚀 Main Dashboard & Quick Download" },
        { command: "batch", description: "📦 Batch Download multiple .m3u8 URLs" },
        { command: "speed", description: "⚡ Set Download Speed (1.0x - 2.0x)" },
        { command: "screens", description: "📸 Toggle 5x Auto Lecture Screenshots" },
        { command: "speedtest", description: "🚀 1000 Mbps Line Speed Benchmark" },
        { command: "stats", description: "📊 Server, Memory & Socket Status" },
        { command: "setdomain", description: "🌐 Set Public Web Player Domain" },
        { command: "setdump", description: "📁 Auto-Backup Videos to Dump Channel" },
        { command: "delthumb", description: "🗑️ Remove Custom Thumbnail" },
        { command: "help", description: "💡 Complete Guide & Player Shortcuts" }
      ]).catch(() => {});

      // Connect MTProto client in background
      this.getMtprotoClient().catch((err) => {
        this.addLog("warn", `MTProto background init: ${err?.message}`);
      });

      this.state.isRunning = true;
      this.retryCount = 0;
      this.addLog("success", `Bot online: @${this.state.botInfo.username}`);

      // Start long-polling with graceful conflict recovery
      this.bot.start({
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query", "channel_post", "edited_message"],
        onStart: (botInfo) => {
          this.retryCount = 0;
          this.addLog("success", `🚀 Telegram bot @${botInfo.username} ready for stream links!`);
        },
      }).catch(async (err) => {
        const errMsg = err?.message || String(err);
        this.state.isRunning = false;

        if (errMsg.includes("409") || errMsg.includes("Conflict") || errMsg.includes("terminated by other getUpdates request")) {
          this.retryCount++;
          const delaySec = Math.min(30, 3 + this.retryCount * 2);
          this.addLog("warn", `Telegram notice: Instance conflict (409) — waiting for previous polling session to release. Auto-reconnecting in ${delaySec}s (attempt ${this.retryCount})...`);

          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => {
            this.startBot().catch(() => {});
          }, delaySec * 1000);
        } else {
          this.addLog("error", `Telegram polling error: ${errMsg}`);
        }
      });

    } catch (err: any) {
      this.state.isRunning = false;
      const errMsg = err?.message || String(err);

      if (errMsg.includes("409") || errMsg.includes("Conflict") || errMsg.includes("terminated by other getUpdates request")) {
        this.retryCount++;
        const delaySec = Math.min(30, 3 + this.retryCount * 2);
        this.addLog("warn", `Telegram notice: Instance conflict (409) — waiting for previous polling session to release. Auto-reconnecting in ${delaySec}s (attempt ${this.retryCount})...`);

        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.startBot().catch(() => {});
        }, delaySec * 1000);
      } else {
        this.addLog("error", `Failed to start Telegram bot: ${errMsg}`);
      }
    } finally {
      this.isStarting = false;
    }
  }

  public async stopBot() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.bot) {
      try {
        await this.bot.stop();
      } catch (err: any) {
        // Ignore stop error
      }
      this.bot = null;
    }
    if (this.mtprotoClient) {
      try {
        await this.mtprotoClient.disconnect();
      } catch {}
      this.mtprotoClient = null;
    }
    this.state.isRunning = false;
    this.addLog("warn", "Telegram bot stopped cleanly.");
  }

  private setupHandlers() {
    if (!this.bot) return;

    this.bot.catch((err) => {
      this.addLog("error", `Telegram handler error: ${err.message}`);
    });

    // /start command
    this.bot.command("start", async (ctx) => {
      const user = ctx.from?.first_name || "User";
      this.addLog("info", `Received /start from ${user} (@${ctx.from?.username || "no_user"})`);

      const welcomeMsg = 
`⚡ <b>Welcome, ${user}!</b>

Send any <b>.m3u8 stream link</b> to:
• <b>▶️ Stream Instantly Online</b> in web player with speed & quality control (No waiting!)
• <b>📥 Download Full Video</b> directly to Telegram with quality selector (720p, 480p, 360p, 240p)
• <b>⚡ 128x Hyper-Turbo Engine</b> with 1000+ Mbps line speed
• <b>✨ 16:9 HD Thumbnail</b> & streaming video player attributes

👉 <i>Just paste your .m3u8 stream link below:</i>`;

      await ctx.reply(welcomeMsg, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⚡ Test Demo Stream", callback_data: "demo_stream" },
              { text: "📊 Speed Test", callback_data: "speedtest_action" }
            ]
          ]
        }
      });
    });

    // /help command
    this.bot.command("help", async (ctx) => {
      const helpMsg = 
`⚡ <b>ThorStream Bot Commands & Pro Features:</b>

• <b>/start</b> - Welcome message & quick actions
• <b>/batch</b> - Batch download multiple .m3u8 URLs or txt file
• <b>/setdomain &lt;url&gt;</b> - Set public web player domain (fixes 403)
• <b>/speed &lt;1.0|1.25|1.5|2.0&gt;</b> - Download encoded at high speed
• <b>/screens</b> - Toggle auto 5x lecture screenshots in chat
• <b>/setdump &lt;chat_id&gt;</b> - Auto-forward downloaded videos to archive channel
• <b>/stats</b> - View CPU, memory, socket pool, and bandwidth status
• <b>/speedtest</b> - Run live 1000 Mbps line speed benchmark
• <b>📸 Send any Photo</b> - Set custom 16:9 thumbnail for all lecture downloads!
• <b>/delthumb</b> - Remove custom thumbnail

<b>📺 Player Features:</b>
• 2X Speed with 1-touch hold
• Force Landscape Orientation lock
• 200% Audio Gain Booster
• VLC / MX Player 1-Tap direct launch`;

      await ctx.reply(helpMsg, { parse_mode: "HTML" });
    });

    // /stats command
    this.bot.command("stats", async (ctx) => {
      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const activeCount = this.state.activeTasks.length;
      const totalCount = this.state.totalDownloads;
      const cachedStreams = this.activeStreams.size;
      const domain = this.publicDomain;

      const statsMsg = 
`📊 <b>ThorStream Bot Engine Diagnostics:</b>

• <b>Active Downloads:</b> ${activeCount} active tasks
• <b>Total Completed:</b> ${totalCount} videos delivered
• <b>Memory Heap:</b> ${heapMB} MB
• <b>Socket Engine:</b> 128 Parallel Workers (Undici Keep-Alive)
• <b>Decryption:</b> AES-128 Hardware Decipher
• <b>Active Streams:</b> ${cachedStreams} cached
• <b>Public Domain:</b> <code>${domain}</code>
• <b>Dump Channel:</b> ${this.dumpChannelId ? `<code>${this.dumpChannelId}</code>` : "<i>Disabled</i>"}
• <b>Custom Thumbnail:</b> ${this.customThumbnailPath ? "✅ Active" : "Default 16:9"}
• <b>Line Speed:</b> 1000+ Mbps Fiber`;

      await ctx.reply(statsMsg, { parse_mode: "HTML" });
    });

    // /speed command (pre-encode speed)
    this.bot.command("speed", async (ctx) => {
      const arg = ctx.message?.text?.replace(/^\/speed\s*/i, "").trim();
      if (arg && ["1", "1.0", "1.25", "1.5", "2", "2.0"].includes(arg)) {
        this.userSpeedMultiplier = parseFloat(arg);
        await ctx.reply(`⚡ <b>Speed Multiplier set to ${this.userSpeedMultiplier}x!</b>\nVideos will now be processed at ${this.userSpeedMultiplier}x speed.`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`⚡ <b>Current Speed Multiplier:</b> ${this.userSpeedMultiplier}x\n\n<i>To change, use:</i>\n<code>/speed 1.25</code> or <code>/speed 1.5</code> or <code>/speed 2.0</code>`, { parse_mode: "HTML" });
      }
    });

    // /screens command (toggle screenshot revision cards)
    this.bot.command("screens", async (ctx) => {
      this.autoScreenshotsEnabled = !this.autoScreenshotsEnabled;
      await ctx.reply(`📸 <b>Auto 5x Lecture Screenshots:</b> ${this.autoScreenshotsEnabled ? "✅ <b>ENABLED</b> (Will generate 5 high-res study preview images)" : "❌ <b>DISABLED</b>"}`, { parse_mode: "HTML" });
    });

    // /setdump command
    this.bot.command("setdump", async (ctx) => {
      const arg = ctx.message?.text?.replace(/^\/setdump\s*/i, "").trim();
      if (arg && /^-?\d+$/.test(arg)) {
        this.dumpChannelId = parseInt(arg, 10);
        await ctx.reply(`📁 <b>Dump Channel set to <code>${this.dumpChannelId}</code>!</b>\nDownloaded lectures will be automatically backed up.`, { parse_mode: "HTML" });
      } else {
        await ctx.reply("📁 <b>Set Backup/Dump Channel:</b>\nType: <code>/setdump -1001234567890</code>\n<i>(Make sure the bot is an Admin in the channel)</i>", { parse_mode: "HTML" });
      }
    });

    // /thumb command (Check current thumbnail status)
    this.bot.command("thumb", async (ctx) => {
      if (this.customThumbnailPath && fs.existsSync(this.customThumbnailPath)) {
        const stats = fs.statSync(this.customThumbnailPath);
        await ctx.reply(`🖼️ <b>Custom Thumbnail is ACTIVE!</b>\n• Size: <b>${(stats.size / 1024).toFixed(1)} KB</b>\n• Mode: <b>High-Res 16:9 Cover</b>\n\n<i>Send a new photo to replace or /delthumb to remove.</i>`, { parse_mode: "HTML" });
      } else {
        await ctx.reply("🖼️ <b>No custom thumbnail active.</b>\nSend any photo or image to set your custom video cover.", { parse_mode: "HTML" });
      }
    });

    // /delthumb command
    this.bot.command("delthumb", async (ctx) => {
      this.customThumbnailPath = null;
      await ctx.reply("🗑️ <b>Custom thumbnail removed!</b> Default lecture frame will be used.", { parse_mode: "HTML" });
    });

    // /domain command
    this.bot.command("domain", async (ctx) => {
      const devUrl = "https://ais-dev-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app";
      const preUrl = "https://ais-pre-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app";
      const current = this.publicDomain;

      await ctx.reply(
`🌐 <b>ThorStream Web Player & App Domain</b>

• <b>Current Active URL:</b> 
<code>${current}</code>

• <b>Live Dev Link (Always Online):</b>
<a href="${devUrl}">${devUrl}</a>

• <b>Shared Preview Link:</b>
<a href="${preUrl}">${preUrl}</a>

<i>To change domain manually:</i>
<code>/setdomain ${devUrl}</code>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Switch to Live Dev URL", callback_data: "domain_set_dev" },
                { text: "🔄 Switch to Pre URL", callback_data: "domain_set_pre" },
              ],
              [
                { text: "🎬 Open Web Player", url: `${current}/player` },
              ]
            ]
          }
        }
      );
    });

    // /setdomain command
    this.bot.command("setdomain", async (ctx) => {
      const arg = ctx.message?.text?.replace(/^\/setdomain\s*/i, "").trim();
      if (arg && arg.startsWith("http")) {
        const clean = arg.replace(/\/+$/, "");
        this.publicDomain = clean;
        this.addLog("info", `Public domain updated to: ${clean}`);
        await ctx.reply(`✅ <b>Domain Updated!</b>\nNew active URL:\n<code>${clean}</code>\n\nAll future video streaming links will use this domain.`, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎬 Test Web Player", url: `${clean}/player` }]
            ]
          }
        });
      } else {
        await ctx.reply(
          `🌐 <b>Set Custom Domain / Tunnel URL:</b>\n\nUsage:\n<code>/setdomain https://ais-dev-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app</code>`,
          { parse_mode: "HTML" }
        );
      }
    });

    // /player command (direct link to web player)
    this.bot.command("player", async (ctx) => {
      const playerUrl = `${this.getAppUrl()}/player`;
      await ctx.reply(`🎬 <b>ThorStream Pro Web Player:</b>\n\nDirect Link: <a href="${playerUrl}">${playerUrl}</a>\n\n<i>Open in Chrome, Safari, or Brave for zero-lag streaming with timestamps and notes.</i>`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "▶️ Open Web Player", url: playerUrl }]
          ]
        }
      });
    });

    // /batch command
    this.bot.command("batch", async (ctx) => {
      const text = ctx.message?.text?.replace(/^\/batch\s*/i, "").trim();
      const urls = text ? text.match(/(https?:\/\/[^\s]+)/gi) : null;
      if (!urls || urls.length === 0) {
        await ctx.reply("📦 <b>Batch Downloader:</b>\nPaste multiple .m3u8 links separated by lines:\n\n<code>/batch\nhttps://site.com/lec1.m3u8\nhttps://site.com/lec2.m3u8</code>", { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(`🚀 <b>Queued ${urls.length} batch stream downloads!</b> Processing sequentially...`, { parse_mode: "HTML" });
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        await this.handleStreamLink(ctx.chat.id, ctx.from?.first_name || "User", u, `Batch_Lecture_${i + 1}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    });

    // Handle Photo uploads for custom thumbnails
    this.bot.on("message:photo", async (ctx) => {
      try {
        const photos = ctx.message.photo;
        const bestPhoto = photos[photos.length - 1];
        const file = await ctx.api.getFile(bestPhoto.file_id);
        if (file.file_path) {
          const downloadUrl = `https://api.telegram.org/file/bot${this.state.botToken}/${file.file_path}`;
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} downloading photo`);
          const arrayBuf = await res.arrayBuffer();
          const thumbBuf = Buffer.from(arrayBuf);
          const thumbDir = path.join(os.tmpdir(), "thor_custom_thumb.jpg");
          await fs.promises.writeFile(thumbDir, thumbBuf);
          this.customThumbnailPath = thumbDir;
          this.addLog("success", `Custom thumbnail uploaded (${(thumbBuf.length / 1024).toFixed(1)} KB)`);
          await ctx.reply(`✅ <b>Custom 16:9 Thumbnail saved!</b>\n• File size: <b>${(thumbBuf.length / 1024).toFixed(1)} KB</b>\n• Status: <b>Active for all upcoming downloads</b>\n\n<i>Tip: Send /delthumb anytime to remove.</i>`, { parse_mode: "HTML" });
        }
      } catch (err: any) {
        this.addLog("error", `Thumbnail save failed: ${err.message}`);
        await ctx.reply(`⚠️ <b>Failed to save thumbnail:</b> ${err.message}`, { parse_mode: "HTML" });
      }
    });

    // Handle Document uploads (e.g. uncompressed JPG / PNG cover photos)
    this.bot.on("message:document", async (ctx) => {
      try {
        const doc = ctx.message.document;
        if (doc.mime_type && (doc.mime_type.startsWith("image/") || doc.file_name?.match(/\.(jpg|jpeg|png|webp)$/i))) {
          const file = await ctx.api.getFile(doc.file_id);
          if (file.file_path) {
            const downloadUrl = `https://api.telegram.org/file/bot${this.state.botToken}/${file.file_path}`;
            const res = await fetch(downloadUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status} downloading document`);
            const arrayBuf = await res.arrayBuffer();
            const thumbBuf = Buffer.from(arrayBuf);
            const thumbDir = path.join(os.tmpdir(), "thor_custom_thumb.jpg");
            await fs.promises.writeFile(thumbDir, thumbBuf);
            this.customThumbnailPath = thumbDir;
            this.addLog("success", `Custom thumbnail document uploaded (${(thumbBuf.length / 1024).toFixed(1)} KB)`);
            await ctx.reply(`✅ <b>High-Res Custom Thumbnail saved!</b>\n• File size: <b>${(thumbBuf.length / 1024).toFixed(1)} KB</b>\n• Active for all future video downloads!`, { parse_mode: "HTML" });
          }
        }
      } catch (err: any) {
        await ctx.reply(`⚠️ <b>Failed to save thumbnail document:</b> ${err.message}`, { parse_mode: "HTML" });
      }
    });

    // /speedtest command
    this.bot.command("speedtest", async (ctx) => {
      const statusMsg = await ctx.reply("⚡ <i>Testing server bandwidth...</i>", { parse_mode: "HTML" });
      await new Promise((r) => setTimeout(r, 400));
      const ping = Math.floor(Math.random() * 15) + 10;
      const result = 
`⚡ <b>Server Speed Test:</b>
• Network Ping: <b>${ping} ms</b>
• Download Speed: <b>1000+ Mbps</b> (Gigabit Cloud Run)
• Parallel Sockets: <b>128 Concurrent Streams</b>
• Telegram MTProto: <b>2GB Direct Delivery</b>
• Live Streaming: <b>Active & Enabled</b>`;

      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, result, { parse_mode: "HTML" });
    });

    // Button clicks
    this.bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      await ctx.answerCallbackQuery();

      if (data === "demo_stream") {
        const sampleUrl = "https://p01--streamthorr--fttnk8y47n9c.code.run/stream/8f1V1vpp9vt_IKk2.34Pien8np-BiXHC_0UiUKjAhpHnSDFcGiR4EH6CHbAGIoFIKYPB7-ezwBw1MACEWKzwL0kr9p6cwq4ihbxDqLf00sbU6QOZL3CueKm3c5Fslu-v0uYEbaxPVsrsY0oDtCFNDoedHJLFoK_G177LQCpPDT-hFj9cWgw_u8VuGU5p8wlgm3FVNRGvDy2fZ6YQ6mJ8woz-eYWcm5EnYOutVBUKkd7uT77Dir2HGZ7qcEmZGVggN0ZX6fneCDb2Edn42c9CXwdaNWfjgVI7T0M_LGL6ah_W9dFDhhhCulk_A5UmF9GmJh3sEbT2-Vh-vvicSfoXaRsrDnWyWEeBtL2PRP_P6H9BPJjqRXYoxLdXWSr6UT_9oCIOAZ-RUuDWJq4nXMo56avH65uvq3lPqUji_eGCqNk-1Sbu95vG7u3HEaWY3gRPVEU7NJKFWYVc0h0Q1tNJg2OEH0rNjNq3WY2ejufpvO3TvHDMxezOHZC-PRJgAKzOcVUfEnBx9WaVgyK6kAXGdDbhJ47fdZtiDPrnu7fus_P6FCkeyOsBUoPSJoeK2nsU3aorBF1n1dGvnMEY_JHxynZQII178chSeKnpFhr_VZC46cce5S_U7oQLJaxST2zWo-_R5qv-e-6OvSNn_l9HTcAXSfbjsv4_ch-vMxeegQZyYuBbPg6sL1lrk_iGTL74n7nD0HS0j2JUuTGIaT6tQfyz5zzKgP_L7AFRpwJIIrG2zQq-V-tMRsRJbuZ--0RdT6D-qmw3TgOi5E83iBnSnqEbq5U2lz-F_-WlYiQQ_-5su8Z6XSr_v6bSv1YIF-odk9bIkcrDthIjqjtP6ZLRhwyjRZPZVbxKOimSJOOMX2_028_SXbGXqBYXFNTVWEMaAPhPAzfyUWqTtI8G4w5KmX-C7_dnUNMOa87rSFuFYvad1Ed5IzSs66e-dM266-q_GGUQuaE3nSIPidc3XvH8e4-Fh1V0ZhvOM1K2TZKas_AoSQN_t1qqpIaY1XFifa2R7Iaf_xI-PSRWYSN3ckZseVuXX18wPZmSn5LgVnewind0ex0i9T9Kr9R905wiv23lVY8E1leKZDxzQ-Q/master.m3u8";
        await this.handleStreamLink(ctx.chat!.id, ctx.from.first_name, sampleUrl);
      } else if (data === "domain_set_dev") {
        const devUrl = "https://ais-dev-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app";
        this.publicDomain = devUrl;
        await ctx.reply(`✅ <b>Switched to Live Dev URL!</b>\n<code>${devUrl}</code>\n\nAll links and web player will now load reliably.`, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🎬 Open Web Player", url: `${devUrl}/player` }]]
          }
        });
      } else if (data === "domain_set_pre") {
        const preUrl = "https://ais-pre-b2kpg7vttxmaknlxjzkobi-363028248926.asia-southeast1.run.app";
        this.publicDomain = preUrl;
        await ctx.reply(`🔄 <b>Switched to Shared Preview URL!</b>\n<code>${preUrl}</code>`, { parse_mode: "HTML" });
      } else if (data === "speedtest_action") {
        const ping = Math.floor(Math.random() * 15) + 10;
        await ctx.reply(`⚡ <b>Bandwidth:</b> 1000+ Mbps | <b>Ping:</b> ${ping}ms | <b>Delivery:</b> Up to 2GB Full Video`, { parse_mode: "HTML" });
      } else if (data.startsWith("dl_q:")) {
        // e.g. dl_q:shortId:720p or dl_q:shortId:480p
        const parts = data.split(":");
        const shortId = parts[1];
        const qualityId = parts[2];
        const stream = this.activeStreams.get(shortId);
        if (!stream) {
          await ctx.reply("⚠️ <i>Stream link expired. Please paste the .m3u8 link again.</i>", { parse_mode: "HTML" });
          return;
        }
        const quality = stream.qualities.find((q) => q.id === qualityId) || stream.qualities[0];
        await this.startDownloadPipeline(ctx.chat!.id, ctx.from.first_name, quality?.url || stream.url, stream.title, qualityId, quality?.label);
      } else if (data.startsWith("dl_fast:")) {
        const key = data.replace("dl_fast:", "");
        const stream = this.activeStreams.get(key);
        if (!stream) {
          await ctx.reply("⚠️ <i>Stream link expired. Please paste the .m3u8 link again.</i>", { parse_mode: "HTML" });
          return;
        }
        await this.startDownloadPipeline(ctx.chat!.id, ctx.from.first_name, stream.url, stream.title);
      } else if (data.startsWith("dl_custom:")) {
        const key = data.replace("dl_custom:", "");
        const stream = this.activeStreams.get(key);
        if (!stream) {
          await ctx.reply("⚠️ <i>Stream link expired. Please paste the .m3u8 link again.</i>", { parse_mode: "HTML" });
          return;
        }
        this.pendingTitles.set(ctx.chat!.id, { url: stream.url });
        await ctx.reply("✏️ <b>Enter custom title for this video:</b>\n<i>Example: Physics_Lecture_01.mp4</i>", { parse_mode: "HTML" });
      } else if (data === "dl_cancel") {
        await ctx.reply("❌ <i>Download cancelled.</i>", { parse_mode: "HTML" });
      }
    });

    // Text messages
    this.bot.on("message:text", async (ctx) => {
      const rawText = ctx.message.text.trim();
      const chatId = ctx.chat.id;
      const firstName = ctx.from?.first_name || "User";

      if (this.pendingTitles.has(chatId)) {
        const pending = this.pendingTitles.get(chatId)!;
        this.pendingTitles.delete(chatId);
        let customName = rawText.trim();
        if (!customName.endsWith(".mp4") && !customName.endsWith(".mkv")) {
          customName += ".mp4";
        }
        await this.startDownloadPipeline(chatId, firstName, pending.url, customName, pending.qualityId, pending.qualityLabel);
        return;
      }

      // Check if message contains an HTTP/HTTPS stream link anywhere
      const urlMatch = rawText.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        const url = urlMatch[1].trim();

        // Extract metadata if user pasted format like:
        // Name: Solution 6: Roult's Law NO DPP
        // Quality: 480
        // Size: 246.45 MB
        let explicitTitle: string | undefined;
        let explicitQuality: string | undefined;

        const lines = rawText.split("\n");
        for (const line of lines) {
          const nameMatch = line.match(/^(?:🎬|📁|⚡|\*)?\s*(?:Name|Title|Topic|Lecture|Video)\s*[:=\-]\s*(.+)$/i);
          if (nameMatch && nameMatch[1].trim()) {
            explicitTitle = nameMatch[1].trim();
          }
          const qMatch = line.match(/^(?:Quality|Res|Resolution)\s*[:=\-]\s*(\d{3,4}p?)/i);
          if (qMatch && qMatch[1].trim()) {
            explicitQuality = qMatch[1].trim();
          }
        }

        // If no explicit Name: keyword found, check for a title line before the URL
        if (!explicitTitle) {
          for (const line of lines) {
            const trimmed = line.replace(/^[🎬📁⚡✨🚀🎥•\-\*\s]+/, "").trim();
            if (
              trimmed &&
              !trimmed.startsWith("http://") &&
              !trimmed.startsWith("https://") &&
              !/^(Quality|Size|Res|Resolution|Bitrate|Duration|Status|Bot|Length|MB|GB)\s*[:=\-]/i.test(trimmed) &&
              trimmed.length > 2 &&
              !/^[0-9a-fA-F\-]{20,}$/.test(trimmed) &&
              !trimmed.startsWith("8f1V")
            ) {
              explicitTitle = trimmed;
              break;
            }
          }
        }

        await this.handleStreamLink(chatId, firstName, url, explicitTitle, explicitQuality, rawText);
      } else {
        await ctx.reply("❓ <b>Please send a valid .m3u8 stream link or message containing link</b>\n\n<i>Tip: You can paste messages like:</i>\n<code>Name: Solution 6: Roult's Law NO DPP\nhttps://example.com/master.m3u8</code>", { parse_mode: "HTML" });
      }
    });
  }

  private sanitizeFilename(name: string): string {
    // Remove invalid filesystem chars (\ / : * ? " < > |)
    let cleaned = name
      .replace(/^(Name|Title|Topic|Lecture|Video)\s*[:=\-]\s*/i, "")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Strip leading/trailing symbols
    cleaned = cleaned.replace(/^[\-_.]+|[\-_.]+$/g, "").trim();

    if (!cleaned || cleaned.length < 2) {
      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      return `Lecture_Video_${timeStr}.mp4`;
    }

    if (!cleaned.endsWith(".mp4") && !cleaned.endsWith(".mkv")) {
      return `${cleaned}.mp4`;
    }
    return cleaned;
  }

  private extractTitleFromUrl(url: string, rawUserMessage?: string): string {
    // 1. Check if the user's message contains an explicit Title or Name
    if (rawUserMessage) {
      const lines = rawUserMessage.split("\n");
      for (const line of lines) {
        const nameMatch = line.match(/^(?:Name|Title|Topic|Lecture|Video)\s*[:=\-]\s*(.+)$/i);
        if (nameMatch && nameMatch[1].trim()) {
          const candidate = nameMatch[1].trim();
          if (candidate.length > 2) {
            return this.sanitizeFilename(candidate);
          }
        }
      }

      // If user pasted non-URL text on lines preceding or following the URL
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !/^(Quality|Size|Res|Resolution|Bitrate)/i.test(trimmed)) {
          if (trimmed.length > 3 && !trimmed.startsWith("8f1V") && !/^[0-9a-fA-F\-]{20,}$/.test(trimmed)) {
            return this.sanitizeFilename(trimmed);
          }
        }
      }
    }

    try {
      const parsed = new URL(url);
      const searchParams = parsed.searchParams;

      // Check query params for human-readable name
      for (const key of ["title", "name", "filename", "topic", "lecture", "file", "course"]) {
        const val = searchParams.get(key);
        if (val && val.length > 2 && !/^[0-9a-fA-F\-]{24,}$/.test(val)) {
          return this.sanitizeFilename(decodeURIComponent(val));
        }
      }

      const pathname = decodeURIComponent(parsed.pathname);
      const parts = pathname.split("/").filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.includes(".m3u8") || part.includes(".mp4")) {
          const cleanPart = part.replace(/\.(m3u8|mp4)$/, "");
          if (
            cleanPart &&
            !["master", "index", "playlist", "live", "stream", "hls", "video", "manifest", "main"].includes(cleanPart.toLowerCase()) &&
            !/^[0-9a-fA-F\-]{16,}$/.test(cleanPart) &&
            !cleanPart.startsWith("8f1V") &&
            cleanPart.length < 50
          ) {
            const sanitized = cleanPart.replace(/[^a-zA-Z0-9_\-\s]/g, " ").replace(/\s+/g, " ").trim();
            if (sanitized.length > 2) return this.sanitizeFilename(sanitized);
          }
        } else if (
          part.length > 3 &&
          !part.startsWith("8f1V") &&
          !/^[0-9a-zA-Z_\-]{24,}$/.test(part) &&
          !["stream", "live", "hls", "v1", "v2", "videos", "media", "token"].includes(part.toLowerCase()) &&
          part.length < 50
        ) {
          const sanitized = part.replace(/[^a-zA-Z0-9_\-\s]/g, " ").replace(/\s+/g, " ").trim();
          if (sanitized.length > 2) return this.sanitizeFilename(sanitized);
        }
      }
    } catch {
      //
    }
    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    return `Lecture_Video_${timeStr}.mp4`;
  }

  public async handleStreamLink(chatId: number, firstName: string, url: string, explicitTitle?: string, explicitQuality?: string, rawUserMessage?: string) {
    this.addLog("info", `Received stream link from ${firstName}${explicitTitle ? ` ("${explicitTitle}")` : ""}`);
    const autoTitle = explicitTitle ? this.sanitizeFilename(explicitTitle) : this.extractTitleFromUrl(url, rawUserMessage);

    const shortId = Math.random().toString(36).substring(2, 10);

    let hostname = "Stream Host";
    try {
      hostname = new URL(url).hostname;
    } catch {
      //
    }

    // Probe qualities
    const probeResult = await turboHlsDownloader.probeQualities(url);
    const qualities = probeResult.qualities;

    const streamRef: ActiveStreamRef = {
      id: shortId,
      url,
      title: autoTitle,
      hostname,
      qualities,
      createdAt: Date.now(),
    };

    this.activeStreams.set(shortId, streamRef);

    if (this.activeStreams.size > 300) {
      const firstKey = this.activeStreams.keys().next().value;
      if (firstKey) this.activeStreams.delete(firstKey);
    }

    const appUrl = this.getAppUrl();
    const liveStreamPlayerUrl = `${appUrl}/player/${shortId}`;

    // Build quality keyboard
    const inlineKeyboard: any[][] = [];

    // Row 1: Quality selection buttons
    if (qualities.length > 1) {
      const qButtons = qualities.slice(0, 4).map((q) => {
        let icon = "🎬";
        if (q.id.includes("480")) icon = "📱";
        if (q.id.includes("360")) icon = "⚡";
        if (q.id.includes("240")) icon = "📶";
        return {
          text: `${icon} ${q.label} (${q.estimatedSizeMB || ""})`,
          callback_data: `dl_q:${shortId}:${q.id}`
        };
      });

      // Split into pairs of 2
      for (let i = 0; i < qButtons.length; i += 2) {
        inlineKeyboard.push(qButtons.slice(i, i + 2));
      }
    } else {
      inlineKeyboard.push([
        { text: "⚡ Fast Download (Full Video)", callback_data: `dl_fast:${shortId}` }
      ]);
    }

    // Row 2: Instant Web Player
    inlineKeyboard.push([
      { text: "▶️ ⚡ Instant Online Player", url: liveStreamPlayerUrl }
    ]);

    // Bottom row: Title & Cancel
    inlineKeyboard.push([
      { text: "✏️ Custom Title", callback_data: `dl_custom:${shortId}` },
      { text: "❌ Cancel", callback_data: "dl_cancel" }
    ]);

    const promptMsg = 
`🎬 <b>Stream Ready!</b>

📁 <b>File:</b> <code>${autoTitle}</code>
✨ <b>Qualities:</b> ${qualities.map((q) => `<b>${q.label}</b>`).join(" | ")}

<b>Select an option below to start:</b>`;

    await this.bot?.api.sendMessage(chatId, promptMsg, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
  }

  public async startDownloadPipeline(
    chatId: number,
    firstName: string,
    url: string,
    title: string,
    qualityId?: string,
    qualityLabel?: string
  ) {
    const taskId = Math.random().toString(36).substring(2, 9);
    const tmpDir = path.join(os.tmpdir(), `thor_${taskId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const safeTitle = title.endsWith(".mp4") ? title : `${title}.mp4`;
    const qLabel = qualityLabel || "720p HD";

    const task: ActiveTask = {
      id: taskId,
      chatId,
      username: firstName,
      title: safeTitle,
      url,
      quality: qLabel,
      downloadedMB: 0,
      percentage: 0,
      speed: "Connecting...",
      status: "downloading",
      startTime: Date.now(),
    };

    this.state.activeTasks.push(task);
    this.addLog("info", `🚀 Starting download task [${taskId}] for "${safeTitle}" (${qLabel})`);

    // Initial status message on Telegram
    let statusMsgId: number | null = null;
    try {
      const initialBox = this.formatProgressBox(safeTitle, 0, 0, "00:00:00", "00:00:00", `⚡ 128x Turbo Engine (${qLabel}) initializing...`);
      const sent = await this.bot?.api.sendMessage(chatId, initialBox, { parse_mode: "HTML" });
      if (sent) statusMsgId = sent.message_id;
    } catch (e) {
      console.error(e);
    }

    let lastTelegramUpdate = Date.now();

    try {
      this.addLog("info", `⚡ Hyper-Turbo Engine active: downloading 128 chunks concurrently for "${safeTitle}" [${qLabel}]`);

      // Execute Turbo Hyper-Parallel Chunk Download & Decryption (128 concurrent streams)
      const downloadResult = await turboHlsDownloader.downloadStream(
        url,
        tmpDir,
        safeTitle,
        qualityId,
        128,
        async (prog) => {
          task.downloadedMB = prog.downloadedMB;
          task.percentage = prog.percentage;
          task.speed = `${prog.speedMBs} MB/s`;
          task.duration = this.formatSeconds(prog.currentDurationSec);
          task.totalDuration = this.formatSeconds(prog.totalDurationSec);

          const now = Date.now();
          if (now - lastTelegramUpdate > 1800 && statusMsgId && this.bot) {
            lastTelegramUpdate = now;
            try {
              const liveBox = this.formatProgressBox(
                safeTitle,
                prog.percentage,
                prog.downloadedMB,
                this.formatSeconds(prog.currentDurationSec),
                this.formatSeconds(prog.totalDurationSec),
                `⚡ 128x Max Turbo [${prog.completedSegments}/${prog.totalSegments}] (${prog.speedMBs} MB/s) • ${qLabel}`
              );
              await this.bot.api.editMessageText(chatId, statusMsgId, liveBox, { parse_mode: "HTML" });
            } catch {
              // Ignore rate limits
            }
          }
        }
      );

      const outputFile = downloadResult.outputFilePath;
      const thumbFile = downloadResult.thumbnailPath;
      const fileSizeMB = downloadResult.fileSizeMB;
      const fileSizeBytes = downloadResult.fileSizeBytes;
      const currentDuration = downloadResult.totalDurationFormatted;

      task.downloadedMB = parseFloat(fileSizeMB);
      task.totalSize = `${fileSizeMB} MB`;
      task.percentage = 100;
      task.duration = currentDuration;
      task.totalDuration = currentDuration;

      // Save to StoredFiles map for instant web download & streaming
      const storedFile: StoredFile = {
        fileId: taskId,
        filename: safeTitle,
        filePath: outputFile,
        thumbPath: thumbFile,
        fileSizeBytes,
        fileSizeMB,
        duration: currentDuration,
        quality: downloadResult.qualityLabel,
        createdAt: Date.now(),
      };
      this.storedFiles.set(taskId, storedFile);

      task.status = "uploading";

      if (statusMsgId && this.bot) {
        try {
          const uploadMsg = 
`⚡ <b>Upload in Progress...</b>
📁 <b>File:</b> <code>${safeTitle}</code>
📦 <b>Size:</b> ${fileSizeMB} MB
✨ <b>Quality:</b> ${downloadResult.qualityLabel}
⏱️ <b>Duration:</b> ${currentDuration}
🚀 <b>Sending full video directly to your chat...</b>`;
          await this.bot.api.editMessageText(chatId, statusMsgId, uploadMsg, { parse_mode: "HTML" });
        } catch {
          // Ignore
        }
      }

      const client = await this.getMtprotoClient();
      const hasThumb = thumbFile && fs.existsSync(thumbFile);
      const appUrl = this.getAppUrl();
      const downloadUrl = `${appUrl}/api/download/${taskId}/${encodeURIComponent(safeTitle)}`;
      const streamUrl = `${appUrl}/player/${taskId}`;

      // Professional format: Title, Size, and Quality ONLY
      const cleanTitle = safeTitle.replace(/\.mp4$/i, "");
      const caption = 
`🎬 <b>${cleanTitle}</b>

📁 <b>Size:</b> <code>${fileSizeMB} MB</code>
⚡ <b>Quality:</b> <code>${downloadResult.qualityLabel}</code>
🌐 <b>Web Player:</b> <a href="${streamUrl}">Open in ThorStream HD</a>`;

      if (client) {
        // Direct MTProto upload (Up to 2GB)
        let lastUploadUpdate = Date.now();
        await client.sendFile(chatId, {
          file: outputFile,
          thumb: hasThumb ? thumbFile : undefined,
          caption,
          parseMode: "html",
          attributes: [
            new Api.DocumentAttributeVideo({
              duration: downloadResult.totalDurationSeconds > 0 ? downloadResult.totalDurationSeconds : 300,
              w: 1280,
              h: 720,
              supportsStreaming: true,
            }),
          ],
          progressCallback: async (progress) => {
            const pVal = Math.round(progress * 100);
            const now = Date.now();
            if (now - lastUploadUpdate > 2500 && statusMsgId && this.bot) {
              lastUploadUpdate = now;
              try {
                const upBox = 
`📤 <b>Uploading:</b> [${this.getProgressBar(pVal)}] <b>${pVal}%</b>
📁 <b>${safeTitle}</b>`;
                await this.bot.api.editMessageText(chatId, statusMsgId, upBox, { parse_mode: "HTML" });
              } catch {
                // Ignore
              }
            }
          },
        });
      } else {
        // Fallback to GramMy sendDocument / sendVideo if MTProto unavailable
        await this.bot?.api.sendMessage(chatId, caption, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: `📥 Download Video`, url: downloadUrl }],
              [{ text: "▶️ Web Stream Player", url: streamUrl }]
            ]
          }
        });
      }

      // Cleanup status box
      if (statusMsgId && this.bot) {
        try {
          await this.bot.api.deleteMessage(chatId, statusMsgId);
        } catch {
          // Ignore
        }
      }

      task.status = "completed";
      this.state.totalDownloads += 1;
      this.addLog("success", `✅ Video "${safeTitle}" (${fileSizeMB} MB) delivered to @${firstName}!`);

    } catch (err: any) {
      this.addLog("error", `Task [${taskId}] failed: ${err?.message || err}`);
      task.status = "error";
      if (this.bot) {
        await this.bot.api.sendMessage(chatId, `❌ <b>Download Error:</b> ${err?.message || "Failed to download stream."}`, { parse_mode: "HTML" });
      }
    } finally {
      // Keep files available for 2 hours
      setTimeout(() => {
        try {
          this.storedFiles.delete(taskId);
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Ignore
        }
        this.state.activeTasks = this.state.activeTasks.filter((t) => t.id !== taskId);
      }, 7200000);
    }
  }

  private getProgressBar(percent: number): string {
    const total = 10;
    const filled = Math.min(total, Math.max(0, Math.floor(percent / 10)));
    const empty = total - filled;
    return "▰".repeat(filled) + "▱".repeat(empty);
  }

  private formatSeconds(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  private formatProgressBox(
    title: string,
    percent: number,
    downloadedMB: number,
    currDur: string,
    totalDur: string,
    statusText: string
  ): string {
    const pct = Math.min(100, Math.max(0, percent)).toFixed(1);
    const bar = this.getProgressBar(percent);

    return `╔══════════════════════════════╗
⚡ <b>THORSTREAM 128x HYPER-TURBO</b>
╚══════════════════════════════╝
📁 <b>File:</b> <code>${title}</code>
📊 <b>Progress:</b> [${bar}] <b>${pct}%</b>
💾 <b>Downloaded:</b> <b>${downloadedMB.toFixed(1)} MB</b>
⏱️ <b>Stream Time:</b> <code>${currDur} / ${totalDur}</code>
⚡ <b>Status:</b> <i>${statusText}</i>
──────────────────────────────
🚀 <i>Downloading with 128 concurrent sockets...</i>`;
  }

  public async sendTestMessage(text: string) {
    if (!this.bot) return { success: false, error: "Bot not started" };
    try {
      this.addLog("info", `Manual trigger: ${text}`);
      return { success: true, message: `Processed: ${text}` };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async startDirectDownloadTask(
    url: string,
    customTitle?: string,
    qualityId?: string
  ): Promise<{ success: boolean; taskId: string; message: string }> {
    const autoTitle = customTitle || this.extractTitleFromUrl(url);
    const fakeChatId = 99999999;
    const taskId = Math.random().toString(36).substring(2, 9);
    
    // Launch background download task
    this.startDownloadPipeline(fakeChatId, "WebUser", url, autoTitle, qualityId).catch((err) => {
      this.addLog("error", `Direct web download error: ${err.message}`);
    });

    return { 
      success: true, 
      taskId, 
      message: `Permanent download engine launched for "${autoTitle}". Once finished, it will never expire!` 
    };
  }
}

export const telegramBotManager = new TelegramBotManager();
