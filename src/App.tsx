import React from "react";
import { WebStreamPlayer } from "./components/WebStreamPlayer";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Pure, Minimal Main Screen */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-6 flex flex-col justify-start">
        <WebStreamPlayer />
      </main>
    </div>
  );
}
