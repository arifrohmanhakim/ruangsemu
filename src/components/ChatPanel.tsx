"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { escHtml } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  area: string | null;
  chatsRef: { current: Map<string, ChatMessage[]> };
  activeDm: string | null;
  setActiveDm: (v: string | null, targetName?: string) => void;
  dmMessagesRef: { current: Map<string, ChatMessage[]> };
  me: { peerId: string; name: string; currentArea: string | null };
  peerStates: Map<string, { name: string }>;
  activeDmRef: { current: string | null };
  dmTargetName: string;
  sendDm: (text: string) => void;
  sendChat: (text: string) => void;
  broadcastTyping: (isTyping: boolean) => void;
  loadHistory: (areaId: string) => void;
  syncRoomChat: () => void;
  syncDmChat: () => void;
  typingNamesRef: { current: Map<string, string> };
}

export function ChatPanel({
  area, chatsRef, activeDm, setActiveDm,
  dmMessagesRef, me, peerStates, activeDmRef,
  dmTargetName, sendDm, sendChat, broadcastTyping,
  loadHistory, syncRoomChat, syncDmChat, typingNamesRef,
}: ChatPanelProps) {
  const [chatInput, setChatInput] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync room chat
  useEffect(() => {
    const log = document.getElementById("chatLog");
    if (!log) return;
    const msgs = area ? chatsRef.current.get(area) || [] : [];
    log.innerHTML = "";
    if (!area) {
      log.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5"><b class="text-4xl mb-2.5">🚪</b>Masuk ke salah satu room<br/>buat mulai ngobrol!</div>`;
      return;
    }
    if (msgs.length === 0) {
      log.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5"><b class="text-4xl mb-2.5">💬</b>Belum ada pesan di room ini</div>`;
      return;
    }
    for (const m of msgs) {
      if (m.isSystem) {
        const div = document.createElement("div");
        div.className = "text-center py-1";
        div.innerHTML = `<span class="bg-surface2/40 px-3 py-1 rounded-full text-xs text-dim">${escHtml(m.text)}</span>`;
        log.appendChild(div);
        continue;
      }
      const div = document.createElement("div");
      div.className = `mb-1.5 animate-in flex flex-col ${m.isSelf ? "items-end" : "items-start"}`;
      div.innerHTML = `
        <div class="text-xs font-semibold ${m.isSelf ? "text-warning" : "text-ngumpul"}">${escHtml(m.sender)}</div>
        <div class="inline-block px-3.5 py-2 rounded-xl text-sm leading-relaxed ${m.isSelf ? "bg-ngumpul rounded-br-md" : "bg-surface2 rounded-bl-md"}">${escHtml(m.text)}</div>
        <div class="text-[10px] text-dim mt-0.5">${m.time}</div>`;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }, [area, chatsRef]);

  // Sync DM chat
  useEffect(() => {
    const log = document.getElementById("dmChatLog");
    if (!log) return;
    const target = activeDmRef.current;
    if (!target) { log.innerHTML = ""; return; }
    const convKey = [me.peerId, target].sort().join(":");
    const msgs = dmMessagesRef.current.get(convKey) || [];
    if (msgs.length === 0) {
      const targetName = target === me.peerId ? me.name : peerStates.get(target)?.name || target;
      log.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5"><b class="text-4xl mb-2.5">💌</b>Mulai DM dengan ${escHtml(targetName)}<br/>Pesan cuma terlihat kalian berdua</div>`;
      return;
    }
    log.innerHTML = "";
    for (const m of msgs) {
      const div = document.createElement("div");
      div.className = "flex " + (m.isSelf ? "justify-end" : "justify-start") + " mb-2";
      div.innerHTML = `
        <div class="max-w-[75%] ${m.isSelf ? "bg-ngumpul text-black rounded-2xl rounded-br-md px-3 py-1.5" : "bg-surface2 text-text rounded-2xl rounded-bl-md px-3 py-1.5"}">
          <div class="text-xs">${escHtml(m.sender)}</div>
          <div class="text-sm">${escHtml(m.text)}</div>
        </div>`;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }, [activeDm, dmMessagesRef]);

  // Typing indicator
  useEffect(() => {
    const el = document.getElementById("typingIndicator");
    if (!el) return;
    const names = [...typingNamesRef.current.values()].filter(Boolean);
    if (names.length === 0) el.style.display = "none";
    else { el.style.display = "block"; el.textContent = names.join(", ") + (names.length > 1 ? " lagi mengetik..." : " sedang mengetik..."); }
  }, [typingNamesRef]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChatInput(val);
    if (!activeDmRef.current) {
      broadcastTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000);
    }
  }, [activeDmRef, broadcastTyping]);

  const handleBlur = useCallback(() => broadcastTyping(false), [broadcastTyping]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = chatInput.trim();
      if (!text) return;
      setChatInput("");
      if (activeDmRef.current) sendDm(text);
      else sendChat(text);
    }
  }, [chatInput, activeDmRef, sendDm, sendChat]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface2 shrink-0">
        {activeDm ? (
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-dim flex items-center gap-2">
              <button onClick={() => setActiveDm(null)} className="text-xs text-ngumpul hover:text-ngumpul-dark transition mr-1">← Kembali</button>
              💌 DM · <span className="text-ngumpul">{dmTargetName}</span>
            </h3>
          </div>
        ) : (
          <>
            <h3 className="text-xs font-semibold text-dim flex items-center gap-2">💬 Ngobrol · <span id="roomCount" className="text-ngumpul">0 orang</span></h3>
            <div id="nearbyTags" className="flex flex-wrap gap-1.5 mt-1.5 min-h-5"><span className="text-dim text-xs">👥</span></div>
          </>
        )}
      </div>

      {/* Member list */}
      <div className="border-b border-surface2 shrink-0 max-h-[180px] overflow-y-auto" style={{ display: activeDm ? "none" : undefined }}>
        <div id="memberList" className="px-2 py-1.5" />
      </div>

      {/* Chat log — Room */}
      <div id="chatLog" className="flex-1 overflow-y-auto px-4 py-2.5 min-h-0" style={{ display: activeDm ? "none" : undefined }} />

      {/* Chat log — DM */}
      <div id="dmChatLog" className="flex-1 overflow-y-auto px-4 py-2.5 min-h-0" style={{ display: activeDm ? undefined : "none" }} />

      {/* Typing indicator */}
      <div id="typingIndicator" className="px-4 py-1 text-xs text-dim italic min-h-0" style={{ display: "none" }} />

      {/* Input */}
      <div className="px-4 py-2.5 border-t border-surface2 shrink-0">
        <div className="flex gap-2">
          <input
            id="chatInp"
            type="text"
            placeholder={activeDm ? "Ketik DM..." : "🚶 Masuk ke room buat ngobrol..."}
            value={chatInput}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="flex-1 bg-bg border border-surface2 rounded-full px-4 py-2.5 text-text text-sm outline-none focus:border-ngumpul transition disabled:opacity-40"
            disabled={!area && !activeDm}
          />
          <button
            onClick={() => { if (activeDmRef.current) sendDm(chatInput); else sendChat(chatInput); }}
            className="w-[42px] h-[42px] rounded-full bg-ngumpul text-black flex items-center justify-center text-lg shrink-0 hover:bg-ngumpul-dark transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!chatInput.trim()}
          >➤</button>
        </div>
        <div className="text-[11px] text-dim mt-1 min-h-4">{activeDm ? "💌 Pesan hanya kalian berdua yang lihat" : "Masuk ke room buat mulai ngobrol"}</div>
      </div>
    </div>
  );
}