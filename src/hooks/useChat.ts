"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";
import { DataConnection } from "peerjs";
import { clock } from "@/lib/utils";

const MAX_MSGS_PER_ROOM = 200;

interface UseChatProps {
  roomId: string;
  meRef: { current: { peerId: string; name: string; currentArea: string | null } };
  peerStatesRef: { current: Map<string, { x: number; y: number; name: string }> };
  bc: (data: Record<string, unknown>) => void;
  sendJson: (dc: DataConnection, data: Record<string, unknown>) => void;
  connectionsRef: { current: Map<string, DataConnection> };
}

export function useChat({
  roomId,
  meRef,
  peerStatesRef,
  bc,
  sendJson,
  connectionsRef,
}: UseChatProps) {
  const chatsRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const loadedHistoryRef = useRef<Set<string>>(new Set());
  const dmMessagesRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const [activeDm, setActiveDm] = useState<string | null>(null);
  const activeDmRef = useRef<string | null>(null);
  const [dmTargetName, setDmTargetName] = useState("");
  const supabaseRef = useRef(createClient());

  function setActiveDmBoth(v: string | null, targetName?: string) {
    activeDmRef.current = v;
    setActiveDm(v);
    if (targetName !== undefined) setDmTargetName(targetName);
  }

  function addSysGlobal(text: string) {
    const area = meRef.current.currentArea;
    if (!area) return;
    const msgs = chatsRef.current.get(area) || [];
    msgs.push({ text, sender: "", senderId: "", time: clock(), isSelf: false, isSystem: true });
    if (msgs.length > MAX_MSGS_PER_ROOM) msgs.splice(0, msgs.length - MAX_MSGS_PER_ROOM);
    chatsRef.current.set(area, msgs);
  }

  function addChat(text: string, sender: string, senderId: string, time: string | undefined, isSelf: boolean) {
    const area = meRef.current.currentArea;
    if (!area) return;
    const msgs = chatsRef.current.get(area) || [];
    msgs.push({ text, sender, senderId, time: time || clock(), isSelf, isSystem: false });
    if (msgs.length > MAX_MSGS_PER_ROOM) msgs.splice(0, msgs.length - MAX_MSGS_PER_ROOM);
    chatsRef.current.set(area, msgs);
  }

  function addVisualBubble(pid: string) {
    // Visual bubbles handled elsewhere
  }

  async function loadHistory(areaId: string) {
    if (loadedHistoryRef.current.has(areaId)) return;
    loadedHistoryRef.current.add(areaId);
    try {
      const { data, error } = await supabaseRef.current
        .from("room_messages")
        .select("*")
        .eq("room_id", roomId)
        .eq("area_id", areaId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error || !data) return;
      const msgs: ChatMessage[] = (data as Array<Record<string, string>>).map((m) => ({
        text: m.content,
        sender: m.sender_name,
        senderId: m.sender_peer_id,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isSelf: m.sender_peer_id === meRef.current.peerId,
        isSystem: false,
      }));
      const existing = chatsRef.current.get(areaId) || [];
      const existingKeys = new Set(existing.map((m) => `${m.senderId}:${m.text}:${m.time}`));
      const deduped = msgs.filter((m) => !existingKeys.has(`${m.senderId}:${m.text}:${m.time}`));
      chatsRef.current.set(areaId, [...deduped, ...existing]);
    } catch {}
  }

  async function sendChat(text?: string) {
    const input = document.getElementById("chatInp") as HTMLInputElement;
    if (!input) return;
    const msg = text ?? input.value.trim();
    const area = meRef.current.currentArea;
    if (!msg || !area) return;
    input.value = "";
    const tm = clock();
    const payload = { type: "chat", text: msg, time: tm, areaId: area };
    for (const [, dc] of connectionsRef.current) if (dc?.open) sendJson(dc, payload);
    addChat(msg, meRef.current.name, meRef.current.peerId, tm, true);
    addVisualBubble(meRef.current.peerId);
    try {
      await supabaseRef.current.from("room_messages").insert({
        room_id: roomId, area_id: area, sender_peer_id: meRef.current.peerId, sender_name: meRef.current.name, content: msg,
      });
    } catch {}
  }

  function sendDm(text: string) {
    const target = activeDmRef.current;
    if (!target) return;
    const me = meRef.current;
    const convKey = [me.peerId, target].sort().join(":");
    const dms = dmMessagesRef.current.get(convKey) || [];
    dms.push({ text, sender: me.name, senderId: me.peerId, time: clock(), isSelf: true, isSystem: false });
    dmMessagesRef.current.set(convKey, dms);
    const dc = connectionsRef.current.get(target);
    if (dc?.open) sendJson(dc, { type: "dm", text, from: me.peerId, name: me.name, time: clock() });
  }

  function handleDmReceived(fromPid: string, fromName: string, text: string, time: string) {
    const me = meRef.current;
    const convKey = [fromPid, me.peerId].sort().join(":");
    const dms = dmMessagesRef.current.get(convKey) || [];
    dms.push({ text, sender: fromName, senderId: fromPid, time, isSelf: false, isSystem: false });
    dmMessagesRef.current.set(convKey, dms);
    if (activeDmRef.current === fromPid) {
      // Force re-render via state update
      setActiveDm(activeDmRef.current);
    }
    addVisualBubble(fromPid);
  }

  function startDm(targetPid: string, targetName: string) {
    setActiveDmBoth(targetPid, targetName);
  }

  function clearDm() {
    setActiveDmBoth(null);
  }

  return {
    chatsRef,
    activeDm,
    activeDmRef,
    setActiveDm: setActiveDmBoth,
    dmTargetName,
    dmMessagesRef,
    sendChat,
    sendDm,
    loadHistory,
    startDm,
    clearDm,
    handleDmReceived,
    addSysGlobal,
    addChat,
  };
}

// Typing hook
export function useTyping(meRef: { current: { currentArea: string | null } }, bc: (data: Record<string, unknown>) => void) {
  const typingTimestampsRef = useRef<Map<string, number>>(new Map());
  const typingNamesRef = useRef<Map<string, string>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const broadcastTypingRef = useRef<(isTyping: boolean) => void>();

  const broadcastTyping = useCallback((isTyping: boolean) => {
    const area = meRef.current.currentArea;
    if (!area) return;
    bc({ type: "typing", typing: isTyping, areaId: area });

    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => broadcastTypingRef.current?.(false), 2000);
    }
  }, [bc, meRef]);

  useEffect(() => {
    broadcastTypingRef.current = broadcastTyping;
  }, [broadcastTyping]);

  const updateTypingDisplay = useCallback(() => {
    const el = document.getElementById("typingIndicator");
    if (!el) return;
    const now = Date.now();
    for (const [pid, ts] of typingTimestampsRef.current) {
      if (now - ts > 3000) { typingTimestampsRef.current.delete(pid); typingNamesRef.current.delete(pid); }
    }
    const names = [...typingNamesRef.current.values()].filter(Boolean);
    if (names.length === 0) el.style.display = "none";
    else { el.style.display = "block"; el.textContent = names.join(", ") + (names.length > 1 ? " lagi mengetik..." : " sedang mengetik..."); }
  }, []);

  const handleTypingReceived = useCallback((sid: string, name: string, isTyping: boolean, areaId: string) => {
    if (areaId !== meRef.current.currentArea) return;
    if (isTyping) { typingTimestampsRef.current.set(sid, Date.now()); typingNamesRef.current.set(sid, name); }
    else { typingTimestampsRef.current.delete(sid); typingNamesRef.current.delete(sid); }
    updateTypingDisplay();
  }, [meRef, updateTypingDisplay]);

  return { broadcastTyping, handleTypingReceived, updateTypingDisplay, typingNamesRef };
}