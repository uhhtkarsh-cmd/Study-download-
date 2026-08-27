import React from "react";
import { Play, Bot, Download, Server, Terminal, Shield } from "lucide-react";
import { exportBotAsZip } from "../utils/zipExport";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const handleDownloadZip = async () => {
    await exportBotAsZip();
  };

  const navTabs = [
    { id: "player", label: "Stream Player", icon: Play },
    { id: "simulator", label: "Bot Simulator", icon: Bot },
    { id: "code", label: "Bot Code", icon: Terminal },
    { id: "deploy", label: "Cloud Deployment", icon: Server },
    { id: "speed", label: "Architecture", icon: Shield },
  ];

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-cyan-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              <Play className="w-4 h-4 fill-white ml-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  ThorStream
                </h1>
                <span className="text-[11px] font-semibold bg-slate-800 text-cyan-400 border border-slate-700 px-2 py-0.5 rounded">
                  PRO
                </span>
              </div>
              <p className="text-slate-400 text-xs hidden sm:block">
                HLS Stream Decryptor & Telegram Downloader
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <a
              href="https://t.me/Aura_downlaoder_bot"
              target="_blank"
              rel="noreferrer"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">@Aura_downlaoder_bot</span>
              <span className="sm:hidden">Bot</span>
            </a>

            <button
              onClick={handleDownloadZip}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
              title="Download bot source code"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export ZIP</span>
            </button>
          </div>
        </div>

        {/* Clean Navigation Tabs */}
        <div className="flex space-x-1 overflow-x-auto pb-2 -mt-1 no-scrollbar border-t border-slate-800/60 pt-2">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? "bg-slate-800 text-cyan-400 border border-slate-700 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

