import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Terminal,
  Copy,
  Check,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Gauge,
  Sliders,
  Send,
  ExternalLink,
  Tv,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Radio,
  Zap,
  HardDrive,
  Download,
  Clock,
  HelpCircle,
  Film,
  CheckCircle,
  Flame,
  Volume1,
  Bookmark,
  Share2,
  Eye,
  Repeat,
  Moon,
  Sun,
  Keyboard,
  FileText,
  Trash2,
  Layers,
  ChevronRight,
  PictureInPicture2,
  Maximize2,
  Lock,
  Globe,
  Settings
} from "lucide-react";
import { BOT_CONFIG_DEFAULTS } from "../data/botFiles";
import { ProxyConfigModal, PacConfig, DEFAULT_PAC_CONFIG } from "./ProxyConfigModal";

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

interface StreamHealth {
  status: "idle" | "checking" | "active" | "expired" | "error" | "unreachable";
  httpStatus?: number;
  message?: string;
}

interface BookmarkItem {
  id: string;
  time: number;
  formattedTime: string;
  note: string;
  createdAt: number;
}

const PRESET_STREAMS = [
  {
    name: "🌟 Working Test Stream (1080p / 720p HD)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    description: "Verified 24/7 high-speed adaptive multi-bitrate HLS stream (Recommended)"
  },
  {
    name: "🎬 Tears of Steel HD HLS (1080p)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    description: "Multi-bitrate cinematic HLS test stream with audio track switching"
  },
  {
    name: "⚡ Akamai Live Stream (Multi-Quality)",
    url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
    description: "Multi-bitrate live video test stream with instantaneous CDN edge delivery"
  },
  {
    name: "📺 Big Buck Bunny (Direct HD)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    description: "Direct high-speed 16:9 HD MP4 stream"
  }
];

export const WebStreamPlayer: React.FC = () => {
  // Read URL query params if any
  const getInitialUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get("url") || params.get("stream");
      if (queryUrl) return queryUrl;
    } catch {
      // ignore
    }
    return "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  };

  const [streamUrl, setStreamUrl] = useState<string>(getInitialUrl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volumeBoost, setVolumeBoost] = useState<number>(100); // 100% to 200%
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isHolding2x, setIsHolding2x] = useState(false);
  const [previousSpeedBeforeHold, setPreviousSpeedBeforeHold] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamStatus, setStreamStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ id: number; label: string; height?: number; bitrate?: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  // 15+ Advanced Pro Player State
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "4:3" | "cover" | "contain">("16:9");
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [ambilightEnabled, setAmbilightEnabled] = useState(true);
  const [videoFilter, setVideoFilter] = useState<"normal" | "night" | "warm" | "contrast" | "invert">("normal");
  
  // A-B Loop State
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);

  // Sleep Timer
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);

  // Bookmarks & Notes
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => {
    try {
      const saved = localStorage.getItem("thorstream_bookmarks");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newNoteText, setNewNoteText] = useState("");
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);

  // Modals & UI Toggles
  const [showKeybindsModal, setShowKeybindsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRefreshGuide, setShowRefreshGuide] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Proxy Auto-Configuration (PAC) Helper State
  const [pacConfig, setPacConfig] = useState<PacConfig>(() => {
    try {
      const saved = localStorage.getItem("thorstream_pac_config");
      return saved ? JSON.parse(saved) : DEFAULT_PAC_CONFIG;
    } catch {
      return DEFAULT_PAC_CONFIG;
    }
  });
  const [showPacModal, setShowPacModal] = useState(false);
  const [showPac403Banner, setShowPac403Banner] = useState(false);

  // Ripple feedback on seek
  const [seekRipple, setSeekRipple] = useState<{ type: "forward" | "backward"; key: number } | null>(null);

  // Copy & Action States
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedVlc, setCopiedVlc] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Token Health & Storage
  const [streamHealth, setStreamHealth] = useState<StreamHealth>({ status: "idle" });
  const [storedVideos, setStoredVideos] = useState<StoredVideo[]>([]);
  const [activeTab, setActiveTab] = useState<"live" | "permanent">("live");
  const [isSavingPermanent, setIsSavingPermanent] = useState(false);
  const [savePermanentMsg, setSavePermanentMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<any>(null);
  const holdTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Persist bookmarks
  useEffect(() => {
    try {
      localStorage.setItem("thorstream_bookmarks", JSON.stringify(bookmarks));
    } catch {
      // ignore
    }
  }, [bookmarks]);

  // Web Audio API Gain Booster (up to 200%)
  const initAudioBooster = () => {
    const video = videoRef.current;
    if (!video || audioContextRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const gainNode = ctx.createGain();
      const source = ctx.createMediaElementSource(video);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioContextRef.current = ctx;
      gainNodeRef.current = gainNode;
      sourceNodeRef.current = source;
      gainNode.gain.value = volumeBoost / 100;
    } catch (e) {
      console.warn("Web Audio API booster initialization notice:", e);
    }
  };

  // Update volume gain booster
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (volumeBoost / 100) * volume;
    }
  }, [volumeBoost, volume]);

  const fetchStoredVideos = async () => {
    try {
      const res = await fetch("/api/stored-videos");
      if (res.ok) {
        const data = await res.json();
        setStoredVideos(data.videos || []);
      }
    } catch {
      // ignore
    }
  };

  const checkStreamHealth = async (url: string, pacOverride?: PacConfig) => {
    if (!url.trim()) return;
    setStreamHealth({ status: "checking", message: "Verifying stream & PAC tunnel..." });
    const currentPac = pacOverride || pacConfig;

    try {
      const res = await fetch("/api/check-stream-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          cookie: currentPac.cookie,
          referer: currentPac.referer,
          origin: currentPac.origin,
          userAgent: currentPac.userAgent,
          authorization: currentPac.authorization,
          profile: currentPac.profile,
        })
      });
      const data = await res.json();
      setStreamHealth({
        status: data.status || "idle",
        httpStatus: data.httpStatus,
        message: data.message
      });
      if (data.httpStatus === 403 || data.status === "expired") {
        setShowPac403Banner(true);
      } else {
        setShowPac403Banner(false);
      }
    } catch (e: any) {
      setStreamHealth({
        status: "unreachable",
        message: "Failed to connect to verification proxy"
      });
    }
  };

  const handleSaveToPermanent = async () => {
    if (!streamUrl.trim()) return;
    setIsSavingPermanent(true);
    setSavePermanentMsg(null);

    try {
      const res = await fetch("/api/convert-to-permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: streamUrl.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setSavePermanentMsg("🚀 Permanent download started! Once saved, the video will NEVER expire.");
        setTimeout(() => fetchStoredVideos(), 3000);
      } else {
        setSavePermanentMsg(data.error || "Failed to start permanent download.");
      }
    } catch (e: any) {
      setSavePermanentMsg(`Error: ${e.message}`);
    } finally {
      setIsSavingPermanent(false);
    }
  };

  const getProxyUrl = (rawUrl: string, overridePac?: PacConfig) => {
    if (rawUrl.startsWith("/api/")) return rawUrl;
    const currentPac = overridePac || pacConfig;
    const params = new URLSearchParams();
    params.set("url", rawUrl.trim());

    if (currentPac && currentPac.enabled) {
      if (currentPac.cookie?.trim()) params.set("pac_cookie", currentPac.cookie.trim());
      if (currentPac.referer?.trim()) params.set("pac_ref", currentPac.referer.trim());
      if (currentPac.origin?.trim()) params.set("pac_origin", currentPac.origin.trim());
      if (currentPac.userAgent?.trim()) params.set("pac_ua", currentPac.userAgent.trim());
      if (currentPac.authorization?.trim()) params.set("pac_auth", currentPac.authorization.trim());
      if (currentPac.profile) params.set("pac_profile", currentPac.profile);
    }

    return `/api/proxy-m3u8?${params.toString()}`;
  };

  const handleSavePacConfig = (newConfig: PacConfig, reloadStream = false) => {
    setPacConfig(newConfig);
    try {
      localStorage.setItem("thorstream_pac_config", JSON.stringify(newConfig));
    } catch {}
    if (reloadStream) {
      setTimeout(() => {
        loadStream(streamUrl, newConfig);
      }, 50);
    }
  };

  const destroyCurrentHls = () => {
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (e) {
        console.warn("Hls destruction warning:", e);
      }
      hlsRef.current = null;
    }
  };

  const loadStream = (url: string, overridePac?: PacConfig) => {
    if (!url.trim()) return;
    setStreamStatus("loading");
    setStreamError(null);
    const currentPac = overridePac || pacConfig;

    // Run health check
    checkStreamHealth(url, currentPac);

    // Auto-dismiss loading screen after 2.5s maximum so user is never stuck
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setStreamStatus((prev) => (prev === "loading" ? "ready" : prev));
    }, 2500);

    const video = videoRef.current;
    if (!video) return;

    destroyCurrentHls();

    const proxySource = getProxyUrl(url, currentPac);

    // Direct MP4 check or internal permanent video route
    if (url.endsWith(".mp4") || url.includes(".mp4?") || url.startsWith("/api/stream-video/")) {
      video.src = url.startsWith("/api/") ? url : (url.startsWith("http") && !url.includes("pwthor") ? url : proxySource);
      video.muted = true;
      video.load();
      video.play().then(() => {
        setIsPlaying(true);
        setStreamStatus("ready");
      }).catch((e) => {
        console.warn("Autoplay notice:", e);
        setStreamStatus("ready");
      });
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        maxBufferSize: 60 * 1000 * 1000,
      });
      hlsRef.current = hls;

      try {
        hls.loadSource(proxySource);
        hls.attachMedia(video);
      } catch (e) {
        console.error("Hls loadSource error:", e);
      }

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setStreamStatus("ready");
        const availableLevels = (data.levels || []).map((lvl, index) => {
          const h = lvl.height || (lvl.attrs as any)?.RESOLUTION?.split("x")[1] || "HD";
          const kbps = Math.round((lvl.bitrate || 0) / 1000);
          return {
            id: index,
            label: `${h}p ${kbps > 0 ? `(${kbps} kbps)` : ""}`,
            height: lvl.height,
            bitrate: lvl.bitrate
          };
        });

        setLevels(availableLevels);
        
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (data && typeof data.level === "number") {
          setCurrentLevel(data.level);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!hlsRef.current) return;
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              destroyCurrentHls();
              setStreamStatus("error");
              setShowPac403Banner(true);
              setStreamHealth({
                status: "expired",
                httpStatus: 403,
                message: "403 Forbidden or CORS restricted stream. Use PAC Auto-Config to inject authentication cookies/headers."
              });
              setStreamError("Stream blocked with 403 Forbidden or CORS restriction. Use the 'Proxy Auto-Configuration (PAC)' helper to inject valid cookies, referer, and spoof headers.");
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              try {
                hls.recoverMediaError();
              } catch {
                // ignore
              }
              break;
            default:
              destroyCurrentHls();
              setStreamStatus("error");
              setStreamError("Stream server error or expired stream token. Please use PAC Auto-Config or test with the working test stream.");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari HLS
      video.src = proxySource;
      video.muted = true;
      setIsMuted(true);
      video.addEventListener("loadedmetadata", () => {
        setStreamStatus("ready");
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });
    } else {
      setStreamStatus("error");
      setStreamError("Your browser does not support HLS stream playback.");
    }
  };

  useEffect(() => {
    loadStream(streamUrl);
    fetchStoredVideos();
    const interval = setInterval(fetchStoredVideos, 8000);
    return () => {
      clearInterval(interval);
      destroyCurrentHls();
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, []);

  // Sleep Timer Interval Check
  useEffect(() => {
    if (sleepTimerRemaining === null || sleepTimerRemaining <= 0) return;
    const timer = setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          setSleepTimerMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepTimerRemaining]);

  const setSleepTimer = (minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null) {
      setSleepTimerRemaining(null);
    } else {
      setSleepTimerRemaining(minutes * 60);
    }
  };

  // Playback Control Handlers
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    initAudioBooster();

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    initAudioBooster();
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }

    if (video.muted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume > 0 ? volume : 1;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    initAudioBooster();
    video.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const setSpeed = (spd: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = spd;
    (video as any).preservesPitch = true;
    setPlaybackSpeed(spd);
  };

  // FEATURE: Hold to 2x Speed (YouTube-Style)
  const startHold2x = () => {
    const video = videoRef.current;
    if (!video) return;
    setPreviousSpeedBeforeHold(playbackSpeed);
    setIsHolding2x(true);
    video.playbackRate = 2.0;
    (video as any).preservesPitch = true;
  };

  const endHold2x = () => {
    const video = videoRef.current;
    if (!video) return;
    setIsHolding2x(false);
    video.playbackRate = previousSpeedBeforeHold;
    (video as any).preservesPitch = true;
  };

  const skipSeconds = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 999999, video.currentTime + seconds));
    setSeekRipple({
      type: seconds > 0 ? "forward" : "backward",
      key: Date.now()
    });
    setTimeout(() => setSeekRipple(null), 700);
  };

  const handleLevelChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentLevel(levelIndex);
    }
  };

  const toggleLandscape = async () => {
    const nextState = !isLandscape;
    setIsLandscape(nextState);

    try {
      if (nextState) {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape").catch(() => {});
        }
        if (playerContainerRef.current && !document.fullscreenElement) {
          await playerContainerRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
        if (document.exitFullscreen && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Landscape orientation notice:", e);
    }
  };

  const openInVlc = () => {
    const url = streamUrl.trim();
    if (!url) return;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isAndroid) {
      const intentUrl = "intent:" + url + "#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.ad;end";
      window.location.href = intentUrl;
      setTimeout(() => {
        window.location.href = "vlc://" + url;
      }, 800);
    } else if (isIOS) {
      window.location.href = "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(url);
    } else {
      window.location.href = "vlc://" + url;
    }
  };

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch (e) {
      console.warn("PiP not supported or blocked:", e);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }

    // A-B Loop Logic
    if (isLoopActive && loopA !== null && loopB !== null) {
      if (video.currentTime >= loopB) {
        video.currentTime = loopA;
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pos * duration));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) {
          // Check for long press or tap
          holdTimerRef.current = setTimeout(() => {
            startHold2x();
          }, 300);
        }
      } else if (e.code === "KeyK") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "KeyJ" || e.code === "ArrowLeft") {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.code === "KeyL" || e.code === "ArrowRight") {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyT") {
        e.preventDefault();
        setIsTheaterMode((prev) => !prev);
      } else if (e.code === "KeyP") {
        e.preventDefault();
        togglePiP();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyB") {
        e.preventDefault();
        setShowAddNoteModal(true);
      } else if (e.code === "KeyO") {
        e.preventDefault();
        toggleLandscape();
      } else if (e.code === "Period" && (e.shiftKey || e.metaKey)) {
        setSpeed(Math.min(3.0, Number((playbackSpeed + 0.25).toFixed(2))));
      } else if (e.code === "Comma" && (e.shiftKey || e.metaKey)) {
        setSpeed(Math.max(0.25, Number((playbackSpeed - 0.25).toFixed(2))));
      } else if (e.key >= "0" && e.key <= "9" && duration > 0) {
        const pct = parseInt(e.key, 10) / 10;
        if (videoRef.current) {
          videoRef.current.currentTime = duration * pct;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        if (isHolding2x) {
          endHold2x();
        } else {
          togglePlay();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPlaying, isHolding2x, playbackSpeed, previousSpeedBeforeHold, duration]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Video Filter CSS Class
  const getVideoFilterClass = () => {
    switch (videoFilter) {
      case "night":
        return "contrast-125 brightness-90";
      case "warm":
        return "sepia-[0.35] brightness-95";
      case "contrast":
        return "contrast-150 saturate-125";
      case "invert":
        return "invert contrast-125 hue-rotate-180";
      default:
        return "";
    }
  };

  // Aspect Ratio CSS Class
  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case "4:3":
        return "aspect-4/3";
      case "cover":
        return "aspect-video object-cover";
      case "contain":
        return "aspect-video object-contain";
      case "16:9":
      default:
        return "aspect-video";
    }
  };

  // Add Bookmark Note
  const handleAddBookmark = () => {
    if (!newNoteText.trim()) return;
    const newBm: BookmarkItem = {
      id: Date.now().toString(),
      time: currentTime,
      formattedTime: formatTime(currentTime),
      note: newNoteText.trim(),
      createdAt: Date.now()
    };
    setBookmarks((prev) => [newBm, ...prev]);
    setNewNoteText("");
    setShowAddNoteModal(false);
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleExportNotes = () => {
    if (bookmarks.length === 0) return;
    const mdContent = `# ThorStream Lecture Notes & Timestamps\nStream: ${streamUrl}\nExported: ${new Date().toLocaleString()}\n\n` +
      bookmarks.map((b) => `- **[${b.formattedTime}]**: ${b.note}`).join("\n");

    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lecture-notes-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyFfmpegCmd = () => {
    const cmd = `ffmpeg -headers "User-Agent: Mozilla/5.0\\r\\nReferer: https://pw.live/\\r\\n" -i "${streamUrl}" -c copy -bsf:a aac_adtstoasc "PW_Class_Turbo.mp4"`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  const copyVlcLink = () => {
    const fullProxy = streamUrl.startsWith("/api/")
      ? `${window.location.origin}${streamUrl}`
      : `${window.location.origin}/api/proxy-m3u8?url=${encodeURIComponent(streamUrl)}`;
    navigator.clipboard.writeText(fullProxy);
    setCopiedVlc(true);
    setTimeout(() => setCopiedVlc(false), 2500);
  };

  const getShareablePlayerUrl = () => {
    const baseUrl = `${window.location.origin}/?tab=player&url=${encodeURIComponent(streamUrl)}&t=${Math.floor(currentTime)}`;
    return baseUrl;
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(getShareablePlayerUrl());
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2500);
  };

  return (
    <div className={`mx-auto py-2 space-y-6 transition-all duration-300 ${isTheaterMode ? "max-w-full px-2" : "max-w-7xl"}`}>
      
      {/* Expiry Solution Banner if token is expired */}
      {streamHealth.status === "expired" && (
        <div className="bg-amber-950/40 border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-amber-200">
                    ⚠️ PW Thor Stream Token Expired ({streamHealth.httpStatus || 401})
                  </h3>
                  <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                    Session Timed Out
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                  PW Thor stream links use temporary security tokens that expire after 1–2 hours. The custom web player is 100% active, but the upstream server requires a refreshed link or a permanently saved video.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
              <button
                onClick={() => setShowRefreshGuide(true)}
                className="flex-1 md:flex-initial bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>How to Get Fresh Link</span>
              </button>

              <button
                onClick={() => {
                  setStreamUrl(PRESET_STREAMS[0].url);
                  loadStream(PRESET_STREAMS[0].url);
                }}
                className="flex-1 md:flex-initial bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play Working Test Stream</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fresh Link Help Modal */}
      {showRefreshGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                How to Solve PW Thor Link Expiration
              </h3>
              <button
                onClick={() => setShowRefreshGuide(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <span className="font-bold text-amber-400">Step 1: Open Your PW Batch or Video</span>
                <p className="text-slate-400">
                  Go to your PW lecture, click on the lecture, and copy the stream link to generate a brand new active session token.
                </p>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <span className="font-bold text-emerald-400">Step 2: Paste Fresh Link in Web Player</span>
                <p className="text-slate-400">
                  Paste the fresh URL into the box above and tap <b>"Play & Probe Stream"</b>.
                </p>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <span className="font-bold text-indigo-400">Step 3: Save to Server (Never Expires)</span>
                <p className="text-slate-400">
                  Click <b>"📥 Save Permanently"</b> or send to Telegram bot <code className="text-indigo-300">@Aura_downlaoder_bot</code> to save the MP4 forever!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowRefreshGuide(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs cursor-pointer"
            >
              Got It, Close
            </button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      {showKeybindsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-indigo-400" />
                Custom Pro Player Hotkeys & Shortcuts
              </h3>
              <button
                onClick={() => setShowKeybindsModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Play / Pause</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">Space / K</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Hold to 2x Speed</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-amber-300">Hold Space</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Rewind 10s</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-cyan-300">J / ←</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Forward 10s</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-cyan-300">L / →</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Fullscreen</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">F</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Theater Mode</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">T</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Picture-in-Picture</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">P</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Mute / Unmute</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">M</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Add Note Bookmark</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-emerald-300">B</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <span>Speed Up / Down</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">&gt; / &lt;</kbd>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between col-span-2">
                <span>Jump to 0% – 90%</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded font-mono text-indigo-300">0, 1, 2 ... 9</kbd>
              </div>
            </div>

            <button
              onClick={() => setShowKeybindsModal(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-xl text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Bookmark Note Modal */}
      {showAddNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-emerald-400" />
                Add Lecture Note at {formatTime(currentTime)}
              </h3>
              <button
                onClick={() => setShowAddNoteModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="e.g., Important derivation proof / Exam formula / Doubt timestamp..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddBookmark}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Note
                </button>
                <button
                  onClick={() => setShowAddNoteModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-400" />
                Share Custom Web Player Link
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Anyone with this link can open and watch this stream in the custom Pro Player starting directly at <b className="text-indigo-300">{formatTime(currentTime)}</b>.
            </p>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
              <input
                type="text"
                readOnly
                value={getShareablePlayerUrl()}
                className="w-full bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
              />
              <button
                onClick={copyShareLink}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 flex items-center gap-1 cursor-pointer"
              >
                {copiedShareLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedShareLink ? "Copied!" : "Copy"}</span>
              </button>
            </div>

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 rounded-xl text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Mode Selector Tabs: Live Stream vs Permanent Video Storage */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("live")}
            className={`text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "live"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <Radio className="w-4 h-4 text-indigo-300" />
            <span>Live Stream Player & Prober</span>
          </button>

          <button
            onClick={() => setActiveTab("permanent")}
            className={`text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "permanent"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                : "bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <HardDrive className="w-4 h-4 text-emerald-300" />
            <span>Permanent Video Cache ({storedVideos.length})</span>
            {storedVideos.length > 0 && (
              <span className="bg-emerald-400/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                0s Expiry
              </span>
            )}
          </button>
        </div>

        {/* Action Shortcuts & Keybinds Pill */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowKeybindsModal(true)}
            className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700/80 cursor-pointer transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
            <span>Hotkeys</span>
          </button>

          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-500/30 cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share Link</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE STREAM PLAYER */}
      {activeTab === "live" && (
        <div className="space-y-6">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Quick Streams:
            </span>
            {PRESET_STREAMS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setStreamUrl(preset.url);
                  loadStream(preset.url);
                }}
                className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                  streamUrl === preset.url
                    ? "bg-indigo-600 border-indigo-400 text-white font-bold shadow-md shadow-indigo-500/20"
                    : "bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <span>{preset.name}</span>
              </button>
            ))}
          </div>

          {/* Top Stream Input & Prober */}
          <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    ThorStream Custom Pro Player (16+ Features)
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Custom UI Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ultra-fast HLS decrypt proxy with Hold to 2x speed, 200% Audio Gain Booster, A-B Loop, Ambilight & Lecture Bookmarks.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <input
                type="text"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="Enter https://.../master.m3u8 stream URL or .mp4 link..."
                className="w-full flex-1 bg-slate-900/80 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                onClick={() => loadStream(streamUrl)}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Play className="w-4 h-4 fill-white" />
                Play & Probe
              </button>
              <button
                onClick={() => setShowPacModal(true)}
                className="w-full sm:w-auto bg-slate-900/90 hover:bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-cyan-500/10 transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center justify-center gap-1.5"
                title="Proxy Auto-Configuration: Inject cookies, spoof headers & bypass 403 Forbidden"
              >
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>PAC Helper</span>
                {pacConfig.cookie && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                )}
              </button>
              <button
                onClick={handleSaveToPermanent}
                disabled={isSavingPermanent}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center justify-center gap-1.5"
                title="Saves this video permanently to server so it never expires"
              >
                <Download className="w-4 h-4" />
                <span>{isSavingPermanent ? "Saving..." : "Save Permanently"}</span>
              </button>
            </div>

            {/* PAC Active / 403 Recovery Quick Banner */}
            {showPac403Banner && (
              <div className="mt-3 bg-cyan-950/50 border-2 border-cyan-500/50 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fade-in backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-cyan-200">
                      403 Forbidden / CORS Restriction Detected
                    </span>
                    <p className="text-[11px] text-slate-300">
                      Stream requires dynamic cookie injection or referer spoofing.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setShowPacModal(true)}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1 shadow-md shadow-cyan-500/20 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configure PAC & Cookies</span>
                  </button>
                </div>
              </div>
            )}

            {savePermanentMsg && (
              <div className="mt-3 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{savePermanentMsg}</span>
              </div>
            )}
          </section>

          {/* MAIN PRO VIDEO CANVAS & AMBILIGHT WRAPPER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={`${isTheaterMode ? "lg:col-span-12" : "lg:col-span-8"} space-y-4`}>
              
              {/* Ambilight Glowing Backdrop Container */}
              <div className="relative">
                {ambilightEnabled && (
                  <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500/25 via-cyan-500/20 to-purple-500/25 rounded-3xl blur-xl opacity-70 group-hover:opacity-100 transition-opacity -z-10"></div>
                )}

                {/* Custom Video Player Card (NO NATIVE CHROME CONTROLS) */}
                <div
                  ref={playerContainerRef}
                  className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl select-none group"
                  onMouseDown={(e) => {
                    // Start Hold to 2x on long click (ignore right click)
                    if (e.button === 0) {
                      holdTimerRef.current = setTimeout(startHold2x, 250);
                    }
                  }}
                  onMouseUp={() => {
                    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                    if (isHolding2x) endHold2x();
                  }}
                  onTouchStart={() => {
                    holdTimerRef.current = setTimeout(startHold2x, 250);
                  }}
                  onTouchEnd={() => {
                    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                    if (isHolding2x) endHold2x();
                  }}
                >
                  {/* Video Element */}
                  <div className={`relative w-full bg-black flex items-center justify-center overflow-hidden ${getAspectRatioClass()}`}>
                    <video
                      ref={videoRef}
                      className={`w-full h-full object-contain ${getVideoFilterClass()}`}
                      onPlay={() => {
                        setIsPlaying(true);
                        setStreamStatus("ready");
                      }}
                      onPause={() => setIsPlaying(false)}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedData={() => setStreamStatus("ready")}
                      onLoadedMetadata={() => setStreamStatus("ready")}
                      onCanPlay={() => setStreamStatus("ready")}
                      playsInline
                    />

                    {/* FEATURE: YouTube-Style Hold to 2x Speed Visual Banner */}
                    {isHolding2x && (
                      <div className="absolute top-4 inset-x-0 flex justify-center z-40 animate-bounce pointer-events-none">
                        <div className="bg-amber-500/90 text-slate-950 font-black text-xs sm:text-sm px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-md border border-amber-300">
                          <Zap className="w-4 h-4 fill-slate-950" />
                          <span>2X SPEED (Release to resume {previousSpeedBeforeHold}x)</span>
                        </div>
                      </div>
                    )}

                    {/* FEATURE: Seek Ripple Feedback (+10s / -10s) */}
                    {seekRipple && (
                      <div
                        className={`absolute inset-y-0 ${
                          seekRipple.type === "forward" ? "right-0 w-1/2" : "left-0 w-1/2"
                        } flex items-center justify-center bg-white/10 z-30 pointer-events-none transition-opacity duration-500`}
                      >
                        <div className="bg-slate-950/80 text-cyan-300 border border-cyan-500/30 px-4 py-2 rounded-2xl font-bold font-mono text-sm flex items-center gap-2 backdrop-blur-md shadow-2xl">
                          {seekRipple.type === "forward" ? (
                            <>
                              <span>+10s</span>
                              <RotateCw className="w-5 h-5" />
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-5 h-5" />
                              <span>-10s</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Double-Click Seek Interaction Zones */}
                    <div
                      className="absolute inset-y-0 left-0 w-1/3 cursor-pointer z-10"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        skipSeconds(-10);
                      }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 w-1/3 cursor-pointer z-10"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        skipSeconds(10);
                      }}
                    />
                    <div
                      className="absolute inset-0 cursor-pointer z-0"
                      onClick={togglePlay}
                    />

                    {/* Center Big Play Button when paused */}
                    {!isPlaying && (
                      <div
                        onClick={togglePlay}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer transition-opacity z-20"
                      >
                        <button
                          aria-label="Play video"
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/50 transform hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        >
                          <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1 fill-white" />
                        </button>
                      </div>
                    )}

                    {/* Unmute Prompt Banner */}
                    {isPlaying && isMuted && (
                      <button
                        onClick={toggleMute}
                        className="absolute top-3 right-3 z-30 bg-slate-900/90 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-700 shadow-lg flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer"
                      >
                        <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                        <span>Tap to Unmute 🔊</span>
                      </button>
                    )}

                    {/* Quick Landscape Floating Toggle (Mobile/Desktop) */}
                    <button
                      onClick={toggleLandscape}
                      className="absolute top-3 left-3 z-30 bg-slate-900/85 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-700/80 shadow-lg flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
                      title="Force Landscape Orientation (O)"
                    >
                      <Tv className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px]">{isLandscape ? "Portrait" : "Landscape Mod"}</span>
                    </button>

                    {/* Sleep Timer Countdown Badge */}
                    {sleepTimerRemaining !== null && (
                      <div className="absolute top-3 left-3 z-30 bg-slate-900/90 text-cyan-300 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border border-cyan-500/30 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-cyan-400 animate-spin" />
                        <span>Sleep: {formatTime(sleepTimerRemaining)}</span>
                      </div>
                    )}

                    {/* A-B Loop Indicator Badge */}
                    {isLoopActive && loopA !== null && loopB !== null && (
                      <div className="absolute top-12 left-3 z-30 bg-purple-900/80 text-purple-200 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border border-purple-500/30 flex items-center gap-1.5">
                        <Repeat className="w-3 h-3 text-purple-300 animate-pulse" />
                        <span>Loop: {formatTime(loopA)} ⇄ {formatTime(loopB)}</span>
                      </div>
                    )}

                    {/* Error Banner */}
                    {streamStatus === "error" && (
                      <div className="absolute inset-0 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center gap-3 z-30">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <ShieldAlert className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-100">Stream Connection Notice</h4>
                        <p className="text-xs text-slate-400 max-w-md">
                          {streamError || "PW Thor token expired. Please fetch a fresh link from PW batch or play the permanent test stream."}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 justify-center">
                          <button
                            onClick={() => {
                              setStreamUrl(PRESET_STREAMS[0].url);
                              loadStream(PRESET_STREAMS[0].url);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-500/20"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            Play Working Test Stream
                          </button>
                          <button
                            onClick={() => setShowRefreshGuide(true)}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            How to Refresh Link
                          </button>
                        </div>
                      </div>
                    )}

                    {/* CUSTOM SLEEK BOTTOM CONTROLS OVERLAY */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent p-3 sm:p-4 flex flex-col gap-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-30">
                      
                      {/* Timeline Seek Bar */}
                      <div
                        onClick={handleSeek}
                        className="relative w-full h-3 flex items-center cursor-pointer group/bar"
                      >
                        <div className="w-full bg-slate-700/60 rounded-full h-1.5 group-hover/bar:h-2 transition-all overflow-hidden relative">
                          {/* Progress fill */}
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-75 relative"
                            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                          />
                          {/* A-B Loop highlight on timeline */}
                          {loopA !== null && loopB !== null && duration > 0 && (
                            <div
                              className="absolute top-0 bottom-0 bg-purple-500/40 border-x border-purple-300"
                              style={{
                                left: `${(loopA / duration) * 100}%`,
                                width: `${((loopB - loopA) / duration) * 100}%`
                              }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Main Controls Row */}
                      <div className="flex items-center justify-between gap-2">
                        
                        {/* Left Group: Play/Pause, Skips, Volume + 200% Booster */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Play/Pause */}
                          <button
                            onClick={togglePlay}
                            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                            title={isPlaying ? "Pause (Space/K)" : "Play (Space/K)"}
                          >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5 fill-white" />}
                          </button>

                          {/* Skip -10s */}
                          <button
                            onClick={() => skipSeconds(-10)}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                            title="Rewind 10s (J)"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          {/* Skip +10s */}
                          <button
                            onClick={() => skipSeconds(10)}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                            title="Forward 10s (L)"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          {/* Volume & 200% Booster */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={toggleMute}
                              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                              title="Mute/Unmute (M)"
                            >
                              {isMuted || volume === 0 ? (
                                <VolumeX className="w-4 h-4 text-red-400" />
                              ) : volumeBoost > 100 ? (
                                <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
                              ) : (
                                <Volume1 className="w-4 h-4" />
                              )}
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={isMuted ? 0 : volume}
                              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                              className="w-14 sm:w-18 accent-indigo-500 h-1 bg-slate-700 rounded-lg cursor-pointer hidden sm:block"
                            />
                            {/* Volume Boost Toggle */}
                            <button
                              onClick={() => {
                                initAudioBooster();
                                setVolumeBoost((prev) => (prev === 100 ? 150 : prev === 150 ? 200 : 100));
                              }}
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer hidden sm:block ${
                                volumeBoost > 100
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                              title="Audio Gain Booster (Amplifies low lecture audio up to 200%)"
                            >
                              {volumeBoost}%
                            </button>
                          </div>

                          {/* Time Indicator */}
                          <div className="text-[11px] font-mono text-slate-300">
                            <span>{formatTime(currentTime)}</span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span>{duration > 0 ? formatTime(duration) : "Live"}</span>
                          </div>
                        </div>

                        {/* Right Group: Quality, Aspect, Bookmark, PiP, Theater, Fullscreen */}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          
                          {/* Quality Level Selector */}
                          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                            <Sliders className="w-3 h-3 text-indigo-400" />
                            <select
                              value={currentLevel}
                              onChange={(e) => handleLevelChange(parseInt(e.target.value, 10))}
                              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
                            >
                              <option value="-1" className="bg-slate-900 text-slate-200">⚡ Auto HD</option>
                              {levels.map((lvl) => (
                                <option key={lvl.id} value={lvl.id} className="bg-slate-900 text-slate-200">
                                  {lvl.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* PAC Helper Button in Controls */}
                          <button
                            onClick={() => setShowPacModal(true)}
                            className="p-1.5 text-cyan-300 hover:text-white hover:bg-cyan-500/20 rounded-lg cursor-pointer transition-colors"
                            title="Proxy Auto-Configuration (PAC 403 Shield)"
                          >
                            <ShieldCheck className="w-4 h-4 text-cyan-400" />
                          </button>

                          {/* Add Bookmark Note Button */}
                          <button
                            onClick={() => setShowAddNoteModal(true)}
                            className="p-1.5 text-slate-300 hover:text-emerald-400 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                            title="Add Bookmark Note (B)"
                          >
                            <Bookmark className="w-4 h-4" />
                          </button>

                          {/* PiP Button */}
                          <button
                            onClick={togglePiP}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              isPiPActive ? "text-indigo-400 bg-indigo-500/20" : "text-slate-300 hover:text-white hover:bg-white/10"
                            }`}
                            title="Picture-in-Picture (P)"
                          >
                            <PictureInPicture2 className="w-4 h-4" />
                          </button>

                          {/* Theater Mode Button */}
                          <button
                            onClick={() => setIsTheaterMode((prev) => !prev)}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors hidden sm:block ${
                              isTheaterMode ? "text-cyan-400 bg-cyan-500/20" : "text-slate-300 hover:text-white hover:bg-white/10"
                            }`}
                            title="Theater Mode (T)"
                          >
                            <Film className="w-4 h-4" />
                          </button>

                          {/* Landscape Mode Button */}
                          <button
                            onClick={toggleLandscape}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              isLandscape ? "text-indigo-400 bg-indigo-500/20" : "text-slate-300 hover:text-white hover:bg-white/10"
                            }`}
                            title="Landscape Mode (O)"
                          >
                            <Tv className="w-4 h-4" />
                          </button>

                          {/* Fullscreen Button */}
                          <button
                            onClick={toggleFullscreen}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                            title="Fullscreen (F)"
                          >
                            <Maximize className="w-4 h-4" />
                          </button>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* QUICK PRO TOOLBAR: Speed, A-B Loop, Video Filters, Aspect Ratio & Sleep Timer */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 backdrop-blur-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  
                  {/* Speed Controls */}
                  <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                    <span className="text-slate-400 px-2 font-medium flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Speed:
                    </span>
                    {[0.75, 1.0, 1.25, 1.5, 2.0, 2.5].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => setSpeed(spd)}
                        className={`px-2 py-1 rounded font-mono transition-all cursor-pointer ${
                          playbackSpeed === spd
                            ? "bg-indigo-600 text-white font-bold"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>

                  {/* Aspect Ratio Switcher */}
                  <div className="flex items-center space-x-1 bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                    <span className="text-slate-400 px-2 font-medium">Aspect:</span>
                    {(["16:9", "4:3", "cover", "contain"] as const).map((asp) => (
                      <button
                        key={asp}
                        onClick={() => setAspectRatio(asp)}
                        className={`px-2 py-1 rounded transition-all cursor-pointer uppercase text-[10px] font-bold ${
                          aspectRatio === asp
                            ? "bg-cyan-600 text-white font-bold"
                            : "text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {asp}
                      </button>
                    ))}
                  </div>

                  {/* Video Filter (Eye Care / Night Mode) */}
                  <div className="flex items-center space-x-1 bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                    <span className="text-slate-400 px-2 font-medium flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" /> Filter:
                    </span>
                    {(["normal", "night", "warm", "contrast", "invert"] as const).map((flt) => (
                      <button
                        key={flt}
                        onClick={() => setVideoFilter(flt)}
                        className={`px-2 py-1 rounded transition-all cursor-pointer capitalize text-[10px] font-semibold ${
                          videoFilter === flt
                            ? "bg-emerald-600 text-white"
                            : "text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {flt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Secondary Row: A-B Loop & Sleep Timer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
                  {/* A-B Loop Controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Repeat className="w-3.5 h-3.5 text-purple-400" /> A-B Loop:
                    </span>
                    <button
                      onClick={() => setLoopA(currentTime)}
                      className={`px-2 py-1 rounded-lg border font-mono cursor-pointer ${
                        loopA !== null ? "bg-purple-600/30 border-purple-500 text-purple-200 font-bold" : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      A: {loopA !== null ? formatTime(loopA) : "Set Start"}
                    </button>
                    <button
                      onClick={() => setLoopB(currentTime)}
                      className={`px-2 py-1 rounded-lg border font-mono cursor-pointer ${
                        loopB !== null ? "bg-purple-600/30 border-purple-500 text-purple-200 font-bold" : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      B: {loopB !== null ? formatTime(loopB) : "Set End"}
                    </button>
                    <button
                      onClick={() => {
                        if (loopA !== null && loopB !== null && loopA < loopB) {
                          setIsLoopActive((prev) => !prev);
                        }
                      }}
                      disabled={loopA === null || loopB === null || loopA >= loopB}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer disabled:opacity-40 transition-colors ${
                        isLoopActive ? "bg-purple-600 text-white font-bold" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {isLoopActive ? "Looping On" : "Start Loop"}
                    </button>
                    {(loopA !== null || loopB !== null) && (
                      <button
                        onClick={() => {
                          setLoopA(null);
                          setLoopB(null);
                          setIsLoopActive(false);
                        }}
                        className="text-slate-500 hover:text-red-400 cursor-pointer p-1"
                        title="Clear Loop"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Sleep Timer Preset */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" /> Sleep Timer:
                    </span>
                    {[15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setSleepTimer(sleepTimerMinutes === mins ? null : mins)}
                        className={`px-2 py-1 rounded-lg font-mono cursor-pointer ${
                          sleepTimerMinutes === mins
                            ? "bg-cyan-600 text-white font-bold"
                            : "bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                    {sleepTimerMinutes !== null && (
                      <button
                        onClick={() => setSleepTimer(null)}
                        className="text-slate-500 hover:text-red-400 cursor-pointer p-1"
                        title="Cancel Timer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* SIDEBAR: Lecture Notes & Bookmarks + Diagnostic Tools */}
            <div className={`${isTheaterMode ? "lg:col-span-12" : "lg:col-span-4"} space-y-5`}>
              
              {/* Lecture Notes & Bookmarks Card */}
              <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 shadow-xl space-y-3 backdrop-blur-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Bookmark className="w-4 h-4 text-emerald-400" />
                    <span>Lecture Notes ({bookmarks.length})</span>
                  </h3>
                  {bookmarks.length > 0 && (
                    <button
                      onClick={handleExportNotes}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export MD</span>
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {bookmarks.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs space-y-2">
                      <FileText className="w-8 h-8 mx-auto opacity-30" />
                      <p>No timestamp notes yet.</p>
                      <button
                        onClick={() => setShowAddNoteModal(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
                      >
                        + Add Note at {formatTime(currentTime)}
                      </button>
                    </div>
                  ) : (
                    bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-start justify-between gap-2 hover:border-emerald-500/40 transition-colors"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.currentTime = bm.time;
                            }
                          }}
                        >
                          <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 mr-2">
                            {bm.formattedTime}
                          </span>
                          <span className="text-xs text-slate-200">{bm.note}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteBookmark(bm.id)}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Stream Diagnostic & Token Status Card */}
              <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 shadow-xl space-y-3 backdrop-blur-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Stream Diagnostic</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    streamHealth.status === "active"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : streamHealth.status === "expired"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  }`}>
                    {streamHealth.status.toUpperCase()}
                  </span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300 bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-slate-500">HTTP Status:</span>
                    <span className="font-mono font-bold text-slate-200">{streamHealth.httpStatus || 200} OK</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-slate-500">Audio Booster:</span>
                    <span className="font-mono font-bold text-amber-400">{volumeBoost}% Gain</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 bg-slate-900/80 p-2 rounded-lg">
                    <span className="text-slate-500">VLC / MX URL:</span>
                    <button
                      onClick={copyVlcLink}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer flex items-center gap-1"
                    >
                      {copiedVlc ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700/60 flex gap-2">
                  <button
                    onClick={copyFfmpegCmd}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedCmd ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>1000x FFmpeg</span>
                  </button>
                  <a
                    href="https://t.me/Aura_downlaoder_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Bot</span>
                  </a>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PERMANENT VIDEO VAULT */}
      {activeTab === "permanent" && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-400" />
                Permanent Server Video Vault
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Videos saved here NEVER expire. You can stream instantly online or download the full MP4 to your device.
              </p>
            </div>
            <button
              onClick={fetchStoredVideos}
              className="bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Vault</span>
            </button>
          </div>

          {storedVideos.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Film className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-300">No Permanently Saved Videos Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Paste any live lecture link in the Live Stream Player tab and click <b>"Save Permanently"</b> to store it forever on the server.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {storedVideos.map((vid) => (
                <div
                  key={vid.fileId}
                  className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between space-y-3 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        {vid.quality || "1080p HD"}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{vid.fileSizeMB} MB</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-100 line-clamp-2">{vid.filename}</h4>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setStreamUrl(vid.streamUrl);
                        setActiveTab("live");
                        loadStream(vid.streamUrl);
                      }}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Play in App</span>
                    </button>
                    <a
                      href={vid.downloadUrl}
                      download
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs p-2 rounded-xl border border-slate-700 cursor-pointer"
                      title="Download MP4"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Proxy Auto-Configuration (PAC) Helper Modal */}
      <ProxyConfigModal
        isOpen={showPacModal}
        onClose={() => setShowPacModal(false)}
        streamUrl={streamUrl}
        pacConfig={pacConfig}
        onSavePacConfig={handleSavePacConfig}
      />

    </div>
  );
};
