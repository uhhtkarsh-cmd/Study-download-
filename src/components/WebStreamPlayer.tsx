import React, { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Download,
  Settings,
  PictureInPicture2,
  Copy,
  Check,
  ArrowLeft,
  MoreVertical,
  Radio,
  Tv,
  Zap,
  CheckCircle2,
  X,
  RefreshCw,
  ScreenShare,
  Smartphone,
  Sparkles,
  Loader2,
  AlertTriangle
} from "lucide-react";

interface StoredVideo {
  fileId: string;
  filename: string;
  fileSizeMB: string;
  duration: string;
  quality: string;
  createdAt: number;
  streamUrl: string;
  downloadUrl: string;
  playerUrl: string;
}

interface ActiveDownloadJob {
  taskId: string;
  title: string;
  quality: string;
  percentage: number;
  downloadedMB: number;
  totalSize: string;
  speed: string;
  status: "starting" | "downloading" | "uploading" | "completed" | "error";
  error?: string;
  downloadUrl?: string;
}

const PRESET_STREAMS = [
  {
    name: "🎬 Adaptive HD Stream (1080p / 720p)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  },
  {
    name: "⚡ Sample Video Stream",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  },
  {
    name: "📺 Standard MP4 Video",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  }
];

export const WebStreamPlayer: React.FC = () => {
  // Initial stream URL detection
  const getInitialUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get("url") || params.get("stream");
      if (queryUrl) return queryUrl;
    } catch {}
    return PRESET_STREAMS[0].url;
  };

  const [streamUrl, setStreamUrl] = useState<string>(getInitialUrl);
  const [inputUrl, setInputUrl] = useState<string>("");
  const [videoTitle, setVideoTitle] = useState<string>("Video Stream Player");
  
  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volumeBoost, setVolumeBoost] = useState<number>(100);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [streamStatus, setStreamStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [streamError, setStreamError] = useState<string | null>(null);

  // Qualities & Levels
  const [levels, setLevels] = useState<{ id: number; label: string; height?: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  // UI Control visibility & landscape modes
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Download job state (Live progress tracking)
  const [activeDownloadJob, setActiveDownloadJob] = useState<ActiveDownloadJob | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);

  // Holding 2x speed
  const [isHolding2x, setIsHolding2x] = useState(false);
  const [speedBeforeHold, setSpeedBeforeHold] = useState(1.0);

  // Ripple feedback animation
  const [seekRipple, setSeekRipple] = useState<"forward" | "backward" | null>(null);

  // Copied toast
  const [copied, setCopied] = useState(false);

  // Saved / Downloaded Videos
  const [storedVideos, setStoredVideos] = useState<StoredVideo[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const holdTimerRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const downloadPollTimerRef = useRef<any>(null);

  // Format seconds to H:MM:SS or MM:SS
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const totalSecs = Math.floor(secs);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const formattedM = h > 0 ? String(m).padStart(2, "0") : String(m);
    const formattedS = String(s).padStart(2, "0");
    if (h > 0) {
      return `${h}:${formattedM}:${formattedS}`;
    }
    return `${formattedM}:${formattedS}`;
  };

  // Helper to extract clean lecture title from URL
  const extractTitle = (url: string): string => {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "";
      if (last && !last.includes("master") && !last.includes("index")) {
        return decodeURIComponent(last).replace(/\.(m3u8|mp4)$/, "").replace(/[_-]/g, " ");
      }
    } catch {}
    return "Online Video Stream";
  };

  // Fetch saved videos from backend
  const fetchStoredVideos = async () => {
    try {
      const res = await fetch("/api/stored-videos");
      if (res.ok) {
        const data = await res.json();
        setStoredVideos(data.videos || []);
      }
    } catch {}
  };

  // Load stream into video element with auto-recovery
  const loadStream = useCallback((urlToLoad: string, isAutoRetry = false) => {
    const video = videoRef.current;
    if (!video || !urlToLoad) return;

    setStreamStatus("loading");
    setStreamError(null);
    setCurrentTime(0);
    setBufferedEnd(0);
    setShowSettingsModal(false);
    setShowDownloadModal(false);
    setShowMoreMenu(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setVideoTitle(extractTitle(urlToLoad));

    const isHls = urlToLoad.includes(".m3u8") || urlToLoad.includes("proxy-stream") || urlToLoad.includes("proxy-m3u8") || urlToLoad.includes("studyspark");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        fragLoadingTimeOut: 25000,
        manifestLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000,
      });

      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(urlToLoad);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setStreamStatus("ready");
        const availableLevels = data.levels.map((lvl, idx) => ({
          id: idx,
          label: lvl.height ? `${lvl.height}p` : `Stream ${idx + 1}`,
          height: lvl.height,
        }));
        setLevels(availableLevels);
        setCurrentLevel(hls.currentLevel);

        // Attempt instant auto-play
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => setIsPlaying(true)).catch(() => {});
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!isAutoRetry && !urlToLoad.includes("/api/proxy-m3u8")) {
                // Auto-repair expired token / CDN link
                const repaired = `/api/proxy-m3u8?url=${encodeURIComponent(urlToLoad)}`;
                loadStream(repaired, true);
              } else {
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setStreamStatus("error");
              setStreamError("Stream link may be expired or inaccessible.");
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else {
      // Native MP4 or Safari Native HLS
      video.src = urlToLoad;
      video.load();
      video.play().then(() => {
        setIsPlaying(true);
        setStreamStatus("ready");
      }).catch(() => {
        setStreamStatus("ready");
      });
    }
  }, []);

  // Initialize from Route / Params
  useEffect(() => {
    const initPlayerFromRoute = async () => {
      try {
        const path = window.location.pathname;
        const search = new URLSearchParams(window.location.search);
        
        let detectedId: string | null = search.get("id") || search.get("streamId");
        if (!detectedId) {
          const pathMatch = path.match(/\/(?:player|play|watch|p)\/([^/?#]+)/);
          if (pathMatch && pathMatch[1]) {
            detectedId = pathMatch[1];
          }
        }

        const rawUrl = search.get("url") || search.get("stream");

        if (detectedId) {
          try {
            const metaRes = await fetch(`/api/stream-meta/${detectedId}`);
            if (metaRes.ok) {
              const meta = await metaRes.json();
              if (meta.streamUrl) {
                setStreamUrl(meta.streamUrl);
                if (meta.title) setVideoTitle(meta.title);
                loadStream(meta.streamUrl);
                return;
              }
            }
          } catch {}
          const fallbackUrl = `/api/proxy-stream/${detectedId}/master.m3u8`;
          setStreamUrl(fallbackUrl);
          loadStream(fallbackUrl);
          return;
        }

        if (rawUrl) {
          setStreamUrl(rawUrl);
          loadStream(rawUrl);
          return;
        }

        loadStream(streamUrl);
      } catch {
        loadStream(streamUrl);
      }
    };

    initPlayerFromRoute();
    fetchStoredVideos();
    const interval = setInterval(fetchStoredVideos, 8000);
    return () => clearInterval(interval);
  }, []);

  // Video element event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onDurationChange = () => {
      setDuration(video.duration || 0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, []);

  // Auto-hide controls timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setShowMoreMenu(false);
        setShowSpeedMenu(false);
        setShowVolumeSlider(false);
      }, 3500);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [isPlaying, resetControlsTimer]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs) {
        setIsLandscapeMode(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Playback Control Handlers
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    if (seconds > 0) {
      setSeekRipple("forward");
      setTimeout(() => setSeekRipple(null), 600);
    } else {
      setSeekRipple("backward");
      setTimeout(() => setSeekRipple(null), 600);
    }
    resetControlsTimer();
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const target = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = target;
    setCurrentTime(target);
    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    if (val === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const changeSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
    setShowSettingsModal(false);
    resetControlsTimer();
  };

  const changeQuality = (levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      setCurrentLevel(levelId);
    }
    setShowSettingsModal(false);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    resetControlsTimer();
  };

  // Landscape Toggle Handler
  const toggleLandscape = async () => {
    const container = playerContainerRef.current;
    if (!container) return;

    try {
      if (!isLandscapeMode) {
        setIsLandscapeMode(true);
        if (!document.fullscreenElement) {
          await container.requestFullscreen().catch(() => {});
        }
        if ((screen.orientation as any)?.lock) {
          await (screen.orientation as any).lock("landscape").catch(() => {});
        }
      } else {
        setIsLandscapeMode(false);
        if ((screen.orientation as any)?.unlock) {
          (screen.orientation as any).unlock();
        }
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
      }
    } catch {
      setIsLandscapeMode((prev) => !prev);
    }
    resetControlsTimer();
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {}
    resetControlsTimer();
  };

  // Double tap handler for mobile seek
  const handleTouchScreen = (e: React.TouchEvent<HTMLVideoElement>) => {
    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (touch.clientX - rect.left) / rect.width;

    if (now - lastTapRef.current.time < 300) {
      // Double tap detected
      if (xRatio > 0.6) {
        seekRelative(10);
      } else if (xRatio < 0.4) {
        seekRelative(-10);
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
      togglePlay();
    }
  };

  // Press and hold for 2x speed
  const handleHoldStart = () => {
    holdTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        setSpeedBeforeHold(video.playbackRate);
        video.playbackRate = 2.0;
        setIsHolding2x(true);
      }
    }, 400);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (isHolding2x) {
      const video = videoRef.current;
      if (video) video.playbackRate = speedBeforeHold;
      setIsHolding2x(false);
    }
  };

  // Copy Stream Link Helper
  const handleCopyLink = () => {
    navigator.clipboard.writeText(streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Play Link Input Form
  const handlePlayInputUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setStreamUrl(inputUrl.trim());
    loadStream(inputUrl.trim());
    setInputUrl("");
  };

  // Auto-Fix Expired Stream Handler
  const handleAutoFixExpiredStream = () => {
    const repaired = `/api/proxy-m3u8?url=${encodeURIComponent(streamUrl)}`;
    loadStream(repaired, true);
  };

  // Start High-Speed Real-time Download
  const startLiveDownload = async (quality: string) => {
    setIsStartingDownload(true);
    try {
      const res = await fetch("/api/convert-to-permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: streamUrl,
          title: videoTitle,
          quality: quality === "auto" ? undefined : quality
        })
      });

      if (!res.ok) throw new Error("Could not start download task");
      const data = await res.json();
      const taskId = data.taskId;

      setActiveDownloadJob({
        taskId,
        title: videoTitle,
        quality: quality === "auto" ? "HD Max" : `${quality}p`,
        percentage: 0,
        downloadedMB: 0,
        totalSize: "Calculating...",
        speed: "Starting turbo engine...",
        status: "downloading"
      });

      // Poll progress every 600ms
      if (downloadPollTimerRef.current) clearInterval(downloadPollTimerRef.current);
      downloadPollTimerRef.current = setInterval(async () => {
        try {
          const logRes = await fetch("/api/bot/logs");
          if (logRes.ok) {
            const botData = await logRes.json();
            const task = (botData.activeTasks || []).find((t: any) => t.id === taskId);
            if (task) {
              setActiveDownloadJob((prev) => {
                if (!prev) return null;
                const isDone = task.status === "completed";
                const isErr = task.status === "error";
                const safeName = task.title || `${videoTitle}.mp4`;
                const dlUrl = `/api/download/${taskId}/${encodeURIComponent(safeName)}`;

                if (isDone) {
                  clearInterval(downloadPollTimerRef.current);
                  fetchStoredVideos();
                  // Trigger browser download automatically
                  const a = document.createElement("a");
                  a.href = dlUrl;
                  a.download = safeName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }

                return {
                  ...prev,
                  percentage: task.percentage || 0,
                  downloadedMB: task.downloadedMB || 0,
                  totalSize: task.totalSize || `${task.downloadedMB} MB`,
                  speed: task.speed || "Downloading...",
                  status: isDone ? "completed" : isErr ? "error" : "downloading",
                  downloadUrl: isDone ? dlUrl : undefined
                };
              });
            }
          }
        } catch {}
      }, 600);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setIsStartingDownload(false);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (downloadPollTimerRef.current) clearInterval(downloadPollTimerRef.current);
    };
  }, []);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div className={`w-full max-w-5xl mx-auto space-y-4 animate-fadeIn pb-12 font-sans selection:bg-indigo-600 selection:text-white ${isLandscapeMode ? "fixed inset-0 z-50 bg-black p-0 m-0 max-w-none flex flex-col justify-center items-center h-screen w-screen overflow-hidden" : ""}`}>
      {/* 
        ========================================================================
        TOP BAR: Simple, Clean & Responsive
        ========================================================================
      */}
      {!isLandscapeMode && (
        <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 rounded-t-2xl sm:rounded-t-3xl flex items-center justify-between shadow-xl border-b border-slate-800">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else loadStream(PRESET_STREAMS[0].url);
              }}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors active:scale-95 cursor-pointer text-white flex-shrink-0"
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-semibold text-white truncate tracking-tight">
                {videoTitle}
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Video Stream
                </span>
                <span>•</span>
                <span>{playbackSpeed !== 1.0 ? `${playbackSpeed}x` : "HD"}</span>
              </div>
            </div>
          </div>

          {/* Top Right Options */}
          <div className="relative flex items-center gap-1.5 flex-shrink-0">
            {/* Quick Landscape Button */}
            <button
              onClick={toggleLandscape}
              className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-medium"
              title="Toggle Landscape Mode"
            >
              <Smartphone className="w-4 h-4 rotate-90 text-indigo-400" />
              <span className="hidden sm:inline">Landscape</span>
            </button>

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95 cursor-pointer text-white"
              title="More Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Popover Menu */}
            {showMoreMenu && (
              <div className="absolute right-0 top-11 z-50 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-1.5 shadow-2xl text-xs space-y-1 animate-fadeIn">
                <button
                  onClick={() => {
                    toggleLandscape();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left"
                >
                  <Smartphone className="w-4 h-4 rotate-90 text-indigo-400" />
                  <span>Toggle Landscape Mode</span>
                </button>

                <button
                  onClick={() => {
                    handleAutoFixExpiredStream();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <span>Auto-Fix & Play Expired Link</span>
                </button>

                <button
                  onClick={() => {
                    handleCopyLink();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  <span>{copied ? "Link Copied!" : "Copy Stream URL"}</span>
                </button>

                <a
                  href={`vlc://${streamUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left"
                >
                  <Tv className="w-4 h-4 text-amber-400" />
                  <span>Open in VLC Player</span>
                </a>

                <button
                  onClick={() => {
                    setShowDownloadModal(true);
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left"
                >
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>Download Video (MP4)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        CORE VIDEO PLAYER CONTAINER
        ========================================================================
      */}
      <div
        ref={playerContainerRef}
        onMouseMove={resetControlsTimer}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        className={`relative w-full ${isLandscapeMode ? "h-screen w-screen max-w-none rounded-none" : "aspect-video rounded-b-2xl sm:rounded-b-3xl"} bg-black overflow-hidden shadow-2xl select-none group border border-slate-800`}
      >
        {/* Floating Exit Landscape Button */}
        {isLandscapeMode && (
          <button
            onClick={toggleLandscape}
            className="absolute top-4 right-4 z-40 bg-black/80 hover:bg-black text-white px-3.5 py-1.5 rounded-full border border-white/20 text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all active:scale-95 cursor-pointer backdrop-blur-md"
          >
            <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
            <span>Exit Landscape</span>
          </button>
        )}

        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain bg-black"
          onClick={togglePlay}
          onTouchEnd={handleTouchScreen}
        />

        {/* 2X Speed Indicator Badge */}
        {isHolding2x && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 shadow-xl animate-pulse">
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>2X SPEED ▶▶</span>
          </div>
        )}

        {/* Double Tap Ripple Animations */}
        {seekRipple === "forward" && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 z-30 bg-white/20 backdrop-blur-md text-white p-4 rounded-full flex flex-col items-center gap-1 animate-ping pointer-events-none">
            <RotateCw className="w-8 h-8" />
            <span className="text-xs font-black">+10s</span>
          </div>
        )}

        {seekRipple === "backward" && (
          <div className="absolute left-12 top-1/2 -translate-y-1/2 z-30 bg-white/20 backdrop-blur-md text-white p-4 rounded-full flex flex-col items-center gap-1 animate-ping pointer-events-none">
            <RotateCcw className="w-8 h-8" />
            <span className="text-xs font-black">-10s</span>
          </div>
        )}

        {/* Center Loading Spinner */}
        {streamStatus === "loading" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs pointer-events-none">
            <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin"></div>
            <span className="text-white text-xs font-medium mt-3 tracking-wide drop-shadow">
              Connecting Video Stream...
            </span>
          </div>
        )}

        {/* Error Overlay with Auto-Fix Expired Stream Option */}
        {streamStatus === "error" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-400 animate-bounce" />
            <div className="max-w-md">
              <h3 className="text-white font-bold text-sm sm:text-base">Stream Issue / Token Expired</h3>
              <p className="text-slate-400 text-xs mt-1">
                {streamError || "The video link could not be loaded directly."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <button
                onClick={handleAutoFixExpiredStream}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Auto-Fix & Play Expired Link</span>
              </button>
              <button
                onClick={() => loadStream(PRESET_STREAMS[0].url)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2 rounded-xl text-xs transition-all"
              >
                Play Sample Video
              </button>
            </div>
          </div>
        )}

        {/* Big Center Play Icon when Paused */}
        {!isPlaying && streamStatus === "ready" && (
          <div
            onClick={togglePlay}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 cursor-pointer"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white border border-white/30 transition-transform active:scale-90 shadow-2xl">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white ml-1" />
            </div>
          </div>
        )}

        {/* 
          ======================================================================
          BOTTOM OVERLAY CONTROLS
          ======================================================================
        */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-12 pb-3 px-3 sm:px-6 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* 1. Time Display Row */}
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-white/90 mb-1.5 px-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono">{formatTime(currentTime)}</span>
              {playbackSpeed !== 1.0 && (
                <span className="bg-white/20 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                  {playbackSpeed}x
                </span>
              )}
            </div>
            <span className="font-mono text-white/70">{formatTime(duration)}</span>
          </div>

          {/* 2. Scrubber Bar */}
          <div className="relative w-full h-4 flex items-center mb-2 group/slider cursor-pointer">
            {/* Background Track */}
            <div className="absolute inset-x-0 h-1.5 bg-white/20 rounded-full overflow-hidden">
              {/* Buffered Range */}
              <div
                className="h-full bg-white/40 transition-all"
                style={{ width: `${bufferedPercent}%` }}
              />
            </div>

            {/* Played Progress Bar */}
            <div
              className="absolute left-0 h-1.5 bg-indigo-500 rounded-full pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />

            {/* HTML Input Range for Smooth Scrubbing */}
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progressPercent || 0}
              onChange={handleSeekChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {/* Scrub Thumb */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-lg pointer-events-none -translate-x-1/2 transition-transform group-hover/slider:scale-125"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* 3. Control Button Bar */}
          <div className="flex items-center justify-between gap-1 sm:gap-2 text-white">
            {/* Left controls */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />
                ) : (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white ml-0.5" />
                )}
              </button>

              {/* Rewind 10s */}
              <button
                onClick={() => seekRelative(-10)}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer relative"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black pointer-events-none pt-0.5">
                  10
                </span>
              </button>

              {/* Forward 10s */}
              <button
                onClick={() => seekRelative(10)}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer relative"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black pointer-events-none pt-0.5">
                  10
                </span>
              </button>

              {/* Volume & Slider */}
              <div
                className="relative flex items-center"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                </button>

                {/* Popout Volume Slider */}
                {showVolumeSlider && (
                  <div className="hidden sm:flex items-center w-20 px-2 bg-slate-900/90 rounded-xl border border-white/10 h-8 ml-1 animate-fadeIn">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-full accent-indigo-500 cursor-pointer h-1"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Landscape Button */}
              <button
                onClick={toggleLandscape}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer text-indigo-400"
                title="Toggle Landscape / Auto-Rotate"
              >
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 rotate-90" />
              </button>

              {/* Speed Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-2.5 py-1.5 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer text-xs font-bold"
                title="Playback Speed"
              >
                {playbackSpeed}x
              </button>

              {/* Download Button */}
              <button
                onClick={() => setShowDownloadModal(true)}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer text-indigo-300 hover:text-white"
                title="Download Video (MP4)"
              >
                <Download className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* Settings Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer"
                title="Quality & Speed Settings"
              >
                <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* PiP */}
              <button
                onClick={togglePiP}
                className="hidden sm:block p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 cursor-pointer"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <Maximize className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        CLEAN ACTIONS BELOW PLAYER
        ========================================================================
      */}
      {!isLandscapeMode && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Direct Download Action Button */}
            <button
              onClick={() => setShowDownloadModal(true)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm border border-slate-800"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Download Video (MP4)</span>
            </button>

            {/* Landscape Toggle Button */}
            <button
              onClick={toggleLandscape}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm border border-slate-800"
            >
              <Smartphone className="w-4 h-4 text-indigo-400 rotate-90" />
              <span>Landscape Mode</span>
            </button>

            {/* Copy Stream Link Button */}
            <button
              onClick={handleCopyLink}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm border border-slate-800"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              <span>{copied ? "Link Copied!" : "Copy Stream URL"}</span>
            </button>
          </div>

          {/* 
            ========================================================================
            PASTE STREAM URL FORM
            ========================================================================
          */}
          <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
                <Play className="w-4 h-4 fill-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Play Any Stream Link
                </h2>
                <p className="text-xs text-slate-400">
                  Paste any .m3u8 or MP4 video URL below
                </p>
              </div>
            </div>

            <form onSubmit={handlePlayInputUrl} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste video stream link here (https://...)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900 transition-all font-mono"
              />
              <button
                type="submit"
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 flex-shrink-0 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play</span>
              </button>
            </form>

            {/* Quick Presets */}
            <div className="pt-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Sample Streams:
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_STREAMS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setStreamUrl(preset.url);
                      loadStream(preset.url);
                    }}
                    className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium ${
                      streamUrl === preset.url
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 
            ========================================================================
            SAVED / DOWNLOADED VIDEOS (IF ANY)
            ========================================================================
          */}
          {storedVideos.length > 0 && (
            <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Downloaded Videos ({storedVideos.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Offline files saved on server
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-800">
                {storedVideos.map((video) => (
                  <div key={video.fileId} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
                        {video.filename}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>{video.fileSizeMB} MB</span>
                        <span>•</span>
                        <span>{video.quality}</span>
                        <span>•</span>
                        <span>{video.duration}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setStreamUrl(video.streamUrl);
                          setVideoTitle(video.filename);
                          loadStream(video.streamUrl);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="bg-slate-800 hover:bg-indigo-900 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play</span>
                      </button>
                      <a
                        href={video.downloadUrl}
                        download={video.filename}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 
        ========================================================================
        HIGH-SPEED LIVE DOWNLOAD MODAL (NO MORE PENDING / 00 MB)
        ========================================================================
      */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Download Video</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[220px]">{videoTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Download Progress Card (If in progress) */}
            {activeDownloadJob ? (
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {activeDownloadJob.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    <span>
                      {activeDownloadJob.status === "completed"
                        ? "Download Complete!"
                        : `Downloading ${activeDownloadJob.quality}...`}
                    </span>
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {activeDownloadJob.percentage.toFixed(1)}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.min(100, activeDownloadJob.percentage)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{activeDownloadJob.downloadedMB.toFixed(1)} MB / {activeDownloadJob.totalSize}</span>
                  <span>{activeDownloadJob.speed}</span>
                </div>

                {activeDownloadJob.status === "completed" && activeDownloadJob.downloadUrl && (
                  <a
                    href={activeDownloadJob.downloadUrl}
                    download={`${videoTitle}.mp4`}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>💾 Save Finished Video (.mp4)</span>
                  </a>
                )}
              </div>
            ) : (
              /* Quality Selection List */
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Select Video Quality:
                </span>

                {[
                  { label: "⚡ Fast Download (Full Video)", quality: "auto", desc: "Best multi-thread high speed" },
                  { label: "🎬 1080p Full HD", quality: "1080", desc: "High clarity video & audio" },
                  { label: "📱 720p HD", quality: "720", desc: "Balanced size & quality" },
                  { label: "⚡ 480p Standard", quality: "480", desc: "Optimized for mobile data" },
                  { label: "📶 360p Data Saver", quality: "360", desc: "Small file size" }
                ].map((opt) => (
                  <button
                    key={opt.quality}
                    disabled={isStartingDownload}
                    onClick={() => startLiveDownload(opt.quality)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 transition-all group cursor-pointer text-left"
                  >
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-400 block">
                        {opt.label}
                      </span>
                      <span className="text-[11px] text-slate-400">{opt.desc}</span>
                    </div>
                    <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-400" />
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Direct high speed output</span>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        SETTINGS MODAL (QUALITY & SPEED)
        ========================================================================
      */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-800 text-white flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Player Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quality Section */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Video Resolution
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => changeQuality(-1)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentLevel === -1
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  }`}
                >
                  Auto Quality
                </button>
                {levels.map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => changeQuality(lvl.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      currentLevel === lvl.id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Speed Section */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Playback Speed
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => changeSpeed(spd)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      playbackSpeed === spd
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-2xl text-xs cursor-pointer transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
