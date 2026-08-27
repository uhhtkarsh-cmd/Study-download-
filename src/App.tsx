import React, { useState } from "react";
import { Header } from "./components/Header";
import { BotSimulator } from "./components/BotSimulator";
import { WebStreamPlayer } from "./components/WebStreamPlayer";
import { CodeExplorer } from "./components/CodeExplorer";
import { DeploymentGuide } from "./components/DeploymentGuide";
import { ArchitectureInfo } from "./components/ArchitectureInfo";
import { Download, ShieldCheck } from "lucide-react";
import { exportBotAsZip } from "./utils/zipExport";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("player");

  const handleDownloadZip = async () => {
    await exportBotAsZip();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black relative">
      {/* Sleek Header */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Tab Views */}
        {activeTab === "player" && <WebStreamPlayer />}
        {activeTab === "simulator" && <BotSimulator />}
        {activeTab === "code" && <CodeExplorer />}
        {activeTab === "deploy" && <DeploymentGuide />}
        {activeTab === "speed" && <ArchitectureInfo />}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-semibold">ThorStream Engine</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">High-Performance HLS Stream Player & Telegram Bot</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={handleDownloadZip}
              className="text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Code</span>
            </button>
            <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Server Online
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

