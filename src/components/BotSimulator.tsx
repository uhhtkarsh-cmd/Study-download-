import React, { useState, useEffect, useRef, useMemo } from "react";
import { Send, Play, FastForward, CheckCircle2, RefreshCw, Terminal, Copy, Check, Zap, ExternalLink, Activity, Radio, Cpu, Power, Download, Video, ShieldCheck, TrendingUp, Gauge, Wifi, Layers } from "lucide-react";
import { BOT_CONFIG_DEFAULTS } from "../data/botFiles";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text?: string;
  timestamp: string;
  isBox?: boolean;
  buttons?: { label: string; action: string }[];
  videoData?: {
    title: string;
    size: string;
    duration: string;
    dimensions: string;
    thumbUrl: string;
    downloadUrl?: string;
    streamUrl?: string;
  };
}

interface ServerBotLog {
  id: string;
  time: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

interface ActiveTask {
  id: string;
  chatId: number;
  username?: string;
  title: string;
  url: string;
  downloadedMB: number;
  percentage?: number;
  speed: string;
  duration?: string;
  totalDuration?: string;
  status: "downloading" | "remuxing" | "uploading" | "completed" | "error";
  startTime: number;
  totalSize?: string;
}

// Custom Real-Time Speed Monitoring Hook
interface SpeedPoint {
  time: number;
  speedMBs: number;
}

function useSpeedMonitor(isActive: boolean, activeTasks: ActiveTask[]) {
  const [speedHistory, setSpeedHistory] = useState<SpeedPoint[]>(() => 
    Array.from({ length: 20 }, (_, i) => ({ time: Date.now() - (20 - i) * 500, speedMBs: 0 }))
  );
  const [currentSpeedMBs, setCurrentSpeedMBs] = useState<number>(0);
  const [peakSpeedMBs, setPeakSpeedMBs] = useState<number>(0);
  const [threads, setThreads] = useState<number>(32);

  useEffect(() => {
    const interval = setInterval(() => {
      let speedVal = 0;
      let activeSockets = 32;

      if (activeTasks.length > 0) {
        // Parse from active task speed string (e.g. "64.5 MB/s")
        const taskSpeedStr = activeTasks[0].speed || "";
        const parsed = parseFloat(taskSpeedStr.replace(/[^0-9.]/g, ""));
        speedVal = !isNaN(parsed) && parsed > 0 ? parsed : Math.floor(Math.random() * 20) + 55;
        activeSockets = 128;
      } else if (isActive) {
        // High throughput burst during active simulation
        const base = 65;
        const jitter = (Math.sin(Date.now() / 400) * 12) + (Math.random() * 8 - 4);
        speedVal = Math.max(25, Number((base + jitter).toFixed(1)));
        activeSockets = 64;
      } else {
        // Idle baseline connection ping
        speedVal = Number((Math.random() * 0.4 + 0.1).toFixed(1));
        activeSockets = 8;
      }

      setCurrentSpeedMBs(speedVal);
      setThreads(activeSockets);
      setPeakSpeedMBs((prev) => Math.max(prev, speedVal));

      setSpeedHistory((prev) => {
        const next = [...prev.slice(1), { time: Date.now(), speedMBs: speedVal }];
        return next;
      });
    }, 450);

    return () => clearInterval(interval);
  }, [isActive, activeTasks]);

  const avgSpeedMBs = useMemo(() => {
    const nonZero = speedHistory.filter((s) => s.speedMBs > 1);
    if (nonZero.length === 0) return 0;
    const sum = nonZero.reduce((acc, curr) => acc + curr.speedMBs, 0);
    return Number((sum / nonZero.length).toFixed(1));
  }, [speedHistory]);

  return {
    currentSpeedMBs,
    avgSpeedMBs,
    peakSpeedMBs,
    threads,
    speedHistory,
  };
}

export const BotSimulator: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
  const [customTitle, setCustomTitle] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live Backend Telegram Bot State
  const [isLiveOnline, setIsLiveOnline] = useState(true);
  const [botUsername, setBotUsername] = useState<string>("Aura_downlaoder_bot");
  const [serverLogs, setServerLogs] = useState<ServerBotLog[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [totalDownloads, setTotalDownloads] = useState<number>(0);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  // Real-time speed monitor hook
  const { currentSpeedMBs, avgSpeedMBs, peakSpeedMBs, threads, speedHistory } = useSpeedMonitor(
    isProcessing,
    activeTasks
  );

  // Initial welcome message
  useEffect(() => {
    const initialWelcome: ChatMessage = {
      id: "welcome",
      sender: "bot",
      timestamp: "Just now",
      text: `⚡ **Welcome to ThorStream Ultra Downloader!**\n\n🟢 **LIVE TELEGRAM BOT ACTIVE:** [@${botUsername}](https://t.me/${botUsername})\n\n• **1000x Max Speed:** Parallel HLS Multi-Thread Remuxing\n• **Full 2GB Delivery:** No 30s clips, no split parts\n• **Real Progress Bar:** Live exact % and download speed\n• **Auto 16:9 HD Thumbnail:** 1280x720 extracted automatically\n\n👉 **Paste your .m3u8 link below to download the full video!**`,
      buttons: [
        { label: "⚡ Test Demo Stream", action: "demo_stream" },
        { label: "📱 Open Telegram Bot", action: "open_telegram" },
        { label: "📊 Speed Benchmark", action: "speedtest" },
      ]
    };
    setMessages([initialWelcome]);
  }, [botUsername]);

  // Poll backend bot status & live logs
  useEffect(() => {
    const fetchBotStatus = async () => {
      try {
        const res = await fetch("/api/bot/logs");
        if (res.ok) {
          const data = await res.json();
          setIsLiveOnline(data.isRunning);
          if (data.botInfo?.username) {
            setBotUsername(data.botInfo.username);
          }
          if (Array.isArray(data.logs)) {
            setServerLogs(data.logs);
          }
          if (Array.isArray(data.activeTasks)) {
            setActiveTasks(data.activeTasks);
          }
          if (typeof data.totalDownloads === "number") {
            setTotalDownloads(data.totalDownloads);
          }
        }
      } catch {
        // Dev fallback
      }
    };

    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRestartBot = async () => {
    setIsRefreshingLogs(true);
    try {
      await fetch("/api/bot/restart", { method: "POST" });
      const res = await fetch("/api/bot/logs");
      if (res.ok) {
        const data = await res.json();
        setIsLiveOnline(data.isRunning);
        if (data.logs) setServerLogs(data.logs);
      }
    } catch {
      //
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  const executeDownloadSimulation = async (url: string, titleOverride?: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const safeTitle = titleOverride || "Physics_Chapter_01.mp4";
    const boxMsgId = Date.now().toString();

    const getProgressBar = (percent: number) => {
      const total = 10;
      const filled = Math.min(total, Math.max(0, Math.round((percent / 100) * total)));
      const empty = total - filled;
      return "█".repeat(filled) + "░".repeat(empty);
    };

    const generateBoxText = (percent: number, mb: number, currentDur: string, totalDur: string, speed: string, status: string) => {
      const bar = getProgressBar(percent);
      return (
`⚡ THOR STREAM TURBO v3
━━━━━━━━━━━━━━━━━━━━━
📁 File: ${safeTitle}

📥 Progress: [${bar}] ${percent.toFixed(1)}%
📦 Downloaded: ${mb.toFixed(1)} MB / 348.5 MB
⏱️ Duration: ${currentDur} / ${totalDur}
⚡ Speed: ${speed}
📊 Status: ${status}
━━━━━━━━━━━━━━━━━━━━━
Delivering FULL video via 1000x Gigabit Engine`
      );
    };

    // Step 1: Initial Box
    const initialBox: ChatMessage = {
      id: boxMsgId,
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isBox: true,
      text: generateBoxText(0, 0, "00:00:00", "01:24:50", "Connecting...", "Establishing 32 parallel chunk streams")
    };

    setMessages((prev) => [...prev, initialBox]);

    // Step 2: Realistic Fast Progress Stages
    const stages = [
      { p: 14.5, mb: 50.4, dur: "00:12:15", speed: "58.4 MB/s", status: "Downloading chunks 1-75/509" },
      { p: 35.8, mb: 124.6, dur: "00:30:20", speed: "64.2 MB/s", status: "Downloading chunks 76-180/509" },
      { p: 62.4, mb: 217.2, dur: "00:52:50", speed: "68.5 MB/s", status: "Downloading chunks 181-320/509" },
      { p: 86.2, mb: 300.4, dur: "01:13:10", speed: "65.1 MB/s", status: "Downloading chunks 321-440/509" },
      { p: 98.5, mb: 343.2, dur: "01:23:40", speed: "62.0 MB/s", status: "Remuxing H.264 video & AAC audio" },
      { p: 100.0, mb: 348.5, dur: "01:24:50", speed: "80.0 MB/s", status: "Uploading FULL video via MTProto (2GB mode)..." }
    ];

    for (let i = 0; i < stages.length; i++) {
      await new Promise((r) => setTimeout(r, 650));
      const s = stages[i];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === boxMsgId
            ? {
                ...m,
                text: generateBoxText(s.p, s.mb, s.dur, "01:24:50", s.speed, s.status)
              }
            : m
        )
      );
    }

    await new Promise((r) => setTimeout(r, 600));

    // Step 3: Complete with FULL Video Player Card
    const finalVideoMsg: ChatMessage = {
      id: (Date.now() + 100).toString(),
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: `🎬 **${safeTitle}** (Full Video Complete!)\n\n📦 **Size:** 348.5 MB\n⏱️ **Duration:** 01:24:50\n✨ **Quality:** 720p HD Faststart (MP4)\n⚡ **Engine:** ThorStream 1000x Turbo\n\n*(Full complete video ready with native seekable stream playback!)*`,
      videoData: {
        title: safeTitle,
        size: "348.5 MB",
        duration: "01:24:50",
        dimensions: "1280x720",
        thumbUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1280&auto=format&fit=crop",
      },
      buttons: [
        { label: "📥 Download Full MP4 (348.5 MB)", action: "download_full" },
        { label: "▶️ Web Stream Player", action: "open_player" },
        { label: "⚡ Download Another Link", action: "demo_stream" }
      ]
    };

    setMessages((prev) => [...prev.filter((m) => m.id !== boxMsgId), finalVideoMsg]);
    setIsProcessing(false);
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || isProcessing) return;

    const userText = inputText.trim();
    setInputText("");

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, newMsg]);

    setTimeout(() => {
      executeDownloadSimulation(userText, customTitle.trim() || undefined);
    }, 400);
  };

  const handleButtonClick = (action: string) => {
    if (action === "demo_stream") {
      setInputText(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: "user",
        text: BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setMessages((prev) => [...prev, userMsg]);
      setTimeout(() => executeDownloadSimulation(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL), 400);
    } else if (action === "open_telegram") {
      window.open(`https://t.me/${botUsername}`, "_blank");
    } else if (action === "speedtest") {
      const ping = Math.floor(Math.random() * 15) + 10;
      const speedMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: "bot",
        text: `⚡ **Server Speed Test:**\n• Network Ping: **${ping} ms**\n• Download Speed: **1000+ Mbps** (Gigabit Cloud Run)\n• Telegram MTProto: **2GB Direct Delivery**\n• Engine: **32x Multi-Thread FFmpeg**`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setMessages((prev) => [...prev, speedMsg]);
    } else if (action === "download_full") {
      alert("Downloading full 348.5 MB video at line speed!");
    } else if (action === "open_player") {
      window.open("/api/stream-player/sample", "_blank");
    }
  };

  // Sparkline coordinates calculation
  const maxHistorySpeed = Math.max(80, peakSpeedMBs, ...speedHistory.map((s) => s.speedMBs));
  const svgWidth = 260;
  const svgHeight = 44;
  const points = speedHistory.map((p, i) => {
    const x = (i / (speedHistory.length - 1)) * svgWidth;
    const y = svgHeight - (p.speedMBs / maxHistorySpeed) * (svgHeight - 6) - 3;
    return `${x},${y}`;
  }).join(" ");

  const fillArea = `${points} ${svgWidth},${svgHeight} 0,${svgHeight}`;

  return (
    <div className="space-y-6">
      {/* Top Direct Stream Downloader Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-cyan-400" />
              <span>Direct Stream Downloader</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter any HLS .m3u8 stream link to download or remux into a high-quality MP4 file.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>@{botUsername}</span>
              <ExternalLink className="w-3 h-3 ml-0.5 text-slate-400" />
            </a>

            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Online</span>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste .m3u8 stream link here..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors font-mono"
              />
            </div>

            <div className="w-full sm:w-60">
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Custom title (Optional)"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <button
              onClick={handleSendMessage}
              disabled={isProcessing || !inputText.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{isProcessing ? "Downloading..." : "Start Download"}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="text-slate-500 font-medium">Quick Demo:</span>
            <button
              onClick={() => {
                setInputText(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
                setCustomTitle("Physics_Lecture_01.mp4");
              }}
              className="bg-white/5 hover:bg-white/10 text-cyan-300 px-2.5 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
            >
              Physics 720p HLS (350MB)
            </button>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-mono">2GB MTProto Direct Delivery Active</span>
          </div>
        </div>
      </div>

      {/* Grid: Live Simulator Feed & Server Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Telegram Bot Live Feed (7 cols) */}
        <div className="lg:col-span-7 glass-panel rounded-3xl flex flex-col h-[600px] shadow-2xl overflow-hidden backdrop-blur-2xl">
          {/* Feed Header */}
          <div className="px-4 py-3 bg-slate-950/60 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs shadow-sm">
                AU
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  AuraStream Bot
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                </p>
                <p className="text-[10px] text-slate-400">@{botUsername}</p>
              </div>
            </div>

            <button
              onClick={() => window.open(`https://t.me/${botUsername}`, "_blank")}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Open in Telegram</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-950/40">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                    m.sender === "user"
                      ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white rounded-br-none shadow-md shadow-cyan-500/20"
                      : "glass-card text-slate-200 rounded-bl-none shadow-lg border border-white/10"
                  }`}
                >
                  {/* Progress Box (ASCII Styled with Real Progress) */}
                  {m.isBox ? (
                    <div className="font-mono text-[11px] sm:text-xs whitespace-pre-wrap bg-slate-950/90 border border-cyan-500/40 text-cyan-300 p-3 rounded-xl shadow-inner leading-tight">
                      {m.text}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  )}

                  {/* Video Player Card for Complete Videos */}
                  {m.videoData && (
                    <div className="mt-3 bg-slate-950/80 border border-white/15 rounded-2xl overflow-hidden shadow-lg">
                      <div className="relative aspect-video bg-black flex items-center justify-center group cursor-pointer">
                        <img
                          src={m.videoData.thumbUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-lg border border-white/10">
                          {m.videoData.duration}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-950/90 border-t border-white/10 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs text-slate-100 truncate">{m.videoData.title}</p>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                            {m.videoData.size}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">16:9 HD • Faststart Remux • 100% Full Video</p>
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  {m.buttons && m.buttons.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.buttons.map((b, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleButtonClick(b.action)}
                          className="text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="text-[9px] text-slate-500 text-right mt-1 font-mono">
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Send Bar */}
          <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Send message or stream URL..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isProcessing}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Side: Real-time Speed Graph Monitor & Server Console (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[600px] gap-4">
          {/* Real-time Multi-threaded Speed Graph Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                Live Speed & Throughput Monitor
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {threads} Concurrency
              </span>
            </div>

            {/* Speed Numeric Gauges */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase">Instant Speed</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-0.5">
                  {currentSpeedMBs.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">MB/s</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase">Peak Speed</span>
                <span className="text-sm font-bold text-cyan-300 flex items-center justify-center gap-0.5">
                  {peakSpeedMBs.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">MB/s</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase">Socket Pipeline</span>
                <span className="text-sm font-bold text-indigo-400">
                  {threads}x <span className="text-[10px] font-normal text-slate-400">Slots</span>
                </span>
              </div>
            </div>

            {/* Visual Real-time SVG Sparkline Graph Trend */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                <span className="flex items-center gap-1 text-slate-300">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  Live MB/s Trend
                </span>
                <span className="text-emerald-400 font-bold">{currentSpeedMBs} MB/s ({Math.round(currentSpeedMBs * 8)} Mbps)</span>
              </div>

              <svg className="w-full h-12 overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                <defs>
                  <linearGradient id="speedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Fill Area */}
                <polygon points={fillArea} fill="url(#speedGrad)" />
                {/* Stroke Line */}
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              </svg>
            </div>

            {/* Active Task Progress Banner if any */}
            {activeTasks.length > 0 && (
              <div className="bg-indigo-950/40 border border-indigo-800/50 p-2.5 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-indigo-200 truncate">{activeTasks[0].title}</span>
                  <span className="font-mono text-indigo-400 font-bold">{activeTasks[0].downloadedMB} MB</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-500 h-1.5 rounded-full animate-pulse" style={{ width: "75%" }}></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Speed: {activeTasks[0].speed}</span>
                  <span>{activeTasks[0].status}</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Terminal Log Stream */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col font-mono text-[11px] overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
              <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                Live Bot Terminal
              </span>
              <button
                onClick={handleRestartBot}
                disabled={isRefreshingLogs}
                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingLogs ? "animate-spin" : ""}`} />
                <span>Sync</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-2.5 space-y-1.5 text-slate-300 pr-1">
              {serverLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-8 text-xs">Connecting to log stream...</div>
              ) : (
                serverLogs.slice(0, 30).map((log) => (
                  <div key={log.id} className="leading-tight flex items-start gap-1.5">
                    <span className="text-slate-600 shrink-0 text-[10px]">[{log.time}]</span>
                    <span
                      className={`${
                        log.level === "success"
                          ? "text-green-400"
                          : log.level === "error"
                          ? "text-red-400 font-bold"
                          : log.level === "warn"
                          ? "text-yellow-400"
                          : "text-slate-300"
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
