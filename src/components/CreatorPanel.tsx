"use client";

import { useState, useEffect } from "react";
import { ROOMS } from "@/lib/map";
import type { AreaConfig } from "@/lib/types";

interface CreatorPanelProps {
  isOpen: boolean;
  isCreator: boolean;
  areaConfigsRef: { current: Map<string, AreaConfig> };
  onToggleConfig: (areaId: string, visibility: string, pin: string | null) => void;
  onUpdateConfig: (areaId: string, visibility: string, pin: string | null) => void;
  onCreateRoom: () => void;
  configDirty: number;
}

export function CreatorPanel({
  isOpen, isCreator, areaConfigsRef,
  onToggleConfig, onUpdateConfig, onCreateRoom, configDirty,
}: CreatorPanelProps) {
  const [creatorPanelOpen, setCreatorPanelOpen] = useState(false);
  const [editPinFor, setEditPinFor] = useState<string | null>(null);
  const [editPinVal, setEditPinVal] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [areaConfigs, setAreaConfigs] = useState<Map<string, { visibility: string; pin: string | null }>>(new Map());

  useEffect(() => {
    setAreaConfigs(new Map(areaConfigsRef.current));
  }, [configDirty]);

  useEffect(() => { /* force re-render on configDirty */ }, [configDirty]);

  if (!isOpen || !isCreator) return null;

  return (
    <div className="border-t border-surface2 shrink-0">
      <button
        onClick={() => setCreatorPanelOpen(!creatorPanelOpen)}
        className="w-full px-4 py-2 text-xs text-dim hover:text-text transition flex items-center justify-between"
      >
        <span>⚙️ Room Settings</span>
        <span className={`transition-transform ${creatorPanelOpen ? "rotate-180" : ""}`}>▼</span>
      </button>
      {creatorPanelOpen && (
        <div className="px-4 pb-3 space-y-2.5">
          {ROOMS.map(r => {
            const cfg = areaConfigs.get(r.id);
            const isPrivate = cfg?.visibility === "private";
            const isEditing = editPinFor === r.id;
            return (
              <div key={r.id} className="bg-bg rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-text">{r.name}</span>
                  <button
                    onClick={() => {
                      if (isPrivate) onToggleConfig(r.id, "public", null);
                      else {
                        const defaultPin = Math.floor(1000 + Math.random() * 9000).toString();
                        onToggleConfig(r.id, "private", defaultPin);
                        setEditPinFor(r.id);
                        setEditPinVal(defaultPin);
                      }
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition ${
                      isPrivate ? "bg-warning/20 text-warning" : "bg-ngumpul/20 text-ngumpul"
                    }`}
                  >
                    {isPrivate ? "🔒 Private" : "🌍 Public"}
                  </button>
                </div>
                {isPrivate && !isEditing && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-dim">PIN: {cfg?.pin ? "•".repeat(cfg.pin.length) : "—"}</span>
                    <button
                      onClick={() => { setEditPinFor(r.id); setEditPinVal(cfg?.pin || ""); }}
                      className="text-[11px] text-ngumpul hover:text-ngumpul-dark transition"
                    >Ganti</button>
                  </div>
                )}
                {isPrivate && isEditing && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="text" maxLength={6} value={editPinVal}
                      onChange={e => setEditPinVal(e.target.value)}
                      placeholder="PIN baru..."
                      className="flex-1 bg-surface2 rounded-lg px-2.5 py-1.5 text-xs text-text outline-none focus:border-ngumpul transition border border-transparent"
                    />
                    <button
                      onClick={() => { if (editPinVal.trim()) onUpdateConfig(r.id, "private", editPinVal.trim()); setEditPinFor(null); }}
                      className="text-[11px] bg-ngumpul text-black font-semibold px-2.5 py-1.5 rounded-lg hover:bg-ngumpul-dark transition"
                    >Simpan</button>
                    <button onClick={() => setEditPinFor(null)} className="text-[11px] text-dim px-1.5 hover:text-text transition">✕</button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="bg-bg rounded-xl p-3">
            {showCreateRoom ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">🏗️ Room Baru</span>
                  <button onClick={() => { setShowCreateRoom(false); setNewRoomName(""); }} className="text-dim hover:text-text transition text-sm">✕</button>
                </div>
                <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onCreateRoom(); }}
                  placeholder="Nama room..." className="w-full bg-surface2 rounded-lg px-2.5 py-1.5 text-xs text-text outline-none focus:border-ngumpul transition border border-transparent" />
                <button onClick={onCreateRoom} className="w-full bg-ngumpul text-black text-xs font-semibold py-1.5 rounded-lg hover:bg-ngumpul-dark transition">➕ Buat</button>
              </div>
            ) : (
              <button onClick={() => setShowCreateRoom(true)} className="w-full text-xs text-ngumpul font-semibold py-1.5 hover:text-ngumpul-dark transition flex items-center justify-center gap-1">➕ Buat Room Baru</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}