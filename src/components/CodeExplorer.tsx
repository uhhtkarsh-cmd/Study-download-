import React, { useState } from "react";
import { BOT_FILES, BotFile } from "../data/botFiles";
import { FileCode, Copy, Check, Download, Folder, FileText, Terminal, Layers, Github, GitBranch, GitPullRequest, Star, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import { exportBotAsZip } from "../utils/zipExport";
import { saveAs } from "file-saver";

export const CodeExplorer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<BotFile>(BOT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [copiedClone, setCopiedClone] = useState(false);

  const cloneCmd = "git clone https://github.com/uhhtkarsh/ThorStream-HLS-Engine.git";

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyClone = () => {
    navigator.clipboard.writeText(cloneCmd);
    setCopiedClone(true);
    setTimeout(() => setCopiedClone(false), 2000);
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, selectedFile.name);
  };

  const handleDownloadAllZip = async () => {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.25 }
    });
    await exportBotAsZip();
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith(".py")) return <FileCode className="w-4 h-4 text-indigo-500" />;
    if (filename.endsWith(".sh")) return <Terminal className="w-4 h-4 text-emerald-500" />;
    if (filename.includes("Docker") || filename.endsWith(".yml")) return <Layers className="w-4 h-4 text-cyan-500" />;
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="max-w-7xl mx-auto py-2 space-y-6">
      {/* GitHub Repository Showcase Banner */}
      <section className="glass-card-light rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-950 flex items-center justify-center text-white shadow-md">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-950 tracking-tight">
                  uhhtkarsh / ThorStream-HLS-Engine
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  Public
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                High-Speed Python Pyrogram Telegram Bot & 1000x Multi-Thread HLS Decryption Suite
              </p>
            </div>
          </div>

          {/* Git Clone Input */}
          <div className="flex items-center gap-2 pt-2">
            <div className="bg-slate-100/90 border border-slate-200/90 rounded-xl px-3 py-1.5 font-mono text-xs text-slate-700 select-all flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <span>{cloneCmd}</span>
            </div>
            <button
              onClick={handleCopyClone}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              {copiedClone ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedClone ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleDownloadAllZip}
            className="flex-1 md:flex-initial bg-slate-950 hover:bg-slate-800 text-white font-bold px-5 py-3 rounded-2xl text-xs sm:text-sm shadow-lg shadow-slate-950/15 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download Full Repository ZIP</span>
          </button>
        </div>
      </section>

      {/* Code Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File List Sidebar */}
        <section className="lg:col-span-4 glass-card-light rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col h-[650px]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 px-2">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-indigo-600" />
              <span>Project Files</span>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
              {BOT_FILES.length} Files
            </span>
          </div>

          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {BOT_FILES.map((file) => {
              const isSelected = selectedFile.name === file.name;
              return (
                <button
                  key={file.name}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-950 text-white font-bold shadow-md shadow-slate-950/10"
                      : "text-slate-700 hover:bg-slate-100/90 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {getFileIcon(file.name)}
                    <span className="truncate">{file.name}</span>
                  </div>
                  <span className={`text-[10px] uppercase font-sans font-extrabold ${isSelected ? "text-indigo-300" : "text-slate-400"}`}>
                    {file.language}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick File Summary */}
          <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
            <p className="font-bold text-slate-800 mb-1">File Description:</p>
            <p className="line-clamp-2 leading-relaxed">{selectedFile.description}</p>
          </div>
        </section>

        {/* Code Content Viewer */}
        <section className="lg:col-span-8 bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col h-[650px]">
          {/* File Header Bar */}
          <div className="bg-slate-900/90 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex space-x-1.5 mr-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
              </div>
              <span className="font-mono text-sm font-bold text-slate-100">{selectedFile.name}</span>
              <span className="text-[10px] bg-slate-800 text-indigo-300 border border-slate-700 px-2.5 py-0.5 rounded-full font-mono">
                {selectedFile.content.split("\n").length} lines
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>

              <button
                onClick={handleDownloadSingleFile}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium p-2 rounded-xl border border-slate-700 flex items-center transition-colors cursor-pointer"
                title="Download this file"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div className="flex-1 overflow-auto p-6 bg-[#080b12] font-mono text-xs text-slate-300 leading-relaxed select-all">
            <pre className="whitespace-pre">{selectedFile.content}</pre>
          </div>
        </section>
      </div>
    </div>
  );
};
