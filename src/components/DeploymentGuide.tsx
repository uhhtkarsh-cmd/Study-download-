import React, { useState } from "react";
import { Server, Terminal, Layers, Smartphone, Copy, Check, ShieldCheck, Zap, Globe } from "lucide-react";

export const DeploymentGuide: React.FC = () => {
  const [activePlatform, setActivePlatform] = useState<"vps" | "cloud" | "docker" | "termux">("vps");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto py-2 space-y-5">
      {/* Platform Tabs */}
      <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-xs">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActivePlatform("vps")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activePlatform === "vps"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Ubuntu / Debian VPS (Recommended 24/7)</span>
          </button>

          <button
            onClick={() => setActivePlatform("cloud")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activePlatform === "cloud"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Koyeb / Render / Railway (Cloud 24/7)</span>
          </button>

          <button
            onClick={() => setActivePlatform("docker")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activePlatform === "docker"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Docker & Docker Compose</span>
          </button>

          <button
            onClick={() => setActivePlatform("termux")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activePlatform === "termux"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Android (Termux 24/7)</span>
          </button>
        </div>
      </section>

      {/* Guide Content */}
      <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur-xs">
        {/* VPS SECTION */}
        {activePlatform === "vps" && (
          <div className="space-y-6">
            <div className="border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-400" />
                1-Click 24/7 Setup on Linux VPS (Ubuntu / Debian)
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Using systemd service to guarantee 100% uptime with automatic restart on crashes and server reboots.
              </p>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Step 1: Upload / Unzip Files & Run Setup Script
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# Connect to your VPS and run:\nsudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg unzip\n\n# Unzip bot files into /opt/thorstream\nsudo mkdir -p /opt/thorstream && cd /opt/thorstream\n# (Extract ThorStream_Telegram_Bot_Package.zip here)\n\nchmod +x setup_vps.sh\nsudo ./setup_vps.sh`,
                      "vps_step1"
                    )
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium transition-colors"
                >
                  {copiedId === "vps_step1" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === "vps_step1" ? "Copied" : "Copy Commands"}
                </button>
              </div>

              <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 font-mono text-xs text-cyan-300 overflow-x-auto shadow-inner">
                <p className="text-slate-500"># Connect to your VPS and install dependencies:</p>
                <p>sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg unzip</p>
                <p className="text-slate-500 mt-2"># Run the automated installer:</p>
                <p>chmod +x setup_vps.sh</p>
                <p>sudo ./setup_vps.sh</p>
              </div>
            </div>

            {/* Step 2: Systemd commands */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Step 2: Check Bot Status & Live Logs
              </h4>

              <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto shadow-inner">
                <p className="text-green-400"># Check if bot is running:</p>
                <p>sudo systemctl status thorstream</p>
                <p className="text-green-400 mt-2"># View live download logs in realtime:</p>
                <p>sudo journalctl -u thorstream -f</p>
                <p className="text-green-400 mt-2"># Restart bot anytime:</p>
                <p>sudo systemctl restart thorstream</p>
              </div>
            </div>
          </div>
        )}

        {/* CLOUD HOSTING SECTION */}
        {activePlatform === "cloud" && (
          <div className="space-y-6">
            <div className="border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                Deploy on Koyeb / Render / Railway (24/7 Cloud Free Tier)
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                The bot includes an internal web server (<code className="text-indigo-300">server_alive.py</code> on port 8080) to pass cloud health-checks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 space-y-2.5">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-400" /> Koyeb (Recommended)
                </h4>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <li>Push your bot files to a GitHub repository.</li>
                  <li>Go to <strong>Koyeb.com</strong> and click <strong>Create Service</strong>.</li>
                  <li>Select your GitHub repo and choose <strong>Dockerfile</strong>.</li>
                  <li>Set Port to <code className="text-indigo-300">8080</code>.</li>
                  <li>Click <strong>Deploy</strong> — Your bot is live 24/7!</li>
                </ol>
              </div>

              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 space-y-2.5">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-400" /> 24/7 Keep Awake (Anti-Sleep)
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  To prevent free tiers from idling:
                </p>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1">
                  <li>Copy your app URL (e.g. <code className="text-cyan-300">https://your-bot.koyeb.app/health</code>).</li>
                  <li>Go to <strong>UptimeRobot.com</strong> (Free).</li>
                  <li>Add an HTTP Monitor pointing to <code className="text-cyan-300">/health</code> every 5 minutes.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* DOCKER SECTION */}
        {activePlatform === "docker" && (
          <div className="space-y-6">
            <div className="border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Run with Docker & Docker Compose
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Lightweight containerized deployment with bundled high-performance FFmpeg.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Run Docker Compose (1 Command)
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# Start in background:\ndocker compose up -d --build\n\n# View live logs:\ndocker logs -f thorstream_telegram_bot`,
                      "docker_cmd"
                    )
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium transition-colors"
                >
                  {copiedId === "docker_cmd" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === "docker_cmd" ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 font-mono text-xs text-cyan-300 space-y-1 overflow-x-auto shadow-inner">
                <p>docker compose up -d --build</p>
                <p className="text-slate-500 mt-1"># Follow logs:</p>
                <p>docker logs -f thorstream_telegram_bot</p>
              </div>
            </div>
          </div>
        )}

        {/* TERMUX SECTION */}
        {activePlatform === "termux" && (
          <div className="space-y-6">
            <div className="border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-green-400" />
                Run on Android Phone 24/7 using Termux
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Turn an old or active Android phone into a 24/7 Telegram video downloading server!
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Termux Commands:
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# 1. Update and install packages:\npkg update && pkg upgrade -y\npkg install python ffmpeg git -y\n\n# 2. Prevent Android from sleeping:\ntermux-wake-lock\n\n# 3. Install bot requirements:\npip install pyrofork tgcrypto aiohttp aiofiles m3u8 pillow python-dotenv requests\n\n# 4. Start the bot:\npython bot.py`,
                      "termux_cmd"
                    )
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium transition-colors"
                >
                  {copiedId === "termux_cmd" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === "termux_cmd" ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="bg-[#0B1120]/80 border border-slate-700/80 rounded-xl p-3 font-mono text-xs text-cyan-300 space-y-1.5 overflow-x-auto shadow-inner">
                <p className="text-slate-500"># Install Python & FFmpeg in Termux:</p>
                <p>pkg update && pkg install python ffmpeg -y</p>
                <p className="text-slate-500 mt-2"># Keep Termux awake 24/7:</p>
                <p>termux-wake-lock</p>
                <p className="text-slate-500 mt-2"># Install dependencies & run:</p>
                <p>pip install pyrofork tgcrypto aiohttp aiofiles m3u8 pillow python-dotenv requests</p>
                <p>python bot.py</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
