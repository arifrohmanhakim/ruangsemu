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
      log.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-dim);font-size:14px;text-align:center;padding:0 20px"><b style="font-size:36px;margin-bottom:10px">🚪</b>Masuk ke salah satu room<br/>buat mulai ngobrol!</div>`;
      return;
    }
    if (msgs.length === 0) {
      log.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-dim);font-size:14px;text-align:center;padding:0 20px"><b style="font-size:36px;margin-bottom:10px">💬</b>Belum ada pesan di room ini</div>`;
      return;
    }
    for (const m of msgs) {
      if (m.isSystem) {
        const div = document.createElement("div");
        div.style.textAlign = "center";
        div.style.padding = "4px 0";
        div.innerHTML = `<span style="background:color-mix(in srgb,var(--color-surface2) 40%,transparent);padding:4px 12px;border-radius:999px;font-size:12px;color:var(--color-dim)">${escHtml(m.text)}</span>`;
        log.appendChild(div);
        continue;
      }
      const div = document.createElement("div");
      div.style.marginBottom = "6px";
      div.style.display = "flex";
      div.style.flexDirection = "column";
      div.style.alignItems = m.isSelf ? "flex-end" : "flex-start";
      div.innerHTML = `
        <div style="font-size:12px;font-weight:600;${m.isSelf ? "color:var(--color-warning)" : "color:var(--color-warning)"}">${escHtml(m.sender)}</div>
        <div style="display:inline-block;padding:6px 14px;border-radius:12px;font-size:14px;line-height:1.5;${m.isSelf ? "background:var(--color-warning);color:#000;border-bottom-right-radius:4px" : "background:var(--color-surface2);color:var(--color-text);border-bottom-left-radius:4px"}">${escHtml(m.text)}</div>
        <div style="font-size:10px;color:var(--color-dim);margin-top:2px">${m.time}</div>`;
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
      log.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-dim);font-size:14px;text-align:center;padding:0 20px"><b style="font-size:36px;margin-bottom:10px">💌</b>Mulai DM dengan ${escHtml(targetName)}<br/>Pesan cuma terlihat kalian berdua</div>`;
      return;
    }
    log.innerHTML = "";
    for (const m of msgs) {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.justifyContent = m.isSelf ? "flex-end" : "flex-start";
      div.style.marginBottom = "8px";
      div.innerHTML = `
        <div style="max-width:75%;${m.isSelf ? "background:var(--color-warning);color:#000;border-radius:16px;border-bottom-right-radius:4px;padding:6px 12px" : "background:var(--color-surface2);color:var(--color-text);border-radius:16px;border-bottom-left-radius:4px;padding:6px 12px"}">
          <div style="font-size:12px">${escHtml(m.sender)}</div>
          <div style="font-size:14px">${escHtml(m.text)}</div>
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-surface2)", flexShrink: 0 }}>
        {activeDm ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-dim)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
              <button onClick={() => setActiveDm(null)} style={{ fontSize: "12px", color: "var(--color-warning)", background: "none", border: "none", cursor: "pointer", marginRight: "4px" }}>
                ← Kembali
              </button>
              💌 DM · <span style={{ color: "var(--color-warning)" }}>{dmTargetName}</span>
            </h3>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-dim)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
              💬 Ngobrol · <span id="roomCount" style={{ color: "var(--color-warning)" }}>0 orang</span>
            </h3>
            <div id="nearbyTags" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px", minHeight: "20px" }}>
              <span style={{ color: "var(--color-dim)", fontSize: "12px" }}>👥</span>
            </div>
          </>
        )}
      </div>

      {/* Member list */}
      <div
        style={{
          borderBottom: "1px solid var(--color-surface2)",
          flexShrink: 0,
          maxHeight: "180px",
          overflowY: "auto",
          display: activeDm ? "none" : undefined,
        }}
      >
        <div id="memberList" style={{ padding: "4px 8px" }} />
      </div>

      {/* Chat log — Room */}
      <div
        id="chatLog"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 16px",
          minHeight: 0,
          display: activeDm ? "none" : undefined,
        }}
      />

      {/* Chat log — DM */}
      <div
        id="dmChatLog"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 16px",
          minHeight: 0,
          display: activeDm ? undefined : "none",
        }}
      />

      {/* Typing indicator */}
      <div
        id="typingIndicator"
        style={{
          padding: "4px 16px",
          fontSize: "12px",
          color: "var(--color-dim)",
          fontStyle: "italic",
          minHeight: 0,
          display: "none",
        }}
      />

      {/* Input */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-surface2)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            id="chatInp"
            type="text"
            placeholder={activeDm ? "Ketik DM..." : "🚶 Masuk ke room buat ngobrol..."}
            value={chatInput}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            disabled={!area && !activeDm}
            style={{
              flex: 1,
              background: "var(--color-bg)",
              border: "1px solid var(--color-surface2)",
              borderRadius: "999px",
              padding: "10px 16px",
              color: "var(--color-text)",
              fontSize: "14px",
              outline: "none",
              opacity: !area && !activeDm ? 0.4 : 1,
            }}
          />
          <button
            onClick={() => { if (activeDmRef.current) sendDm(chatInput); else sendChat(chatInput); }}
            disabled={!chatInput.trim()}
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "var(--color-warning)",
              color: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              flexShrink: 0,
              border: "none",
              cursor: "pointer",
              opacity: !chatInput.trim() ? 0.4 : 1,
            }}
          >
            ➤
          </button>
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-dim)", marginTop: "4px", minHeight: "16px" }}>
          {activeDm ? "💌 Pesan hanya kalian berdua yang lihat" : "Masuk ke room buat mulai ngobrol"}
        </div>
      </div>
    </div>
  );
}
