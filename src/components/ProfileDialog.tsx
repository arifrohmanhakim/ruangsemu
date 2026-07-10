"use client";

import { useEffect } from "react";
import { getRoomById } from "@/lib/map";

interface ProfileDialogProps {
  target: { pid: string; name: string; area: string | null; isMe: boolean } | null;
  onClose: () => void;
  onStartDm: (pid: string, name: string) => void;
}

export function ProfileDialog({ target, onClose, onStartDm }: ProfileDialogProps) {
  useEffect(() => {
    if (!target) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
      <div className="bg-surface rounded-2xl p-5 w-[260px] shadow-2xl border border-surface2 pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text">👤 Profil</h3>
          <button onClick={onClose} className="text-dim hover:text-text transition text-lg leading-none">✕</button>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
            target.isMe ? "bg-warning/20 text-warning" : "bg-accent-blue/20 text-accent-blue"
          }`}>{target.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="text-sm text-text font-semibold">{target.name}</div>
            <div className="text-[11px] text-dim">
              {target.area ? getRoomById(target.area)?.name || target.area : "🚶 Koridor"}
            </div>
          </div>
        </div>
        {!target.isMe && (
          <button
            onClick={() => { onStartDm(target.pid, target.name); onClose(); }}
            className="w-full bg-ngumpul/20 text-ngumpul font-semibold py-2 rounded-xl text-sm hover:bg-ngumpul/30 transition"
          >💬 Kirim DM</button>
        )}
      </div>
    </div>
  );
}