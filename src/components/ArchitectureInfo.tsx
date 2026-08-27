import React from "react";
import { Zap, ShieldCheck, Cpu, HardDrive, Play, ArrowRight } from "lucide-react";

export const ArchitectureInfo: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto py-2 space-y-5">
      {/* Top Banner */}
      <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl backdrop-blur-xs">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-400 fill-indigo-400" />
          1000x Ultra-Speed Architecture & Limit Bypass Breakdown
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Detailed technical breakdown of how ThorStream Bot bypasses Telegram's 50MB Bot API cap and achieves maximum possible download & upload throughput.
        </p>
      </section>

      {/* 4 Pillars of High Speed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Pillar 1 */}
        <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-3 backdrop-blur-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">1. Pyrogram MTProto 2GB Limit Bypass</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Standard Telegram bots using HTTP Bot API (<code className="text-cyan-300">api.telegram.org</code>) are restricted to a strict <strong>50 MB limit</strong>.
            ThorStream utilizes <strong>Pyrogram with MTProto v2 protocol</strong>, communicating directly with Telegram Data Centers using TgCrypto C-extensions.
            This raises the limit to <strong>2,000 MB (2 GB)</strong> for standard users and <strong>4,000 MB (4 GB)</strong> for Telegram Premium.
          </p>
          <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 text-[11px] font-mono text-green-400 flex items-center justify-between shadow-inner">
            <span>HTTP Bot API: 50 MB (❌ Blocked)</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-indigo-400 font-bold">Pyrogram MTProto: 2 GB (✅ 1000% Working)</span>
          </div>
        </section>

        {/* Pillar 2 */}
        <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-3 backdrop-blur-xs">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">2. 128-Thread Async Chunking Engine</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            HLS (.m3u8) streams consist of hundreds of short 2–6 second <code className="text-cyan-300">.ts</code> video segment files.
            Instead of single-threaded linear downloading, ThorStream parses the master playlist and allocates <strong>128 concurrent async download workers</strong> with TCP connection reuse, saturating full Gigabit network pipelines.
          </p>
          <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 text-[11px] font-mono text-cyan-300 shadow-inner">
            <span>⚡ TCP Pool: 512 Active Sockets | Concurrency: 128 Parallel Fetch Tasks</span>
          </div>
        </section>

        {/* Pillar 3 */}
        <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-3 backdrop-blur-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Play className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">3. Faststart MOOV Atom Streaming</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Normal MP4 files store the index header (MOOV atom) at the very end of the file, forcing users to wait until 100% of the video is downloaded before Telegram can start playing.
            ThorStream executes <code className="text-indigo-300">-movflags +faststart</code> and <code className="text-indigo-300">supports_streaming=True</code>, shifting metadata to the first bytes so users can stream instantly!
          </p>
          <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 text-[11px] font-mono text-indigo-300 shadow-inner">
            <span>▶️ Instant Playback in Telegram Video Player without buffering delay</span>
          </div>
        </section>

        {/* Pillar 4 */}
        <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-3 backdrop-blur-xs">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">4. 16:9 Thumbnail Extraction Pipeline</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Auto-extracts frame at timestamp <code className="text-green-400">00:00:01</code> with precision scaling:
            <br />
            <code className="text-slate-300 text-[10px] block mt-1.5 bg-[#0B1120]/80 border border-slate-700/80 p-2 rounded-lg font-mono">
              -vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2
            </code>
            This guarantees pristine 16:9 display in Telegram chats and previews on iOS, Android, and Desktop.
          </p>
        </section>
      </div>
    </div>
  );
};
