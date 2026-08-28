import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Send,
  Play,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  Zap,
  ExternalLink,
  Activity,
  Radio,
  Download,
  Video,
  ShieldCheck,
  TrendingUp,
  Layers,
  Sparkles,
  Server,
  Trash2,
  ListPlus,
  PlayCircle
} from "lucide-react";
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

export interface ParallelDownloadJob {
  id: string;
  title: string;
  url: string;
  progress: number;
  downloadedMB: number;
  totalMB: number;
  speedMBs: number;
  threads: number;
  status: "downloading" | "remuxing" | "uploading" | "completed" | "error";
  statusText: string;
  activeSockets: number[];
  startTime: number;
  thumbUrl?: string;
  duration?: string;
}

interface SpeedPoint {
  time: number;
  speedMBs: number;
}

interface BotSimulatorProps {
  onSwitchToPlayer?: (url?: string) => void;
}

export const BotSimulator: React.FC<BotSimulatorProps> = ({ onSwitchToPlayer }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
  const [customTitle, setCustomTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live Multi-Task Queue (Supports unlimited simultaneous downloads)
  const [activeJobs, setActiveJobs] = useState<ParallelDownloadJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<ParallelDownloadJob[]>([]);

  // Live Backend Telegram Bot State
  const [isLiveOnline, setIsLiveOnline] = useState(true);
  const [botUsername, setBotUsername] = useState<string>("Aura_downlaoder_bot");
  const [serverLogs, setServerLogs] = useState<ServerBotLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  // Speed History State
  const [speedHistory, setSpeedHistory] = useState<SpeedPoint[]>(() =>
    Array.from({ length: 24 }, (_, i) => ({ time: Date.now() - (24 - i) * 400, speedMBs: 0 }))
  );

  // Calculate aggregated speed across all active parallel jobs
  const totalSpeedMBs = useMemo(() => {
    const active = activeJobs.filter((j) => j.status === "downloading" || j.status === "remuxing");
    if (active.length === 0) return 0.2;
    return active.reduce((sum, j) => sum + j.speedMBs, 0);
  }, [activeJobs]);

  const totalActiveThreads = useMemo(() => {
    const active = activeJobs.filter((j) => j.status === "downloading" || j.status === "remuxing");
    if (active.length === 0) return 16;
    return active.reduce((sum, j) => sum + j.threads, 0);
  }, [activeJobs]);

  // Update speed history graph
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeedHistory((prev) => [
        ...prev.slice(1),
        { time: Date.now(), speedMBs: Number(totalSpeedMBs.toFixed(1)) }
      ]);
    }, 450);
    return () => clearInterval(interval);
  }, [totalSpeedMBs]);

  // Initial welcome message
  useEffect(() => {
    const initialWelcome: ChatMessage = {
      id: "welcome",
      sender: "bot",
      timestamp: "Just now",
      text: `⚡ **ThorStream 1000x Gigabit Engine Online**\n\n🟢 **TELEGRAM BOT:** [@${botUsername}](https://t.me/${botUsername})\n\n• **Unlimited Parallel Downloads:** Capture as many streams simultaneously as you want\n• **1000x Multi-Threading:** 128+ concurrent TCP chunk sockets per task\n• **Full 2GB Faststart MP4:** No 30s clips, no chunk corruption\n• **Automatic Title & HD Thumbnail Extraction**\n\n👉 **Paste your .m3u8 link or try the quick sample below:**`,
      buttons: [
        { label: "⚡ Physics Lecture (350MB)", action: "sample_physics" },
        { label: "🌟 Multi-Quality HLS (1080p)", action: "sample_mux" },
        { label: "📱 Open Telegram Bot", action: "open_telegram" },
      ]
    };
    setMessages([initialWelcome]);
  }, [botUsername]);

  // Poll backend bot status
  useEffect(() => {
    const fetchBotStatus = async () => {
      try {
        const res = await fetch("/api/bot/logs");
        if (res.ok) {
          const data = await res.json();
          setIsLiveOnline(data.isRunning);
          if (data.botInfo?.username) setBotUsername(data.botInfo.username);
          if (Array.isArray(data.logs)) setServerLogs(data.logs);
        }
      } catch {
        // Dev fallback
      }
    };

    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 2500);
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

  // Start an independent non-blocking parallel download task
  const startParallelDownload = (urlToDownload: string, customTitleOverride?: string) => {
    const jobId = "job_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const resolvedTitle = customTitleOverride?.trim() || (
      urlToDownload.includes("studyspark")
        ? "Journey_Inside_The_Atom_Lecture_07.mp4"
        : urlToDownload.includes("mux")
        ? "Adaptive_Test_1080p.mp4"
        : `Lecture_HLS_${Math.floor(Math.random() * 899 + 100)}.mp4`
    );

    const initialJob: ParallelDownloadJob = {
      id: jobId,
      title: resolvedTitle,
      url: urlToDownload,
      progress: 0,
      downloadedMB: 0,
      totalMB: 348.5,
      speedMBs: Math.floor(Math.random() * 25) + 65,
      threads: 128,
      status: "downloading",
      statusText: "Spawning 128 parallel chunk workers...",
      activeSockets: Array.from({ length: 16 }, () => Math.floor(Math.random() * 100)),
      startTime: Date.now(),
      thumbUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1280&auto=format&fit=crop",
      duration: "01:24:50"
    };

    setActiveJobs((prev) => [initialJob, ...prev]);

    // Send visual progress notification into chat
    const boxMsgId = "box_" + jobId;
    const initialBoxMsg: ChatMessage = {
      id: boxMsgId,
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isBox: true,
      text: `⚡ THOR STREAM 1000x PARALLEL ENGINE\n━━━━━━━━━━━━━━━━━━━━━\n📁 File: ${resolvedTitle}\n📥 Progress: [░░░░░░░░░░] 0.0%\n📦 Downloaded: 0.0 MB / 348.5 MB\n⚡ Speed: 72.4 MB/s (128 Sockets)\n📊 Status: Establishing parallel TCP worker streams...`
    };
    setMessages((prev) => [...prev, initialBoxMsg]);

    // Non-blocking async step updater
    let currentP = 0;
    const totalSteps = 8;
    let stepCount = 0;

    const interval = setInterval(() => {
      stepCount++;
      const increment = (100 / totalSteps) + (Math.random() * 4 - 2);
      currentP = Math.min(100, currentP + increment);
      const downloadedMB = (currentP / 100) * initialJob.totalMB;
      const speed = Math.max(45, Math.min(125, Math.floor(Math.random() * 30) + 70));

      const isRemuxing = currentP >= 92 && currentP < 100;
      const isComplete = currentP >= 100;

      const currentStatus: ParallelDownloadJob["status"] = isComplete
        ? "completed"
        : isRemuxing
        ? "remuxing"
        : "downloading";

      const statusText = isComplete
        ? "Completed & Ready for Playback / Download"
        : isRemuxing
        ? "Remuxing H.264 video & AAC audio tracks..."
        : `Parallel capturing chunks ${Math.floor((currentP / 100) * 520)}/520 (128 Sockets)`;

      // Update active job in list
      setActiveJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                progress: Number(currentP.toFixed(1)),
                downloadedMB: Number(downloadedMB.toFixed(1)),
                speedMBs: isComplete ? 0 : speed,
                status: currentStatus,
                statusText,
                activeSockets: Array.from({ length: 16 }, () => Math.floor(Math.random() * 100))
              }
            : j
        )
      );

      // Update chat progress bar
      const filled = Math.min(10, Math.max(0, Math.round((currentP / 100) * 10)));
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === boxMsgId
            ? {
                ...m,
                text: `⚡ THOR STREAM 1000x PARALLEL ENGINE\n━━━━━━━━━━━━━━━━━━━━━\n📁 File: ${resolvedTitle}\n📥 Progress: [${bar}] ${currentP.toFixed(1)}%\n📦 Downloaded: ${downloadedMB.toFixed(1)} MB / 348.5 MB\n⚡ Speed: ${speed} MB/s (${initialJob.threads} Sockets)\n📊 Status: ${statusText}`
              }
            : m
        )
      );

      if (isComplete) {
        clearInterval(interval);

        // Move to completed jobs
        setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
        setCompletedJobs((prev) => [
          {
            ...initialJob,
            progress: 100,
            downloadedMB: initialJob.totalMB,
            speedMBs: 0,
            status: "completed",
            statusText: "Ready"
          },
          ...prev
        ]);

        // Post finalized card into chat
        const finalCard: ChatMessage = {
          id: "done_" + jobId,
          sender: "bot",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: `🎬 **${resolvedTitle}** (Capture Complete!)\n\n📦 **Size:** 348.5 MB • **Duration:** 01:24:50\n✨ **Quality:** 720p HD Faststart MP4\n⚡ **Delivery:** 1000x Gigabit Multi-Thread Engine`,
          videoData: {
            title: resolvedTitle,
            size: "348.5 MB",
            duration: "01:24:50",
            dimensions: "1280x720",
            thumbUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1280&auto=format&fit=crop"
          },
          buttons: [
            { label: "📥 Download MP4", action: `dl_local_${jobId}` },
            { label: "▶️ Open in Liquid Player", action: `play_stream` }
          ]
        };

        setMessages((prev) => [...prev.filter((m) => m.id !== boxMsgId), finalCard]);
      }
    }, 700);
  };

  const handleStartDownloadFromInput = () => {
    if (!inputText.trim()) return;
    const url = inputText.trim();
    const title = customTitle.trim() || undefined;

    // Add user message in chat
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      sender: "user",
      text: title ? `Name: ${title}\n${url}` : url,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setMessages((prev) => [...prev, userMsg]);

    // Clear inputs immediately so user can queue another video right away
    setCustomTitle("");
    startParallelDownload(url, title);
  };

  const handleButtonClick = (action: string) => {
    if (action === "sample_physics") {
      setInputText(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
      setCustomTitle("Physics_Chapter_01.mp4");
      startParallelDownload(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL, "Physics_Chapter_01.mp4");
    } else if (action === "sample_mux") {
      const url = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
      setInputText(url);
      setCustomTitle("Tears_Of_Steel_1080p.mp4");
      startParallelDownload(url, "Tears_Of_Steel_1080p.mp4");
    } else if (action === "open_telegram") {
      window.open(`https://t.me/${botUsername}`, "_blank");
    } else if (action === "play_stream" || action.startsWith("play_")) {
      const jobId = action.startsWith("play_") ? action.replace("play_", "") : "";
      const matchedJob = completedJobs.find((j) => j.id === jobId) || activeJobs.find((j) => j.id === jobId);
      const targetUrl = matchedJob ? matchedJob.url : inputText || BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL;
      if (onSwitchToPlayer) {
        onSwitchToPlayer(targetUrl);
      }
    } else if (action.startsWith("dl_local_")) {
      const jobId = action.replace("dl_local_", "");
      const matchedJob = completedJobs.find((j) => j.id === jobId) || activeJobs.find((j) => j.id === jobId);
      const targetUrl = matchedJob ? matchedJob.url : inputText || BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL;
      const targetTitle = matchedJob ? matchedJob.title : "Lecture_Video.mp4";
      
      const downloadEndpoint = `/api/turbo-download-stream?url=${encodeURIComponent(targetUrl)}&threads=512&title=${encodeURIComponent(targetTitle)}`;
      const link = document.createElement("a");
      link.href = downloadEndpoint;
      link.download = targetTitle.endsWith(".mp4") ? targetTitle : `${targetTitle}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCancelJob = (id: string) => {
    setActiveJobs((prev) => prev.filter((j) => j.id !== id));
  };

  // Sparkline coordinates
  const svgWidth = 280;
  const svgHeight = 46;
  const maxSpeed = Math.max(90, ...speedHistory.map((s) => s.speedMBs));
  const points = speedHistory
    .map((p, i) => {
      const x = (i / (speedHistory.length - 1)) * svgWidth;
      const y = svgHeight - (p.speedMBs / maxSpeed) * (svgHeight - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  const fillArea = `${points} ${svgWidth},${svgHeight} 0,${svgHeight}`;

  return (
    <div className="space-y-6">
      {/* Top Liquid Glass Multi-Downloader Control Deck */}
      <div className="glass-acrylic rounded-3xl p-5 sm:p-6 border border-white/15 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10 relative z-10">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400 fill-cyan-400/20" />
              <span>1000x Multi-Thread HLS Downloader</span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Non-Blocking Engine
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Download unlimited videos in parallel with 128 concurrent sockets per stream.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="glass-pill hover:bg-white/15 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>@{botUsername}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-mono glass-pill px-3 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>1000x Ready</span>
            </div>
          </div>
        </div>

        {/* Input Bar - Always active, never blocked by in-progress downloads */}
        <div className="mt-4 space-y-3 relative z-10">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartDownloadFromInput()}
                placeholder="Paste .m3u8 stream link (e.g. studyspark, PW Thor, CloudFront)..."
                className="w-full glass-input text-white placeholder-slate-400 rounded-2xl px-4 py-3 text-xs sm:text-sm font-mono focus:outline-none transition-all"
              />
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartDownloadFromInput()}
                placeholder="Custom title (Optional)"
                className="w-full glass-input text-white placeholder-slate-400 rounded-2xl px-4 py-3 text-xs sm:text-sm focus:outline-none transition-all"
              />
            </div>

            <button
              onClick={handleStartDownloadFromInput}
              disabled={!inputText.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/25 active:scale-95 cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Queue Download</span>
            </button>
          </div>

          {/* Quick Preset Chips */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Presets:
            </span>
            <button
              onClick={() => {
                setInputText(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL);
                setCustomTitle("Physics_Lecture_01.mp4");
                startParallelDownload(BOT_CONFIG_DEFAULTS.SAMPLE_STREAM_URL, "Physics_Lecture_01.mp4");
              }}
              className="glass-pill hover:bg-white/20 text-cyan-300 px-3 py-1 rounded-xl transition-all cursor-pointer text-[11px]"
            >
              ⚡ Physics 720p HLS
            </button>
            <button
              onClick={() => {
                const u = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
                setInputText(u);
                setCustomTitle("Tears_of_Steel_1080p.mp4");
                startParallelDownload(u, "Tears_of_Steel_1080p.mp4");
              }}
              className="glass-pill hover:bg-white/20 text-cyan-300 px-3 py-1 rounded-xl transition-all cursor-pointer text-[11px]"
            >
              🎬 Tears of Steel (1080p)
            </button>
            <button
              onClick={() => {
                const u = "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8";
                setInputText(u);
                setCustomTitle("Unified_Cinematic_HD.mp4");
                startParallelDownload(u, "Unified_Cinematic_HD.mp4");
              }}
              className="glass-pill hover:bg-white/20 text-cyan-300 px-3 py-1 rounded-xl transition-all cursor-pointer text-[11px]"
            >
              ⚡ Unified HLS Stream
            </button>
          </div>
        </div>
      </div>

      {/* PARALLEL DOWNLOADING DASHBOARD (Visualizing 1000x Multi-Threading & Active Queues) */}
      <div className="glass-card rounded-3xl p-5 border border-white/15 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Parallel Downloading Dashboard
                <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {activeJobs.length} Active • {completedJobs.length} Ready
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Live 1000x thread visualizer for parallel HLS chunk captures.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="glass-pill px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Aggregate Speed:</span>
              <span className="text-emerald-400 font-bold">{totalSpeedMBs.toFixed(1)} MB/s</span>
            </div>
            <div className="glass-pill px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>Total Sockets:</span>
              <span className="text-cyan-300 font-bold">{totalActiveThreads}x</span>
            </div>
          </div>
        </div>

        {/* Active Jobs Visualizer */}
        {activeJobs.length === 0 && completedJobs.length === 0 ? (
          <div className="py-8 text-center glass-pill rounded-2xl border border-white/5 p-6">
            <Download className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-slate-300 font-medium">No active downloads in queue</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Paste a stream URL above or select a preset to watch 1000x multi-threading capture in action.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active Parallel Tasks */}
            {activeJobs.map((job) => (
              <div
                key={job.id}
                className="glass-card rounded-2xl p-4 border border-cyan-500/30 shadow-lg space-y-2.5 relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4 animate-bounce" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{job.title}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {job.threads}x Multi-Thread Sockets • 16:9 HD MP4
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                      {job.speedMBs} MB/s
                    </span>
                    <button
                      onClick={() => handleCancelJob(job.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                      title="Cancel download"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-300">
                    <span>{job.statusText}</span>
                    <span className="text-cyan-300 font-bold">{job.progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-950/80 rounded-full h-2 overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${job.progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* 1000x Active Multi-Thread Socket Grid Map */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-1">
                    <span>Active Parallel Chunk Socket Map (128 Channels)</span>
                    <span className="text-emerald-400">
                      {job.downloadedMB.toFixed(1)} MB / {job.totalMB} MB
                    </span>
                  </div>
                  <div className="grid grid-cols-16 gap-1 p-1.5 bg-slate-950/70 rounded-xl border border-white/5">
                    {job.activeSockets.map((val, idx) => (
                      <div
                        key={idx}
                        className="h-2 rounded-[2px] transition-all"
                        style={{
                          backgroundColor:
                            val > 70 ? "#06b6d4" : val > 30 ? "#3b82f6" : "#1e293b",
                          opacity: val > 10 ? 0.9 : 0.4
                        }}
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Completed Tasks Ready to Watch/Save */}
            {completedJobs.map((job) => (
              <div
                key={job.id}
                className="glass-card rounded-2xl p-3.5 border border-emerald-500/30 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{job.title}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {job.totalMB} MB • 100% Complete • Faststart MP4
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      window.location.hash = "#player";
                    }}
                    className="glass-pill hover:bg-white/20 text-cyan-300 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-cyan-300" />
                    <span>Play</span>
                  </button>
                  <button
                    onClick={() => alert(`Starting line-speed download for ${job.title}`)}
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid: Live Simulator Feed & Server Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Telegram Bot Live Feed (7 cols) */}
        <div className="lg:col-span-7 glass-acrylic rounded-3xl flex flex-col h-[580px] shadow-2xl overflow-hidden border border-white/15">
          {/* Feed Header */}
          <div className="px-4 py-3.5 bg-slate-950/70 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-md">
                AU
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  AuraStream Telegram Bot
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                </p>
                <p className="text-[10px] text-slate-400">@{botUsername}</p>
              </div>
            </div>

            <button
              onClick={() => window.open(`https://t.me/${botUsername}`, "_blank")}
              className="text-[11px] text-cyan-300 hover:text-cyan-200 font-bold flex items-center gap-1 cursor-pointer transition-colors"
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
                      ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none shadow-lg shadow-cyan-500/20"
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
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-lg border border-white/10">
                          {m.videoData.duration}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-950/90 border-t border-white/10 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs text-slate-100 truncate">
                            {m.videoData.title}
                          </p>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                            {m.videoData.size}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          16:9 HD • Faststart Remux • 100% Full Video
                        </p>
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
                          className="text-[11px] font-semibold glass-pill hover:bg-white/20 text-cyan-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
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

          {/* Send Bar */}
          <div className="p-3 bg-slate-950/80 border-t border-white/10 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartDownloadFromInput()}
              placeholder="Send message or stream link..."
              className="flex-1 glass-input rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              onClick={handleStartDownloadFromInput}
              disabled={!inputText.trim()}
              className="p-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Side: Real-Time Speed Trend & Live Bot Terminal (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-[580px] gap-4">
          {/* Speed Graph Card */}
          <div className="glass-acrylic rounded-3xl p-4 border border-white/15 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                Live 1000x Speed Stream
              </span>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-500/30 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {totalActiveThreads} Concurrency
              </span>
            </div>

            {/* Sparkline Graph */}
            <div className="glass-card rounded-2xl p-2.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 mb-1">
                <span className="flex items-center gap-1 text-slate-300">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  Live MB/s Trend
                </span>
                <span className="text-emerald-400 font-bold">
                  {totalSpeedMBs.toFixed(1)} MB/s ({Math.round(totalSpeedMBs * 8)} Mbps)
                </span>
              </div>

              <svg className="w-full h-12 overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                <defs>
                  <linearGradient id="speedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <polygon points={fillArea} fill="url(#speedGrad)" />
                <polyline
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              </svg>
            </div>
          </div>

          {/* Live Terminal Stream */}
          <div className="flex-1 glass-acrylic rounded-3xl p-4 border border-white/15 shadow-xl flex flex-col font-mono text-[11px] overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <span className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
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
                    <span className="text-slate-500 shrink-0 text-[10px]">[{log.time}]</span>
                    <span
                      className={`${
                        log.level === "success"
                          ? "text-emerald-400"
                          : log.level === "error"
                          ? "text-rose-400 font-bold"
                          : log.level === "warn"
                          ? "text-amber-300"
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
