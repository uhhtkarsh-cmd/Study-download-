import React, { useState } from "react";
import { BOT_FILES, BotFile } from "../data/botFiles";
import { FileCode, Copy, Check, Download, Folder, FileText, Terminal, Layers } from "lucide-react";
import confetti from "canvas-confetti";
import { exportBotAsZip } from "../utils/zipExport";
import { saveAs } from "file-saver";

export const CodeExplorer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<BotFile>(BOT_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    if (filename.endsWith(".py")) return <FileCode className="w-4 h-4 text-indigo-400" />;
    if (filename.endsWith(".sh")) return <Terminal className="w-4 h-4 text-green-400" />;
    if (filename.includes("Docker") || filename.endsWith(".yml")) return <Layers className="w-4 h-4 text-cyan-400" />;
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="max-w-7xl mx-auto py-2 space-y-5">
      {/* Top Banner */}
      <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            Complete Python Pyrogram Bot Codebase
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Production-ready files with your API ID, Hash, and Bot Token pre-wired for 24/7 high-speed operation.
          </p>
        </div>

        <button
          onClick={handleDownloadAllZip}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Download Complete ZIP Package</span>
        </button>
      </section>

      {/* Code Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File List Sidebar */}
        <section className="lg:col-span-4 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 shadow-xl flex flex-col h-[650px] backdrop-blur-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">
            <Folder className="w-4 h-4 text-indigo-400" />
            <span>Project Files ({BOT_FILES.length})</span>
          </div>

          <div className="space-y-1 overflow-y-auto flex-1 pr-1">
            {BOT_FILES.map((file) => {
              const isSelected = selectedFile.name === file.name;
              return (
                <button
                  key={file.name}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold shadow-xs"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {getFileIcon(file.name)}
                    <span className="truncate">{file.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">{file.language}</span>
                </button>
              );
            })}
          </div>

          {/* Quick File Summary */}
          <div className="mt-3 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">About selected file:</p>
            <p className="line-clamp-2 leading-relaxed">{selectedFile.description}</p>
          </div>
        </section>

        {/* Code Content Viewer */}
        <section className="lg:col-span-8 bg-slate-900/90 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[650px] backdrop-blur-xs">
          {/* File Header Bar */}
          <div className="bg-slate-800/50 px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {getFileIcon(selectedFile.name)}
              <span className="font-mono text-sm font-bold text-slate-100">{selectedFile.name}</span>
              <span className="text-[10px] bg-slate-800 text-indigo-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
                {selectedFile.content.split("\n").length} lines
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-indigo-400 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy Code"}</span>
              </button>

              <button
                onClick={handleDownloadSingleFile}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                title="Download this file"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div className="flex-1 overflow-auto p-5 bg-[#0B1120]/80 font-mono text-xs text-slate-300 leading-relaxed select-all">
            <pre className="whitespace-pre">{selectedFile.content}</pre>
          </div>
        </section>
      </div>
    </div>
  );
};
