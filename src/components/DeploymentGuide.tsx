import React, { useState } from "react";
import { Server, Terminal, Layers, Smartphone, Copy, Check, ShieldCheck, Zap, Globe, Sparkles } from "lucide-react";

export const DeploymentGuide: React.FC = () => {
  const [activePlatform, setActivePlatform] = useState<"vps" | "cloud" | "docker" | "termux">("vps");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto py-2 space-y-6">
      {/* Platform Tabs (Modern Pill Selector) */}
      <section className="glass-card-light rounded-3xl p-3 sm:p-4 border border-slate-200/90 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "vps" as const, label: "Ubuntu / Debian VPS (24/7 Dedicated)", icon: Server },
            { id: "cloud" as const, label: "Koyeb / Render / Railway (Cloud Free)", icon: Globe },
            { id: "docker" as const, label: "Docker & Compose Container", icon: Layers },
            { id: "termux" as const, label: "Android Phone (Termux 24/7)", icon: Smartphone },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activePlatform === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePlatform(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-950 text-white shadow-md shadow-slate-950/15"
                    : "bg-white/80 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-indigo-300" : "text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Guide Content */}
      <section className="glass-card-light rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
        {/* VPS SECTION */}
        {activePlatform === "vps" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-lg font-black text-slate-950 flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-600" />
                1-Click 24/7 Setup on Linux VPS (Ubuntu / Debian)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Using systemd service to guarantee 100% uptime with automatic restart on crashes and server reboots.
              </p>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Step 1: Install Dependencies & Run Setup Script
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# Connect to your VPS and run:\nsudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg unzip\n\n# Unzip bot files into /opt/thorstream\nsudo mkdir -p /opt/thorstream && cd /opt/thorstream\n# (Extract ThorStream_Telegram_Bot_Package.zip here)\n\nchmod +x setup_vps.sh\nsudo ./setup_vps.sh`,
                      "vps_step1"
                    )
                  }
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-bold transition-colors"
                >
                  {copiedId === "vps_step1" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === "vps_step1" ? "Copied" : "Copy Commands"}</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-2xl p-4 font-mono text-xs text-cyan-300 overflow-x-auto shadow-inner border border-slate-800">
                <p className="text-slate-500"># Connect to your VPS and install dependencies:</p>
                <p className="text-slate-100">sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg unzip</p>
                <p className="text-slate-500 mt-2"># Run the automated installer:</p>
                <p className="text-slate-100">chmod +x setup_vps.sh</p>
                <p className="text-indigo-400 font-bold">sudo ./setup_vps.sh</p>
              </div>
            </div>

            {/* Step 2: Systemd commands */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Step 2: Check Bot Status & Real-time Live Logs
              </h4>

              <div className="bg-slate-950 rounded-2xl p-4 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto shadow-inner border border-slate-800">
                <p className="text-emerald-400"># Check if bot is running:</p>
                <p className="text-slate-100">sudo systemctl status thorstream</p>
                <p className="text-emerald-400 mt-2"># View live download logs in realtime:</p>
                <p className="text-slate-100">sudo journalctl -u thorstream -f</p>
                <p className="text-emerald-400 mt-2"># Restart bot anytime:</p>
                <p className="text-slate-100">sudo systemctl restart thorstream</p>
              </div>
            </div>
          </div>
        )}

        {/* CLOUD HOSTING SECTION */}
        {activePlatform === "cloud" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-lg font-black text-slate-950 flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                Deploy on Koyeb / Render / Railway (24/7 Cloud Free Tier)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                The bot includes an internal web server (<code className="text-indigo-600 font-bold">server_alive.py</code> on port 8080) to pass cloud health-checks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xs">
                <h4 className="text-sm font-black text-slate-950 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" /> Koyeb Deployment
                </h4>
                <ol className="list-decimal list-inside text-xs text-slate-600 space-y-2 leading-relaxed">
                  <li>Push your bot files to a GitHub repository.</li>
                  <li>Go to <strong>Koyeb.com</strong> and click <strong>Create Service</strong>.</li>
                  <li>Select your GitHub repo and choose <strong>Dockerfile</strong>.</li>
                  <li>Set Port to <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono font-bold">8080</code>.</li>
                  <li>Click <strong>Deploy</strong> — Your bot is live 24/7!</li>
                </ol>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xs">
                <h4 className="text-sm font-black text-slate-950 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> 24/7 Keep-Alive (Anti-Sleep)
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  To prevent free cloud instances from sleeping:
                </p>
                <ol className="list-decimal list-inside text-xs text-slate-600 space-y-2">
                  <li>Copy your app URL (e.g. <code className="bg-slate-100 text-cyan-700 px-1.5 py-0.5 rounded font-mono">https://your-bot.koyeb.app/health</code>).</li>
                  <li>Go to <strong>UptimeRobot.com</strong> (Free).</li>
                  <li>Add an HTTP Monitor pointing to <code className="bg-slate-100 text-cyan-700 px-1.5 py-0.5 rounded font-mono">/health</code> every 5 minutes.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* DOCKER SECTION */}
        {activePlatform === "docker" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-lg font-black text-slate-950 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-600" />
                Run with Docker & Docker Compose
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Lightweight containerized deployment with bundled high-performance FFmpeg.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Run Docker Compose (1 Command)
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# Start in background:\ndocker compose up -d --build\n\n# View live logs:\ndocker logs -f thorstream_telegram_bot`,
                      "docker_cmd"
                    )
                  }
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-bold transition-colors"
                >
                  {copiedId === "docker_cmd" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === "docker_cmd" ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-2xl p-4 font-mono text-xs text-cyan-300 space-y-1.5 overflow-x-auto shadow-inner border border-slate-800">
                <p className="text-slate-100">docker compose up -d --build</p>
                <p className="text-slate-500 mt-1"># Follow logs:</p>
                <p className="text-slate-300">docker logs -f thorstream_telegram_bot</p>
              </div>
            </div>
          </div>
        )}

        {/* TERMUX SECTION */}
        {activePlatform === "termux" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-lg font-black text-slate-950 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                Run on Android Phone 24/7 using Termux
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Turn an old or active Android phone into a 24/7 Telegram video downloading server!
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Termux Commands:
                </h4>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `# 1. Update and install packages:\npkg update && pkg upgrade -y\npkg install python ffmpeg git -y\n\n# 2. Prevent Android from sleeping:\ntermux-wake-lock\n\n# 3. Install bot requirements:\npip install pyrofork tgcrypto aiohttp aiofiles m3u8 pillow python-dotenv requests\n\n# 4. Start the bot:\npython bot.py`,
                      "termux_cmd"
                    )
                  }
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-bold transition-colors"
                >
                  {copiedId === "termux_cmd" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === "termux_cmd" ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-2xl p-4 font-mono text-xs text-cyan-300 space-y-1.5 overflow-x-auto shadow-inner border border-slate-800">
                <p className="text-slate-500"># Install Python & FFmpeg in Termux:</p>
                <p className="text-slate-100">pkg update && pkg install python ffmpeg -y</p>
                <p className="text-slate-500 mt-2"># Keep Termux awake 24/7:</p>
                <p className="text-emerald-400">termux-wake-lock</p>
                <p className="text-slate-500 mt-2"># Install dependencies & run:</p>
                <p className="text-slate-100">pip install pyrofork tgcrypto aiohttp aiofiles m3u8 pillow python-dotenv requests</p>
                <p className="text-indigo-400 font-bold">python bot.py</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
