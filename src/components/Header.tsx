import React from "react";
import { Play, Bot, Download, Server, Terminal, Shield, Sparkles, Github, Zap } from "lucide-react";
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
    { id: "player", label: "Video Player", icon: Play },
    { id: "simulator", label: "Bot Simulator", icon: Bot },
    { id: "code", label: "Bot Code", icon: Terminal },
    { id: "deploy", label: "How to Deploy", icon: Server },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-200/80 transition-all duration-300 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Brand (Matching Reference Style) */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 p-[2px] shadow-md shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-white">
                <Play className="w-4 h-4 fill-violet-400 text-violet-400 ml-0.5" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight font-sans">
                  ThorStream
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80 tracking-wider">
                  Fast Player
                </span>
              </div>
              <p className="text-slate-400 text-[11px] hidden sm:block font-medium -mt-0.5">
                Online Video Player & Lecture Downloader
              </p>
            </div>
          </div>

          {/* Center Navigation Bar (Floating Pills) */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1.5 rounded-full border border-slate-200/80 shadow-inner">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-white text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-slate-200/60 font-bold"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Action Buttons (Matching Reference Black Pill Buttons) */}
          <div className="flex items-center gap-2.5">
            <a
              href="https://t.me/Aura_downlaoder_bot"
              target="_blank"
              rel="noreferrer"
              className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200 px-3.5 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Bot className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">@Aura_downlaoder_bot</span>
              <span className="sm:hidden">Bot</span>
            </a>

            <button
              onClick={handleDownloadZip}
              className="bg-slate-950 hover:bg-slate-800 text-white font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm cursor-pointer transition-all flex items-center gap-2 shadow-md shadow-slate-950/20 active:scale-95"
              title="Download bot source code"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Code</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="lg:hidden flex space-x-1.5 overflow-x-auto pb-3 -mt-1 no-scrollbar border-t border-slate-100 pt-2">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 bg-slate-100/80 border border-slate-200/60"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-300" : "text-slate-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
