import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Globe,
  Sliders,
  Check,
  RefreshCw,
  Copy,
  AlertTriangle,
  X,
  Server,
  Lock,
  Layers,
  Sparkles,
  Terminal,
  Activity
} from "lucide-react";

export interface PacConfig {
  enabled: boolean;
  profile: "auto" | "pwthor" | "cloudfront" | "akamai" | "custom";
  cookie: string;
  referer: string;
  origin: string;
  userAgent: string;
  authorization: string;
  autoFix403: boolean;
}

export const DEFAULT_PAC_CONFIG: PacConfig = {
  enabled: true,
  profile: "auto",
  cookie: "",
  referer: "",
  origin: "",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  authorization: "",
  autoFix403: true,
};

interface ProxyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamUrl: string;
  pacConfig: PacConfig;
  onSavePacConfig: (config: PacConfig, reloadStream?: boolean) => void;
}

export const ProxyConfigModal: React.FC<ProxyConfigModalProps> = ({
  isOpen,
  onClose,
  streamUrl,
  pacConfig,
  onSavePacConfig,
}) => {
  const [config, setConfig] = useState<PacConfig>(pacConfig);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    httpStatus?: number;
    latencyMs?: number;
    message?: string;
    isM3u8?: boolean;
    injectedHeaders?: {
      hasCookie: boolean;
      cookiePreview?: string;
      referer?: string;
      origin?: string;
    };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setConfig(pacConfig);
    setTestResult(null);
  }, [pacConfig, isOpen]);

  // Auto-detect domain recommendation
  const detectedDomain = React.useMemo(() => {
    try {
      if (streamUrl.startsWith("http")) {
        const u = new URL(streamUrl);
        return u.host;
      }
    } catch {}
    return "Target Host";
  }, [streamUrl]);

  const handleApplyPreset = (profile: PacConfig["profile"]) => {
    let newConf: PacConfig = { ...config, profile };

    if (profile === "auto") {
      newConf.referer = "";
      newConf.origin = "";
    } else if (profile === "pwthor") {
      newConf.referer = "https://pwthor.live/";
      newConf.origin = "https://pwthor.live";
      if (!newConf.cookie) {
        newConf.cookie = "pw_auth=verified; session_tier=ultra_gigabit";
      }
    } else if (profile === "cloudfront") {
      if (streamUrl.startsWith("http")) {
        try {
          const u = new URL(streamUrl);
          newConf.referer = `${u.protocol}//${u.host}/`;
          newConf.origin = `${u.protocol}//${u.host}`;
        } catch {}
      }
      if (!newConf.cookie) {
        newConf.cookie = "CloudFront-Policy=eyJTdGF0ZW1lbnQiOlt7...; CloudFront-Key-Pair-Id=K2JCXYZ";
      }
    } else if (profile === "akamai") {
      newConf.referer = "https://cph-p2p-msl.akamaized.net/";
      newConf.origin = "https://cph-p2p-msl.akamaized.net";
    }

    setConfig(newConf);
  };

  const handleTestConnection = async () => {
    if (!streamUrl.trim()) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/pac/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: streamUrl.trim(),
          cookie: config.cookie,
          referer: config.referer,
          origin: config.origin,
          userAgent: config.userAgent,
          authorization: config.authorization,
          profile: config.profile,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({
        success: false,
        httpStatus: 0,
        message: e.message || "Failed to reach PAC test endpoint",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleOneClickAutoFix = () => {
    const isPw = streamUrl.includes("pwthor") || streamUrl.includes("penpencil") || streamUrl.includes("pw.live");
    const updated: PacConfig = {
      ...config,
      enabled: true,
      profile: isPw ? "pwthor" : "auto",
      referer: isPw ? "https://pwthor.live/" : (streamUrl.startsWith("http") ? new URL(streamUrl).origin + "/" : ""),
      origin: isPw ? "https://pwthor.live" : (streamUrl.startsWith("http") ? new URL(streamUrl).origin : ""),
      cookie: isPw && !config.cookie ? "pw_auth=token_injected; device_session=active" : config.cookie,
      autoFix403: true,
    };
    setConfig(updated);
    onSavePacConfig(updated, true);
    onClose();
  };

  const handleSaveAndApply = () => {
    onSavePacConfig(config, true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-950/95 border border-cyan-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl text-slate-200 my-8">
        {/* Ambient Top Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-gradient-to-r from-violet-600/30 via-cyan-500/30 to-emerald-500/30 blur-2xl pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Proxy Auto-Configuration (PAC) Helper
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  403 Shield Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic CORS bypass, cookie injection & origin spoofing for cross-network streams
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Stream Overview */}
        <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 truncate pr-2">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-slate-400">Target Host:</span>
            <span className="text-cyan-300 font-bold truncate">{detectedDomain}</span>
          </div>
          <button
            onClick={handleOneClickAutoFix}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 hover:brightness-110 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>1-Click 403 Auto-Fix</span>
          </button>
        </div>

        {/* Profiles Preset Tabs */}
        <div className="mt-5 space-y-1.5">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>Bypass Profile Preset</span>
            <span className="text-[11px] text-cyan-400 font-normal">Selects optimized headers for target CDN</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: "auto", name: "⚡ Auto Smart", desc: "Universal CORS + Origin" },
              { id: "pwthor", name: "🛡️ PW / PenPencil", desc: "Spoofs pwthor & penpencil" },
              { id: "cloudfront", name: "☁️ CloudFront", desc: "Signed Cookies / Tokens" },
              { id: "custom", name: "🛠️ Custom PAC", desc: "Full Manual Injections" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.id as any)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  config.profile === p.id
                    ? "bg-cyan-500/20 border-cyan-400/50 text-white shadow-sm shadow-cyan-500/20"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                <div className="font-bold text-xs">{p.name}</div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Cookie Injection */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Dynamic Cookie Injection</span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {config.cookie ? "Cookie Active" : "No Cookie (Optional)"}
            </span>
          </div>
          <textarea
            value={config.cookie}
            onChange={(e) => setConfig({ ...config, cookie: e.target.value })}
            placeholder="e.g. pw_auth=xyz; session_id=abc; CloudFront-Key-Pair-Id=K2JC..."
            rows={2}
            className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-cyan-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-none"
          />
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>Quick Sample:</span>
            <button
              type="button"
              onClick={() => setConfig({ ...config, cookie: "pw_auth=active_verified; session_tier=ultra_fast; device=pc" })}
              className="text-cyan-400 hover:underline cursor-pointer"
            >
              + PW Auth Cookie
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => setConfig({ ...config, cookie: "" })}
              className="text-slate-400 hover:text-rose-300 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Referer & Origin Overrides */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Custom Referer Header</label>
            <input
              type="text"
              value={config.referer}
              onChange={(e) => setConfig({ ...config, referer: e.target.value })}
              placeholder="e.g. https://pwthor.live/ or https://penpencil.co/"
              className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Custom Origin Header</label>
            <input
              type="text"
              value={config.origin}
              onChange={(e) => setConfig({ ...config, origin: e.target.value })}
              placeholder="e.g. https://pwthor.live"
              className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Authorization Header & Auto-Fix Switch */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Authorization / Bearer Token</label>
            <input
              type="text"
              value={config.authorization}
              onChange={(e) => setConfig({ ...config, authorization: e.target.value })}
              placeholder="Bearer eyJhbGciOi..."
              className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 mt-auto">
            <div>
              <div className="text-xs font-bold text-slate-200">Auto-Recover 403 Errors</div>
              <div className="text-[10px] text-slate-400">Auto-switch to PAC tunnel on failure</div>
            </div>
            <input
              type="checkbox"
              checked={config.autoFix403}
              onChange={(e) => setConfig({ ...config, autoFix403: e.target.checked })}
              className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Test Connection Result Box */}
        {testResult && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs font-mono space-y-1.5 animate-fade-in ${
              testResult.success
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : testResult.httpStatus === 403
                ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                : "bg-rose-950/40 border-rose-500/40 text-rose-300"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <div className="flex items-center gap-1.5">
                {testResult.success ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                )}
                <span>HTTP Status: {testResult.httpStatus || "Failed"}</span>
              </div>
              {testResult.latencyMs && <span>{testResult.latencyMs}ms Response</span>}
            </div>
            <div className="text-[11px] leading-relaxed">{testResult.message}</div>
            {testResult.injectedHeaders && (
              <div className="text-[10px] text-slate-300 bg-black/40 p-2 rounded-xl border border-white/10 space-y-0.5 mt-1">
                <div>• Cookie Injected: {testResult.injectedHeaders.hasCookie ? "Yes" : "None"}</div>
                <div>• Referer Spoofed: {testResult.injectedHeaders.referer || "Default Auto"}</div>
                <div>• Origin Spoofed: {testResult.injectedHeaders.origin || "Default Auto"}</div>
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !streamUrl.trim()}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Activity className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
            <span>{isTesting ? "Testing PAC Tunnel..." : "Test PAC Connection"}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 cursor-pointer transition-all border border-white/15"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Reload Stream</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
