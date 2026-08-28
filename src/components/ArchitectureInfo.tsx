import React from "react";
import { Zap, ShieldCheck, Cpu, HardDrive, Play, ArrowRight, Sparkles } from "lucide-react";

export const ArchitectureInfo: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto py-2 space-y-6">
      {/* Top Banner */}
      <section className="glass-card-light rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600">
            <Zap className="w-5 h-5 fill-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950 tracking-tight flex items-center gap-2">
              1000x Gigabit Architecture & Limit Bypass Breakdown
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Technical overview of MTProto v2 direct socket streaming, 512-thread parallel chunking, and self-healing stream proxying.
            </p>
          </div>
        </div>
      </section>

      {/* 4 Pillars of High Speed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pillar 1 */}
        <section className="glass-card-light rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-950">1. Pyrogram MTProto 2GB Limit Bypass</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Standard Telegram bots using HTTP Bot API (<code className="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">api.telegram.org</code>) are restricted to a strict <strong>50 MB limit</strong>.
            ThorStream utilizes <strong>Pyrogram with MTProto v2 protocol</strong>, communicating directly with Telegram Data Centers using TgCrypto C-extensions.
            This unlocks up to <strong>2,000 MB (2 GB)</strong> uploads for all users.
          </p>
          <div className="bg-slate-950 rounded-2xl p-3.5 text-xs font-mono text-emerald-400 flex items-center justify-between shadow-inner">
            <span className="text-rose-400">HTTP API: 50MB (❌)</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-emerald-300 font-bold">MTProto: 2,000MB (✅ 100% Unlimited)</span>
          </div>
        </section>

        {/* Pillar 2 */}
        <section className="glass-card-light rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-950">2. 512-Socket Parallel Async Chunking</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            HLS (.m3u8) streams consist of hundreds of short 2–6 second <code className="bg-slate-100 text-cyan-700 px-1.5 py-0.5 rounded font-mono">.ts</code> video segments.
            Instead of single-threaded downloading, ThorStream parses the master playlist and allocates <strong>512 concurrent async download workers</strong> with TCP socket reuse, saturating maximum broadband speed.
          </p>
          <div className="bg-slate-950 rounded-2xl p-3.5 text-xs font-mono text-cyan-300 shadow-inner">
            <span>⚡ TCP Keep-Alive Pool: 2048 Sockets | Concurrency: 512 Parallel Streams</span>
          </div>
        </section>

        {/* Pillar 3 */}
        <section className="glass-card-light rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Play className="w-6 h-6 fill-amber-500" />
          </div>
          <h3 className="text-base font-black text-slate-950">3. Faststart MOOV Atom & Self-Healing Stream</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            ThorStream executes <code className="bg-slate-100 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold">-movflags +faststart</code>, relocating metadata indices to the first bytes of the video. If an upstream CloudFront token expires, the self-healing proxy reconstructs the stream so playback and downloading never fail!
          </p>
          <div className="bg-slate-950 rounded-2xl p-3.5 text-xs font-mono text-amber-300 shadow-inner">
            <span>▶️ Instant Zero-Buffer Playback with Automatic Expired Link Repair</span>
          </div>
        </section>

        {/* Pillar 4 */}
        <section className="glass-card-light rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <HardDrive className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-950">4. 16:9 HD Thumbnail Extraction</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Auto-extracts frame at timestamp <code className="bg-slate-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono font-bold">00:00:02</code> with precision 1280x720 letterbox padding, creating rich native previews in Telegram and player interfaces.
          </p>
          <div className="bg-slate-950 rounded-2xl p-3.5 text-xs font-mono text-emerald-300 shadow-inner">
            <span>🖼️ 1280x720 HD 16:9 Thumbnail Rendered for Chat Previews</span>
          </div>
        </section>
      </div>
    </div>
  );
};
