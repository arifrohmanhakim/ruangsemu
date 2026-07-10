"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import {
  getPeerId,
  generatePeerId,
  BROADCAST_MS,
  clock,
  escHtml,
} from "@/lib/utils";
import type {
  PeerState,
  ChatMessage,
  RoomMember,
  AreaConfig,
} from "@/lib/types";
import {
  MAP_W,
  MAP_H,
  AVATAR_R,
  ROOMS,
  getWallSegments,
  tryMove,
  detectRoom,
  getRoomById,
  getDoorOutsidePos,
  setCustomRooms,
  addCustomRoom,
  findNextRoomPos,
  type WallSegment,
} from "@/lib/map";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/realtime-js";

interface RoomViewProps {
  roomId: string;
  userName: string;
}

function randomPos() {
  return {
    x: 200 + Math.random() * 400,
    y: Math.round(450 + (Math.random() - 0.5) * 200),
  };
}

const SPEED = 2.5;
const MAX_MSGS_PER_ROOM = 200;
const BUBBLE_DURATION = 2500;
const TYPING_TIMEOUT = 3000;

interface VisualBubble {
  pid: string;
  createdAt: number;
}

export default function RoomView({ roomId, userName }: RoomViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());
  const meRef = useRef({
    x: 200,
    y: MAP_H / 2,
    peerId: getPeerId(),
    name: userName,
    currentArea: null as string | null,
  });
  const isLeavingRef = useRef(false);
  const isListeningRef = useRef(false);
  const clockRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat state per room area
  const chatsRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const loadedHistoryRef = useRef<Set<string>>(new Set());

  // DM state
  const dmMessagesRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const [activeDm, setActiveDm] = useState<string | null>(null); // target peerId
  const activeDmRef = useRef<string | null>(null);
  const [dmTargetName, setDmTargetName] = useState("");
  function setActiveDmBoth(v: string | null, targetName?: string) {
    activeDmRef.current = v;
    setActiveDm(v);
    if (targetName !== undefined) setDmTargetName(targetName);
  }

  // Visual bubbles
  const visualBubblesRef = useRef<VisualBubble[]>([]);

  // Typing
  const typingTimestampsRef = useRef<Map<string, number>>(new Map());
  const typingNamesRef = useRef<Map<string, string>>(new Map());

  // Movement & canvas
  const keysRef = useRef<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const lastBcRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasMovingRef = useRef(false);
  const restoredRef = useRef(false); // apakah posisi udah direstore dari Supabase?
  // (posisi disimpan ke Supabase hanya saat: area change, beforeunload, atau idle timer setelah berhenti 3 detik)
  const wallsRef = useRef<WallSegment[]>([]);
  const lastAreaRef = useRef<string | null>(null);
  const roomMembersChannelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());

  // Area visibility & PIN
  const areaConfigsRef = useRef<Map<string, AreaConfig>>(new Map());
  const [areaConfigs, setAreaConfigs] = useState<Map<string, AreaConfig>>(new Map());
  const unlockedRoomsRef = useRef<Set<string>>(new Set());
  const hostPeerIdRef = useRef<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const pinDialogRef = useRef<{ areaId: string; areaName: string } | null>(
    null,
  );
  const [pinDialog, setPinDialog_] = useState<{
    areaId: string;
    areaName: string;
  } | null>(null);
  function setPinDialog(v: { areaId: string; areaName: string } | null) {
    pinDialogRef.current = v;
    setPinDialog_(v);
  }
  const [pinError, setPinError] = useState("");

  // Profile dialog
  const [profileTarget, setProfileTarget] = useState<{
    pid: string;
    name: string;
    area: string | null;
    isMe: boolean;
  } | null>(null);

  function handleMemberClick(pid: string) {
    const me = meRef.current;
    if (pid === me.peerId) {
      setProfileTarget({
        pid: me.peerId,
        name: me.name,
        area: me.currentArea,
        isMe: true,
      });
      return;
    }
    const s = peerStatesRef.current.get(pid);
    if (!s) return;
    setProfileTarget({
      pid,
      name: s.name || pid,
      area: detectRoom(s.x, s.y),
      isMe: false,
    });
  }

  function startDm(targetPid: string, targetName: string) {
    setProfileTarget(null);
    setActiveDmBoth(targetPid, targetName);
    syncDmChat();
  }
  const [isCreator, setIsCreator] = useState(false);
  const [creatorPanelOpen, setCreatorPanelOpen] = useState(false);
  const [configDirty, setConfigDirty] = useState(0);
  const [editPinFor, setEditPinFor] = useState<string | null>(null);
  const [editPinVal, setEditPinVal] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  // Connection state
  const [connState, setConnState] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const connStateRef = useRef<"connecting" | "connected" | "error">(
    "connecting",
  );
  function setConnStateBoth(v: "connecting" | "connected" | "error") {
    connStateRef.current = v;
    setConnState(v);
  }

  const [, forceUpdate] = useState(0);
  const reRender = useCallback(() => forceUpdate((n) => n + 1), []);

  // Sync areaConfigsRef to state for render
  useEffect(() => {
    setAreaConfigs(new Map(areaConfigsRef.current));
  }, [configDirty]);

  // Init walls once
  useEffect(() => {
    wallsRef.current = getWallSegments();
  }, []);

  // ─── SUPABASE HELPERS ──────────────────────────────
  async function upsertMember() {
    const me = meRef.current;
    const { error } = await supabaseRef.current.from("room_members").upsert(
      {
        room_id: roomId,
        peer_id: me.peerId,
        name: me.name,
        x: Math.round(me.x),
        y: Math.round(me.y),
        current_area: me.currentArea,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "room_id,peer_id" },
    );
    if (error) console.error("upsertMember error:", error);
  }

  async function getExistingMembers(): Promise<RoomMember[]> {
    try {
      const { data } = await supabaseRef.current
        .from("room_members")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      return (data || []) as RoomMember[];
    } catch {
      return [];
    }
  }

  // ─── REALTIME ROOM_MEMBERS ─────────────────────────
  function subscribeRoomMembers() {
    if (roomMembersChannelRef.current) return;

    const channel = supabaseRef.current
      .channel(`room-members-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: RealtimePostgresChangesPayload<RoomMember>) => {
          const m = payload.new as RoomMember;
          if (m.peer_id === meRef.current.peerId) return; // diri sendiri
          // Tambah state & konek
          if (!peerStatesRef.current.has(m.peer_id)) {
            peerStatesRef.current.set(m.peer_id, {
              x: m.x || 200,
              y: m.y || MAP_H / 2,
              name: m.name || m.peer_id,
            });
            updateCount();
            addSysGlobal(`${m.name || m.peer_id} masuk room 🚶`);
          }
          connectTo(m.peer_id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: RealtimePostgresChangesPayload<RoomMember>) => {
          const old = payload.old as RoomMember;
          if (old.peer_id === meRef.current.peerId) return; // diri sendiri
          const s = peerStatesRef.current.get(old.peer_id);
          const n = s?.name || old.name || old.peer_id;
          connectionsRef.current.delete(old.peer_id);
          peerStatesRef.current.delete(old.peer_id);
          typingTimestampsRef.current.delete(old.peer_id);
          typingNamesRef.current.delete(old.peer_id);
          updateTypingDisplay();
          updateCount();
          addSysGlobal(`${n} keluar room 👋`);
        },
      )
      .subscribe();

    roomMembersChannelRef.current = channel;
  }

  // ─── ROOM CONFIG (visibility + PIN) ───────────────
  async function fetchRoomConfig() {
    try {
      // Ambil host_peer_id (creator)
      const { data: room } = await supabaseRef.current
        .from("rooms")
        .select("host_peer_id")
        .eq("id", roomId)
        .single();
      if (room) {
        hostPeerIdRef.current = room.host_peer_id;
        setIsCreator(room.host_peer_id === meRef.current.peerId);
      }

      // Ambil area configs
      const { data: configs } = await supabaseRef.current
        .from("room_area_config")
        .select("*")
        .eq("room_id", roomId);
      if (configs) {
        areaConfigsRef.current.clear();
        for (const c of configs as AreaConfig[]) {
          areaConfigsRef.current.set(c.area_id, c);
        }
      }

      setConfigDirty((n) => n + 1);
    } catch {}
  }

  async function updateAreaConfig(
    areaId: string,
    visibility: string,
    pin: string | null,
  ) {
    try {
      await supabaseRef.current.from("room_area_config").upsert(
        {
          room_id: roomId,
          area_id: areaId,
          visibility,
          pin: pin || null,
        },
        { onConflict: "room_id,area_id" },
      );

      areaConfigsRef.current.set(areaId, {
        room_id: roomId,
        area_id: areaId,
        visibility: visibility as "public" | "private",
        pin: pin || null,
      });
      setConfigDirty((n) => n + 1);
    } catch {}
  }

  // ─── CUSTOM ROOMS ───────────────────────────────────
  async function fetchCustomRooms() {
    try {
      const { data } = await supabaseRef.current
        .from("room_defs")
        .select("*")
        .eq("room_id", roomId);
      if (data && data.length > 0) {
        const rooms = (data as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          name: r.name as string,
          x: r.x as number,
          y: r.y as number,
          w: r.w as number,
          h: r.h as number,
          color: r.color as string,
          door: {
            x:
              (r.door_side as string) === "right" || (r.door_side as string) === "left"
                ? (r.x as number)
                : (r.x as number) + (r.w as number) / 2 - ((r.door_w as number) || 70) / 2,
            y:
              (r.door_side as string) === "top" || (r.door_side as string) === "bottom"
                ? (r.y as number) + (r.h as number)
                : (r.y as number) + (r.h as number) / 2 - ((r.door_w as number) || 70) / 2,
            w: (r.door_w as number) || 70,
            side: r.door_side as "top" | "bottom" | "left" | "right",
          },
        }));
        setCustomRooms(rooms);
        wallsRef.current = getWallSegments();
      }
    } catch {}
  }

  async function handleCreateRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    const w = 360;
    const h = 280;
    const pos = findNextRoomPos(w, h);
    const side = "bottom" as const;
    const doorW = 70;

    try {
      const { data, error } = await supabaseRef.current
        .from("room_defs")
        .insert({
          room_id: roomId,
          name,
          x: pos.x,
          y: pos.y,
          w,
          h,
          color: "rgba(100, 200, 150, 0.07)",
          door_side: side,
          door_w: doorW,
        })
        .select()
        .single();
      if (error) {
        console.error("create room error:", error);
        return;
      }

      const newRoom = {
        id: data.id.toString(),
        name,
        x: pos.x,
        y: pos.y,
        w,
        h,
        color: "rgba(100, 200, 150, 0.07)",
        door: {
          x: pos.x + w / 2 - doorW / 2,
          y: pos.y + h,
          w: doorW,
          side,
        },
      };
      addCustomRoom(newRoom);
      wallsRef.current = getWallSegments();
      setShowCreateRoom(false);
      setNewRoomName("");
      setConfigDirty((n) => n + 1);
    } catch (e) {
      console.error("create room error:", e);
    }
  }

  // ─── P2P HELPERS ───────────────────────────────────
  function ensureListening() {
    if (!isListeningRef.current && peerRef.current) {
      isListeningRef.current = true;
      peerRef.current.on("connection", handleIncoming);
    }
  }

  function handleIncoming(dc: DataConnection) {
    const pid = dc.peer;
    if (connectionsRef.current.has(pid)) return;
    connectionsRef.current.set(pid, dc);
    setupDC(dc, pid);

    if (!peerStatesRef.current.has(pid)) {
      const rp = randomPos();
      peerStatesRef.current.set(pid, {
        x: rp.x,
        y: rp.y,
        name: pid,
      });
      updateCount();
    }

    const others: string[] = [];
    for (const [p] of connectionsRef.current) if (p !== pid) others.push(p);
    sendJson(dc, { type: "pl", peers: others });
    sendJson(dc, {
      type: "mv",
      x: meRef.current.x,
      y: meRef.current.y,
      name: meRef.current.name,
    });
    bc({ type: "pj", pid, name: pid }, pid);
  }

  function setupDC(dc: DataConnection, pid: string) {
    dc.on("data", (d: unknown) => handleMsg(pid, d));
    dc.on("close", () => handleLeave(pid));
    dc.on("error", () => {});
  }

  function handleMsg(sid: string, data: unknown) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data?.type) return;

    const states = peerStatesRef.current;
    const conns = connectionsRef.current;
    const me = meRef.current;

    switch (data.type) {
      case "join":
        if (!states.has(sid)) {
          const rp = randomPos();
          states.set(sid, {
            x: rp.x,
            y: rp.y,
            name: data.name || sid,
          });
          updateCount();
        } else if (data.name) {
          states.get(sid)!.name = data.name;
        }
        break;

      case "pl":
        for (const p of data.peers || []) {
          if (!conns.has(p) && p !== me.peerId) connectTo(p);
        }
        break;

      case "pj":
        const np = data.pid;
        if (!conns.has(np) && np !== me.peerId) {
          connectTo(np);
          if (!states.has(np)) {
            const rp = randomPos();
            states.set(np, {
              x: rp.x,
              y: rp.y,
              name: data.name || np,
            });
            updateCount();
          }
        }
        break;

      case "mv":
        if (!states.has(sid)) {
          states.set(sid, {
            x: data.x || 200,
            y: data.y || MAP_H / 2,
            name: data.name || sid,
          });
          updateCount();
        }
        const s = states.get(sid);
        if (s) {
          s.x = data.x;
          s.y = data.y;
          if (data.name) s.name = data.name;
        }
        break;

      case "chat":
        if (data.areaId && data.areaId === me.currentArea) {
          const nm = states.get(sid)?.name || sid;
          addChat(data.text, nm, sid, data.time, false);
        }
        addVisualBubble(sid);
        syncRoomChat();
        break;

      case "typing":
        if (data.areaId && data.areaId === me.currentArea) {
          const tName = states.get(sid)?.name || sid;
          if (data.typing) {
            typingTimestampsRef.current.set(sid, clockRef.current);
            typingNamesRef.current.set(sid, tName);
          } else {
            typingTimestampsRef.current.delete(sid);
            typingNamesRef.current.delete(sid);
          }
          updateTypingDisplay();
        }
        break;

      case "nm":
        const s2 = states.get(sid);
        if (s2) s2.name = data.name;
        break;

      case "dm":
        const fromPid = data.from || sid;
        const fromName = data.name || states.get(fromPid)?.name || fromPid;
        const myPid = me.peerId;
        const convKey = [fromPid, myPid].sort().join(":");
        const dms = dmMessagesRef.current.get(convKey) || [];
        dms.push({
          text: data.text,
          sender: fromName,
          senderId: fromPid,
          time: data.time || clock(),
          isSelf: false,
          isSystem: false,
        });
        dmMessagesRef.current.set(convKey, dms);
        // Kalo lagi ngobrol sama pengirim, update tampilan
        if (activeDmRef.current === fromPid) {
          syncDmChat();
        }
        addVisualBubble(fromPid);
        break;
    }
  }

  function sendDm(text: string) {
    const target = activeDmRef.current;
    if (!target) return;
    const me = meRef.current;
    const convKey = [me.peerId, target].sort().join(":");
    const dms = dmMessagesRef.current.get(convKey) || [];
    dms.push({
      text,
      sender: me.name,
      senderId: me.peerId,
      time: clock(),
      isSelf: true,
      isSystem: false,
    });
    dmMessagesRef.current.set(convKey, dms);
    syncDmChat();
    // Kirim via PeerJS ke target
    const dc = connectionsRef.current.get(target);
    if (dc?.open) {
      sendJson(dc, {
        type: "dm",
        text,
        from: me.peerId,
        name: me.name,
        time: clock(),
      });
    }
  }

  function syncDmChat() {
    const log = document.getElementById("dmChatLog");
    if (!log) return;

    const target = activeDmRef.current;
    if (!target) {
      log.innerHTML = "";
      return;
    }

    const me = meRef.current;
    const convKey = [me.peerId, target].sort().join(":");
    const msgs = dmMessagesRef.current.get(convKey) || [];

    if (msgs.length === 0) {
      const targetName =
        target === me.peerId
          ? me.name
          : peerStatesRef.current.get(target)?.name || target;
      log.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5">
          <b class="text-4xl mb-2.5">💌</b>
          Mulai DM dengan ${escHtml(targetName)}<br/>
          Pesan cuma terlihat kalian berdua
        </div>`;
      return;
    }

    log.innerHTML = "";
    for (const m of msgs) {
      const div = document.createElement("div");
      div.className =
        "flex " + (m.isSelf ? "justify-end" : "justify-start") + " mb-2";
      div.innerHTML = `
        <div class="max-w-[75%] ${
          m.isSelf
            ? "bg-ruangsemu text-black rounded-2xl rounded-br-md px-3 py-1.5"
            : "bg-surface2 text-text rounded-2xl rounded-bl-md px-3 py-1.5"
        }">
          <div class="text-xs">${escHtml(m.sender)}</div>
          <div class="text-sm">${escHtml(m.text)}</div>
        </div>`;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }

  function connectTo(pid: string) {
    const conns = connectionsRef.current;
    if (conns.has(pid) || pid === meRef.current.peerId || !peerRef.current)
      return;

    const dc = peerRef.current.connect(pid, { reliable: true });
    dc.on("open", () => {
      if (conns.has(pid)) {
        dc.close();
        return;
      }
      conns.set(pid, dc);
      setupDC(dc, pid);
      if (!peerStatesRef.current.has(pid)) {
        peerStatesRef.current.set(pid, {
          x: 200 + Math.random() * 400,
          y: MAP_H / 2 + (Math.random() - 0.5) * 200,
          name: pid,
        });
        updateCount();
      }
      sendJson(dc, {
        type: "mv",
        x: meRef.current.x,
        y: meRef.current.y,
        name: meRef.current.name,
      });
    });
    dc.on("error", () => {});
  }

  function handleLeave(pid: string) {
    connectionsRef.current.delete(pid);
    peerStatesRef.current.delete(pid);
    typingTimestampsRef.current.delete(pid);
    typingNamesRef.current.delete(pid);
    updateTypingDisplay();
    updateCount();
  }

  function bc(data: Record<string, unknown>, exclude?: string) {
    const j = JSON.stringify(data);
    for (const [pid, dc] of connectionsRef.current) {
      if (pid !== exclude && dc.open) {
        try {
          dc.send(j);
        } catch {}
      }
    }
  }

  function sendJson(dc: DataConnection, data: Record<string, unknown>) {
    try {
      dc.send(JSON.stringify(data));
    } catch {}
  }

  function updateCount() {
    const n = peerStatesRef.current.size + 1;
    const el = document.getElementById("onlineCount");
    if (el) el.textContent = n + " online";
    const cnt = document.getElementById("roomCount");
    if (cnt) cnt.textContent = n + " orang";
    updateMemberList();
  }

  function updateMemberList() {
    const el = document.getElementById("memberList");
    if (!el) return;

    const me = meRef.current;
    const members: {
      pid: string;
      name: string;
      area: string | null;
      isMe: boolean;
    }[] = [];

    // Diri sendiri
    members.push({
      pid: me.peerId,
      name: me.name || me.peerId,
      area: me.currentArea,
      isMe: true,
    });

    // Orang lain
    for (const [pid, s] of peerStatesRef.current) {
      members.push({
        pid,
        name: s.name || pid,
        area: detectRoom(s.x, s.y),
        isMe: false,
      });
    }

    if (members.length === 0) {
      el.innerHTML =
        '<div class="text-dim text-xs py-2">Belum ada orang...</div>';
      return;
    }

    el.innerHTML = members
      .map((m) => {
        const roomName = m.area
          ? getRoomById(m.area)?.name || m.area
          : "🚶 Koridor";
        const badge = m.isMe
          ? '<span class="text-[10px] text-ruangsemu font-semibold ml-1">(lo)</span>'
          : "";
        return `<div class="member-item flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-surface2/50 transition text-xs cursor-pointer" data-pid="${escHtml(m.pid)}">
          <span class="w-2 h-2 rounded-full shrink-0 ${m.isMe ? "bg-ruangsemu" : "bg-accent-blue"}"></span>
          <span class="text-text truncate">${escHtml(m.name)}${badge}</span>
          <span class="text-dim/60 ml-auto text-[10px] truncate">${roomName}</span>
        </div>`;
      })
      .join("");

    // Attach click handler via delegation (only if not already attached)
    if (!el.dataset.clickAttached) {
      el.dataset.clickAttached = "true";
      el.addEventListener("click", (e) => {
        const item = (e.target as HTMLElement).closest(".member-item");
        if (!item) return;
        const pid = item.getAttribute("data-pid");
        if (pid) handleMemberClick(pid);
      });
    }
  }

  // ─── CHAT ──────────────────────────────────────────
  function addSysGlobal(text: string) {
    const area = meRef.current.currentArea;
    if (!area) return;
    const msgs = chatsRef.current.get(area) || [];
    msgs.push({
      text,
      sender: "",
      senderId: "",
      time: clock(),
      isSelf: false,
      isSystem: true,
    });
    if (msgs.length > MAX_MSGS_PER_ROOM)
      msgs.splice(0, msgs.length - MAX_MSGS_PER_ROOM);
    chatsRef.current.set(area, msgs);
    syncRoomChat();
  }

  function addChat(
    text: string,
    sender: string,
    senderId: string,
    time: string | undefined,
    isSelf: boolean,
  ) {
    const area = meRef.current.currentArea;
    if (!area) return;
    const msgs = chatsRef.current.get(area) || [];
    msgs.push({
      text,
      sender,
      senderId,
      time: time || clock(),
      isSelf,
      isSystem: false,
    });
    if (msgs.length > MAX_MSGS_PER_ROOM)
      msgs.splice(0, msgs.length - MAX_MSGS_PER_ROOM);
    chatsRef.current.set(area, msgs);
  }

  function addVisualBubble(pid: string) {
    visualBubblesRef.current.push({ pid, createdAt: clockRef.current });
  }

  // ─── SUPABASE HISTORY ─────────────────────────────
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

      if (error) return;

      if (data && data.length > 0) {
        const msgs: ChatMessage[] = (data as Array<Record<string, string>>).map((m) => ({
          text: m.content,
          sender: m.sender_name,
          senderId: m.sender_peer_id,
          time: new Date(m.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isSelf: m.sender_peer_id === meRef.current.peerId,
          isSystem: false,
        }));

        const existing = chatsRef.current.get(areaId) || [];
        const existingKeys = new Set(
          existing.map((m) => `${m.senderId}:${m.text}:${m.time}`),
        );
        const deduped = msgs.filter(
          (m) => !existingKeys.has(`${m.senderId}:${m.text}:${m.time}`),
        );
        const merged = [...deduped, ...existing];
        chatsRef.current.set(areaId, merged);
        syncRoomChat();
      }
    } catch {}
  }

  // ─── SEND CHAT ─────────────────────────────────────
  async function sendChat(text?: string) {
    const input = document.getElementById("chatInp") as HTMLInputElement;
    if (!input) return;
    const msg = text ?? input.value.trim();
    const area = meRef.current.currentArea;
    if (!msg || !area) return;

    input.value = "";

    const tm = clock();
    const payload = { type: "chat", text, time: tm, areaId: area };

    for (const [, dc] of connectionsRef.current) {
      if (dc?.open) sendJson(dc, payload);
    }

    addChat(msg, meRef.current.name, meRef.current.peerId, tm, true);
    addVisualBubble(meRef.current.peerId);
    syncRoomChat();
    input.value = "";
    broadcastTyping(false);

    try {
      await supabaseRef.current.from("room_messages").insert({
        room_id: roomId,
        area_id: area,
        sender_peer_id: meRef.current.peerId,
        sender_name: meRef.current.name,
        content: text,
      });
    } catch {}
  }

  // ─── PIN DIALOG ────────────────────────────────────
  function handlePinSubmit() {
    const inp = pinInputRef.current;
    if (!inp || !pinDialog) return;

    const config = areaConfigsRef.current.get(pinDialog.areaId);
    if (!config || !config.pin) {
      setPinError("Room ini gak punya PIN");
      return;
    }

    if (inp.value === config.pin) {
      // PIN bener → unlock & teleport ke dalam room
      unlockedRoomsRef.current.add(pinDialog.areaId);
      const roomDef = getRoomById(pinDialog.areaId);
      if (roomDef) {
        const d = roomDef.door;
        const margin = 20;
        // Tempatin avatar di dalam pintu
        switch (d.side) {
          case "bottom":
            meRef.current.x = d.x + d.w / 2;
            meRef.current.y = roomDef.y + roomDef.h - margin;
            break;
          case "top":
            meRef.current.x = d.x + d.w / 2;
            meRef.current.y = roomDef.y + margin;
            break;
          case "left":
            meRef.current.x = roomDef.x + margin;
            meRef.current.y = d.y + d.w / 2;
            break;
          case "right":
            meRef.current.x = roomDef.x + roomDef.w - margin;
            meRef.current.y = d.y + d.w / 2;
            break;
        }
      }
      setPinDialog(null);
      setPinError("");
      inp.value = "";
    } else {
      setPinError("❌ PIN salah, coba lagi");
      inp.value = "";
      inp.focus();
    }
  }

  function dismissPinDialog() {
    setPinDialog(null);
    setPinError("");
    if (pinInputRef.current) pinInputRef.current.value = "";
  }

  // ─── ROOM DETECTION & SWITCHING ────────────────────
  function updateArea() {
    const me = meRef.current;
    const detectedArea = detectRoom(me.x, me.y);

    // Auto-dismiss PIN dialog kalo user udah masuk ke room lain
    if (
      pinDialogRef.current &&
      detectedArea &&
      detectedArea !== pinDialogRef.current.areaId
    ) {
      setPinDialog(null);
      setPinError("");
    }

    if (detectedArea !== lastAreaRef.current && restoredRef.current) {
      // Cek kalo area baru private & belum di-unlock
      if (detectedArea) {
        const config = areaConfigsRef.current.get(detectedArea);
        if (
          config &&
          config.visibility === "private" &&
          !unlockedRoomsRef.current.has(detectedArea)
        ) {
          const roomDef = getRoomById(detectedArea);
          // Dorong avatar balik ke luar pintu
          const outside = getDoorOutsidePos(detectedArea);
          if (outside) {
            me.x = outside.x;
            me.y = outside.y;
          }
          setPinDialog({
            areaId: detectedArea,
            areaName: roomDef?.name || detectedArea,
          });
          setPinError("");
          return;
        }
      }

      // Lanjut normal — pindah area
      lastAreaRef.current = detectedArea;
      me.currentArea = detectedArea;
      upsertMember();

      if (detectedArea) {
        loadHistory(detectedArea);
        const roomDef = getRoomById(detectedArea);
        const roomName = roomDef?.name || detectedArea;

        const msgs = chatsRef.current.get(detectedArea);
        if (!msgs || msgs.length === 0) {
          chatsRef.current.set(detectedArea, [
            {
              text: `Selamat datang di ${roomName} 🎉`,
              sender: "",
              senderId: "",
              time: clock(),
              isSelf: false,
              isSystem: true,
            },
            {
              text: "⬆️⬇️⬅️➡️ / WASD — jalan",
              sender: "",
              senderId: "",
              time: clock(),
              isSelf: false,
              isSystem: true,
            },
          ]);
        }

        const ri = document.getElementById("roomInfo");
        if (ri) {
          ri.textContent = roomName;
          ri.style.display = "block";
        }
        const ci = document.getElementById("corridorInfo");
        if (ci) ci.style.display = "none";
      } else {
        const ri = document.getElementById("roomInfo");
        if (ri) ri.style.display = "none";
        const ci = document.getElementById("corridorInfo");
        if (ci) ci.style.display = "flex";
      }

      const inp = document.getElementById("chatInp") as HTMLInputElement;
      const btn = document.getElementById("sendBtn") as HTMLButtonElement;
      if (inp && !activeDmRef.current) {
        inp.disabled = !detectedArea;
        inp.placeholder = detectedArea
          ? "Ketik pesan..."
          : "🚶 Masuk ke room buat ngobrol";
      }
      if (btn) btn.disabled = !detectedArea;
      syncRoomChat();
    }

    updateNearbyTags(detectedArea);
  }

  function updateNearbyTags(area: string | null) {
    const tags = document.getElementById("nearbyTags");
    if (!tags) return;

    if (!area) {
      tags.innerHTML =
        '<span class="text-dim text-xs">🚶 Koridor — jalan doang</span>';
      return;
    }

    const sameRoom: string[] = [];
    for (const [pid, s] of peerStatesRef.current) {
      const pa = detectRoom(s.x, s.y);
      if (pa === area) sameRoom.push(s.name || pid);
    }

    if (sameRoom.length === 0) {
      tags.innerHTML =
        '<span class="text-dim text-xs">🚶 Sendirian di room ini...</span>';
    } else {
      tags.innerHTML = sameRoom
        .map(
          (n) =>
            `<span class="bg-surface2 px-2.5 py-0.5 rounded-full text-xs">${escHtml(n)}</span>`,
        )
        .join("");
    }
  }

  // ─── TYPING ────────────────────────────────────────
  function broadcastTyping(isTyping: boolean) {
    const area = meRef.current.currentArea;
    if (!area) return;
    bc({ type: "typing", typing: isTyping, areaId: area });

    if (isTyping) {
      if (typingTimeoutRef.current)
        clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(
        () => broadcastTyping(false),
        2000,
      );
    }
  }

  function updateTypingDisplay() {
    const el = document.getElementById("typingIndicator");
    if (!el) return;

    const now = clockRef.current;
    for (const [pid, ts] of typingTimestampsRef.current) {
      if (now - ts > TYPING_TIMEOUT) {
        typingTimestampsRef.current.delete(pid);
        typingNamesRef.current.delete(pid);
      }
    }

    const names = [...typingNamesRef.current.values()].filter(Boolean);
    if (names.length === 0) {
      el.style.display = "none";
    } else {
      el.style.display = "block";
      el.textContent =
        names.join(", ") +
        (names.length > 1 ? " lagi mengetik..." : " sedang mengetik...");
    }
  }

  // ─── RENDER CHAT UI ────────────────────────────────
  function syncRoomChat() {
    const log = document.getElementById("chatLog");
    if (!log) return;

    const area = meRef.current.currentArea;
    const msgs = area ? chatsRef.current.get(area) || [] : [];

    log.innerHTML = "";

    if (!area) {
      log.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5">
          <b class="text-4xl mb-2.5">🚪</b>
          Masuk ke salah satu room<br/>buat mulai ngobrol!
        </div>`;
      return;
    }

    if (msgs.length === 0) {
      log.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-dim text-sm text-center px-5">
          <b class="text-4xl mb-2.5">💬</b>
          Belum ada pesan di room ini
        </div>`;
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
        <div class="text-xs font-semibold ${m.isSelf ? "text-warning" : "text-ruangsemu"}">${escHtml(m.sender)}</div>
        <div class="inline-block px-3.5 py-2 rounded-xl text-sm leading-relaxed ${
          m.isSelf ? "bg-ruangsemu rounded-br-md" : "bg-surface2 rounded-bl-md"
        }">${escHtml(m.text)}</div>
        <div class="text-[10px] text-dim mt-0.5">${m.time}</div>
      `;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }

  // ─── CANVAS ──────────────────────────────────────────
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const transRef = useRef({ scale: 1, ox: 0, oy: 0 });

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasSizeRef.current = { w: rect.width, h: rect.height };

    const sx = rect.width / MAP_W;
    const sy = rect.height / MAP_H;
    const sc = Math.min(sx, sy) * 0.92;
    const ox = (rect.width - MAP_W * sc) / 2;
    const oy = (rect.height - MAP_H * sc) / 2;
    transRef.current = { scale: sc, ox, oy };
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { scale, ox, oy } = transRef.current;

    ctx.clearRect(0, 0, canvasSizeRef.current.w, canvasSizeRef.current.h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // Floor
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Grid
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= MAP_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAP_H);
      ctx.stroke();
    }
    for (let y = 0; y <= MAP_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_W, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#121222";
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Rooms
    for (const room of ROOMS) {
      ctx.fillStyle = room.color;
      ctx.beginPath();
      ctx.roundRect(room.x, room.y, room.w, room.h, 4);
      ctx.fill();

      ctx.fillStyle = "#8888aa55";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(room.name, room.x + room.w / 2, room.y + 24);
    }

    // Walls
    ctx.strokeStyle = "#48cae4";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.shadowColor = "#48cae455";
    ctx.shadowBlur = 6;
    const walls = wallsRef.current;
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Doors
    for (const room of ROOMS) {
      const d = room.door;
      ctx.fillStyle = "rgba(72, 202, 228, 0.25)";
      if (d.side === "bottom" || d.side === "top") {
        ctx.fillRect(d.x, d.side === "bottom" ? d.y - 4 : d.y - 2, d.w, 8);
      } else {
        ctx.fillRect(d.side === "left" ? d.x - 4 : d.x - 2, d.y, 8, d.w);
      }
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (d.side === "bottom") {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.w, d.y);
      } else if (d.side === "top") {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.w, d.y);
      } else if (d.side === "left") {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.w);
      } else {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.w);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Lock icon kalo room private
      const areaConfig = areaConfigsRef.current.get(room.id);
      if (areaConfig && areaConfig.visibility === "private") {
        const lx =
          d.side === "left"
            ? d.x - 4
            : d.side === "right"
              ? d.x + 8
              : d.x + d.w / 2 - 6;
        const ly =
          d.side === "top"
            ? d.y - 10
            : d.side === "bottom"
              ? d.y + 6
              : d.y + d.w / 2 + 8;
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffb347";
        ctx.fillText("🔒", lx, ly);
      }
    }

    // Avatars — other peers
    for (const [pid, s] of peerStatesRef.current) {
      drawAvatar(ctx, s.x, s.y, s.name || pid, pid, false);
    }
    // Self
    const me = meRef.current;
    drawAvatar(ctx, me.x, me.y, me.name || me.peerId, me.peerId, true);

    // Visual bubbles
    pruneBubbles();
    for (const bubble of visualBubblesRef.current) {
      const state =
        bubble.pid === me.peerId ? me : peerStatesRef.current.get(bubble.pid);
      if (!state) continue;
      const age = clockRef.current - bubble.createdAt;
      const alpha = Math.max(0, 1 - age / BUBBLE_DURATION);
      drawVisualBubble(ctx, state.x, state.y, alpha);
    }

    ctx.restore();
  }

  function pruneBubbles() {
    const now = clockRef.current;
    visualBubblesRef.current = visualBubblesRef.current.filter(
      (b) => now - b.createdAt < BUBBLE_DURATION,
    );
  }

  function drawVisualBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    alpha: number,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = 6;
    const bx = x - r;
    const by = y - 40 - r * 2;
    const w = 24,
      h = 16,
      cr = 6;
    ctx.fillStyle = "rgba(0, 212, 170, 0.7)";
    ctx.strokeStyle = "rgba(0, 212, 170, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + cr, by);
    ctx.lineTo(bx + w - cr, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + cr);
    ctx.lineTo(bx + w, by + h - cr);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - cr, by + h);
    ctx.lineTo(bx + cr, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - cr);
    ctx.lineTo(bx, by + cr);
    ctx.quadraticCurveTo(bx, by, bx + cr, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(0, 212, 170, 0.9)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(bx + 6 + i * 7, by + 7, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0, 212, 170, 0.7)";
    ctx.beginPath();
    ctx.moveTo(x - 4, by + h);
    ctx.lineTo(x, by + h + 6);
    ctx.lineTo(x + 4, by + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string,
    pid: string,
    self: boolean,
  ) {
    const me = meRef.current;
    const inMyRoom =
      !self && me.currentArea && detectRoom(x, y) === me.currentArea;
    const r = 16;
    ctx.save();

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const grd = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
    if (self) {
      grd.addColorStop(0, "#ffb347");
      grd.addColorStop(1, "#e67e22");
    } else if (inMyRoom) {
      grd.addColorStop(0, "#00d4aa");
      grd.addColorStop(1, "#00a886");
    } else {
      grd.addColorStop(0, "#8888bb");
      grd.addColorStop(1, "#555577");
    }
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    if (self) {
      ctx.save();
      ctx.shadowColor = "#ffb34755";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Initial
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((name || pid).charAt(0).toUpperCase(), x, y + 1);

    // Name label
    ctx.fillStyle = self ? "#ffb347" : "#e8e8f0";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(name || pid, x, y - r - 6);

    ctx.restore();
  }

  // ─── MOVEMENT ──────────────────────────────────────
  function movePlayer() {
    const keys = keysRef.current;
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowUp") || keys.has("KeyW")) dy = -SPEED;
    if (keys.has("ArrowDown") || keys.has("KeyS")) dy = SPEED;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) dx = -SPEED;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dx = SPEED;
    if (dx && dy) {
      dx *= 0.707;
      dy *= 0.707;
    }
    if (dx || dy) {
      // Lagi jalan — cancel idle timer kalo ada
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      wasMovingRef.current = true;

      const me = meRef.current;
      const result = tryMove(me.x, me.y, dx, dy, AVATAR_R, wallsRef.current);
      me.x = Math.max(AVATAR_R, Math.min(MAP_W - AVATAR_R, result.x));
      me.y = Math.max(AVATAR_R, Math.min(MAP_H - AVATAR_R, result.y));

      const now = clockRef.current;
      if (now - lastBcRef.current > BROADCAST_MS) {
        bc({ type: "mv", x: me.x, y: me.y, name: me.name });
        lastBcRef.current = now;
        reRender();
      }
    } else {
      // Lagi diem
      if (wasMovingRef.current) {
        // Baru aja berhenti — mulai idle timer 3 detik
        wasMovingRef.current = false;
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          upsertMember();
        }, 3000);
      }
      // Kalo udah diem dari awal — gak ngapa-ngapain
    }
  }

  // ─── PEERJS ────────────────────────────────────────
  useEffect(() => {
    const peerId = getPeerId();
    let peer = new Peer(peerId);
    peerRef.current = peer;

    peer.on("open", async (pid) => {
      meRef.current.peerId = pid;
      setConnStateBoth("connected");
      ensureListening();

      const members = await getExistingMembers();
      const saved = members.find((m) => m.peer_id === pid);
      if (saved) {
        meRef.current.x = saved.x;
        meRef.current.y = saved.y;
        meRef.current.currentArea = saved.current_area;
      }
      restoredRef.current = true;

      await upsertMember();

      localStorage.setItem(
        "ruangsemu_last_room",
        JSON.stringify({ roomId, peerId: pid, name: meRef.current.name }),
      );
      for (const m of members) {
        if (m.peer_id !== pid) {
          if (!peerStatesRef.current.has(m.peer_id)) {
            peerStatesRef.current.set(m.peer_id, {
              x: m.x || 200,
              y: m.y || MAP_H / 2,
              name: m.name || m.peer_id,
            });
          }
          connectTo(m.peer_id);
        }
      }
      updateCount();
      syncRoomChat();
      fetchRoomConfig();
      fetchCustomRooms();
      subscribeRoomMembers();
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        const newId = generatePeerId();
        localStorage.setItem("ruangsemu_peer_id", newId);
        meRef.current.peerId = newId;
        peer.destroy();
        peer = new Peer(newId);
        peerRef.current = peer;
        peer.on("open", async (pid) => {
          meRef.current.peerId = pid;
          ensureListening();
          await upsertMember();
          localStorage.setItem(
            "ruangsemu_last_room",
            JSON.stringify({ roomId, peerId: pid, name: meRef.current.name }),
          );
          const members = await getExistingMembers();
          for (const m of members) {
            if (m.peer_id !== pid) {
              if (!peerStatesRef.current.has(m.peer_id)) {
                peerStatesRef.current.set(m.peer_id, {
                  x: m.x || 200,
                  y: m.y || MAP_H / 2,
                  name: m.name || m.peer_id,
                });
              }
              connectTo(m.peer_id);
            }
          }
          updateCount();
          syncRoomChat();
          fetchRoomConfig();
          fetchCustomRooms();
          subscribeRoomMembers();
        });
      } else {
        setConnStateBoth("error");
      }
    });

    const handleBeforeUnload = () => {
      const me = meRef.current;
      try {
        const body = JSON.stringify({
          room_id: roomId,
          peer_id: me.peerId,
          name: me.name,
          x: Math.round(me.x),
          y: Math.round(me.y),
          current_area: me.currentArea,
          last_seen: new Date().toISOString(),
        });
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
          fetch(`${url}/rest/v1/room_members`, {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const sb = supabaseRef.current;
    const conns = connectionsRef.current;
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (isLeavingRef.current) return;
      if (roomMembersChannelRef.current) {
        sb.removeChannel(roomMembersChannelRef.current);
      }
      for (const [, dc] of conns) {
        try {
          dc.close();
        } catch {}
      }
      conns.clear();
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── GAME LOOP ──────────────────────────────────────
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function loop() {
      clockRef.current = Date.now();
      movePlayer();
      updateArea();
      drawCanvas();
      animRef.current = requestAnimationFrame(loop);
    }
    loop();

    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── KEYBOARD ───────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setProfileTarget(null);
        return;
      }
      if (document.activeElement?.id === "chatInp") {
        return;
      }
      keysRef.current.add(e.code);
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // ─── LEAVE ──────────────────────────────────────────
  const handleLeaveRoom = useCallback(async () => {
    if (!confirm("Keluar dari room?")) return;
    isLeavingRef.current = true;
    bc({ type: "typing", typing: false, areaId: meRef.current.currentArea || "" });
    if (roomMembersChannelRef.current) {
      supabaseRef.current.removeChannel(roomMembersChannelRef.current);
    }
    try {
      await supabaseRef.current
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("peer_id", meRef.current.peerId);
    } catch {}
    localStorage.removeItem("ruangsemu_last_room");
    for (const [, dc] of connectionsRef.current) {
      try {
        dc.close();
      } catch {}
    }
    connectionsRef.current.clear();
    peerStatesRef.current.clear();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    window.location.assign("/");
  }, [roomId]);

  // ─── RENDER ──────────────────────────────────────────
  return (
    <div className="h-screen w-full flex flex-row room-layout">
      {/* Canvas */}
      <div className="canvas-wrap flex-1 relative bg-surface overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* HUD top */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between pointer-events-none z-10">
          <div className="pointer-events-auto bg-bg/85 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs text-dim flex items-center gap-2">
            🏠 <strong className="text-ruangsemu">{roomId}</strong>
            <span id="onlineCount">0 online</span>
            <span className="text-warning font-semibold">{userName}</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connState === "connected"
                  ? "bg-green"
                  : connState === "connecting"
                    ? "bg-warning animate-pulse"
                    : "bg-danger"
              }`}
            />
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <button
              onClick={handleLeaveRoom}
              className="bg-bg/85 backdrop-blur-sm text-text px-3 py-1.5 rounded-xl text-xs hover:bg-surface2 transition"
            >
              🚪 Keluar
            </button>
          </div>
        </div>

        {/* HUD bottom */}
        <div className="absolute bottom-2.5 left-2.5 pointer-events-none z-10">
          <div
            id="roomInfo"
            className="bg-bg/85 backdrop-blur-sm px-4 py-1.5 rounded-xl text-sm font-semibold text-ruangsemu border border-ruangsemu/20"
            style={{ display: "none" }}
          />
          <div
            id="corridorInfo"
            className="bg-bg/80 backdrop-blur-sm px-4 py-1.5 rounded-xl text-xs text-dim"
            style={{ display: "none" }}
          >
            🚶 Koridor — jalan ke pintu buat masuk room
          </div>
        </div>

        <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10">
          <div className="bg-bg/80 backdrop-blur-sm px-3 py-1 rounded-xl text-[10px] text-dim pointer-events-auto">
            ⬆️⬇️⬅️➡️ / WASD — jalan
          </div>
        </div>

        {/* ─── PIN DIALOG ─── */}
        {pinDialog && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-surface rounded-2xl p-6 w-[300px] shadow-2xl border border-surface2 pointer-events-auto">
              <h3 className="text-lg font-bold text-ruangsemu text-center mb-2">
                🔒 {pinDialog.areaName}
              </h3>
              <p className="text-dim text-xs text-center mb-4">
                Room ini private. Masukin PIN buat masuk.
              </p>
              <input
                ref={pinInputRef}
                type="password"
                maxLength={6}
                placeholder="******"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePinSubmit();
                  if (e.key === "Escape") dismissPinDialog();
                }}
                className="w-full bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm text-center tracking-widest text-lg outline-none focus:border-ruangsemu transition placeholder:text-dim/30"
              />
              {pinError && (
                <p className="text-danger text-xs text-center mt-2">
                  {pinError}
                </p>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={dismissPinDialog}
                  className="flex-1 bg-ghost text-dim py-2.5 rounded-xl text-sm hover:text-text transition"
                >
                  Batal
                </button>
                <button
                  onClick={handlePinSubmit}
                  className="flex-1 bg-ruangsemu text-black font-bold py-2.5 rounded-xl text-sm hover:bg-ruangsemu-dark transition"
                >
                  Masuk
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── PROFILE DIALOG ─── */}
        {profileTarget && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-surface rounded-2xl p-5 w-[260px] shadow-2xl border border-surface2 pointer-events-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text">👤 Profil</h3>
                <button
                  onClick={() => setProfileTarget(null)}
                  className="text-dim hover:text-text transition text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                    profileTarget.isMe
                      ? "bg-warning/20 text-warning"
                      : "bg-accent-blue/20 text-accent-blue"
                  }`}
                >
                  {profileTarget.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm text-text font-semibold">
                    {profileTarget.name}
                  </div>
                  <div className="text-[11px] text-dim">
                    {profileTarget.area
                      ? getRoomById(profileTarget.area)?.name ||
                        profileTarget.area
                      : "🚶 Koridor"}
                  </div>
                </div>
              </div>
              {!profileTarget.isMe && (
                <button
                  onClick={() => startDm(profileTarget.pid, profileTarget.name)}
                  className="w-full bg-ruangsemu/20 text-ruangsemu font-semibold py-2 rounded-xl text-sm hover:bg-ruangsemu/30 transition"
                >
                  💬 Kirim DM
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="side-panel w-[340px] max-w-[90vw] bg-surface border-l border-surface2 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface2 shrink-0">
          {activeDm ? (
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-dim flex items-center gap-2">
                <button
                  onClick={() => setActiveDmBoth(null)}
                  className="text-xs text-ruangsemu hover:text-ruangsemu-dark transition mr-1"
                >
                  ← Kembali
                </button>
                💌 DM ·{" "}
                <span className="text-ruangsemu">{dmTargetName}</span>
              </h3>
            </div>
          ) : (
            <>
              <h3 className="text-xs font-semibold text-dim flex items-center gap-2">
                💬 Ngobrol ·{" "}
                <span id="roomCount" className="text-ruangsemu">
                  0 orang
                </span>
              </h3>
              <div
                id="nearbyTags"
                className="flex flex-wrap gap-1.5 mt-1.5 min-h-5"
              >
                <span className="text-dim text-xs">👥</span>
              </div>
            </>
          )}
        </div>

        {/* Member list */}
        <div
          className="border-b border-surface2 shrink-0 max-h-[180px] overflow-y-auto custom-scroll"
          style={{ display: activeDm ? "none" : undefined }}
        >
          <div id="memberList" className="px-2 py-1.5" />
        </div>

        {/* Chat log — Room */}
        <div
          id="chatLog"
          className="flex-1 overflow-y-auto px-4 py-2.5 min-h-0 custom-scroll"
          style={{ display: activeDm ? "none" : undefined }}
        />

        {/* Chat log — DM */}
        <div
          id="dmChatLog"
          className="flex-1 overflow-y-auto px-4 py-2.5 min-h-0 custom-scroll"
          style={{ display: activeDm ? undefined : "none" }}
        />

        {/* Typing indicator */}
        <div
          id="typingIndicator"
          className="px-4 py-1 text-xs text-dim italic min-h-0"
          style={{ display: "none" }}
        />

        {/* ─── CREATOR CONTROLS ─── */}
        {isCreator && !activeDm && (
          <div className="border-t border-surface2 shrink-0">
            <button
              onClick={() => setCreatorPanelOpen(!creatorPanelOpen)}
              className="w-full px-4 py-2 text-xs text-dim hover:text-text transition flex items-center justify-between"
            >
              <span>⚙️ Room Settings</span>
              <span
                className={`transition-transform ${creatorPanelOpen ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>
            {creatorPanelOpen && (
              <div className="px-4 pb-3 space-y-2.5">
                {ROOMS.map((r) => {
                  const cfg = areaConfigs.get(r.id);
                  const isPrivate = cfg?.visibility === "private" || false;
                  const isEditing = editPinFor === r.id;
                  return (
                    <div key={r.id} className="bg-bg rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-text">
                          {r.name}
                        </span>
                        <button
                          onClick={() => {
                            if (isPrivate) {
                              updateAreaConfig(r.id, "public", null);
                            } else {
                              const defaultPin = Math.floor(
                                1000 + Math.random() * 9000,
                              ).toString();
                              updateAreaConfig(r.id, "private", defaultPin);
                              setEditPinFor(r.id);
                              setEditPinVal(defaultPin);
                            }
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition ${
                            isPrivate
                              ? "bg-warning/20 text-warning"
                              : "bg-ruangsemu/20 text-ruangsemu"
                          }`}
                        >
                          {isPrivate ? "🔒 Private" : "🌍 Public"}
                        </button>
                      </div>
                      {isPrivate && !isEditing && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-dim">
                            PIN: {cfg?.pin ? "•".repeat(cfg.pin.length) : "—"}
                          </span>
                          <button
                            onClick={() => {
                              setEditPinFor(r.id);
                              setEditPinVal(cfg?.pin || "");
                            }}
                            className="text-[11px] text-ruangsemu hover:text-ruangsemu-dark transition"
                          >
                            Ganti
                          </button>
                        </div>
                      )}
                      {isPrivate && isEditing && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="text"
                            maxLength={6}
                            value={editPinVal}
                            onChange={(e) => setEditPinVal(e.target.value)}
                            placeholder="PIN baru..."
                            className="flex-1 bg-surface2 rounded-lg px-2.5 py-1.5 text-xs text-text outline-none focus:border-ruangsemu transition border border-transparent"
                          />
                          <button
                            onClick={() => {
                              if (editPinVal.trim()) {
                                updateAreaConfig(
                                  r.id,
                                  "private",
                                  editPinVal.trim(),
                                );
                              }
                              setEditPinFor(null);
                            }}
                            className="text-[11px] bg-ruangsemu text-black font-semibold px-2.5 py-1.5 rounded-lg hover:bg-ruangsemu-dark transition"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditPinFor(null)}
                            className="text-[11px] text-dim px-1.5 hover:text-text transition"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Buat Room Baru */}
                <div className="bg-bg rounded-xl p-3">
                  {showCreateRoom ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text">
                          🏗️ Room Baru
                        </span>
                        <button
                          onClick={() => {
                            setShowCreateRoom(false);
                            setNewRoomName("");
                          }}
                          className="text-dim hover:text-text transition text-sm"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateRoom();
                        }}
                        placeholder="Nama room..."
                        className="w-full bg-surface2 rounded-lg px-2.5 py-1.5 text-xs text-text outline-none focus:border-ruangsemu transition border border-transparent"
                      />
                      <button
                        onClick={handleCreateRoom}
                        className="w-full bg-ruangsemu text-black text-xs font-semibold py-1.5 rounded-lg hover:bg-ruangsemu-dark transition"
                      >
                        ➕ Buat
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCreateRoom(true)}
                      className="w-full text-xs text-ruangsemu font-semibold py-1.5 hover:text-ruangsemu-dark transition flex items-center justify-center gap-1"
                    >
                      ➕ Buat Room Baru
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-2.5 border-t border-surface2 shrink-0">
          <div className="flex gap-2">
            <input
              id="chatInp"
              type="text"
              placeholder={
                activeDm ? "Ketik DM..." : "🚶 Masuk ke room buat ngobrol..."
              }
              autoComplete="off"
              onInput={() => {
                if (!activeDmRef.current) broadcastTyping(true);
              }}
              onBlur={() => broadcastTyping(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const inp = e.target as HTMLInputElement;
                  const text = inp.value.trim();
                  if (!text) return;
                  if (activeDmRef.current) {
                    inp.value = "";
                    sendDm(text);
                  } else {
                    sendChat(text);
                  }
                }
              }}
              className="flex-1 bg-bg border border-surface2 rounded-full px-4 py-2.5 text-text text-sm outline-none focus:border-ruangsemu transition disabled:opacity-40"
            />
            <button
              id="sendBtn"
              onClick={() => {
                if (activeDmRef.current) {
                  const inp = document.getElementById(
                    "chatInp",
                  ) as HTMLInputElement;
                  const text = inp.value.trim();
                  if (!text) return;
                  inp.value = "";
                  sendDm(text);
                } else {
                  sendChat();
                }
              }}
              className="w-[42px] h-[42px] rounded-full bg-ruangsemu text-black flex items-center justify-center text-lg shrink-0 hover:bg-ruangsemu-dark transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ➤
            </button>
          </div>
          <div id="chatHint" className="text-[11px] text-dim mt-1 min-h-4">
            {activeDm
              ? "💌 Pesan hanya kalian berdua yang lihat"
              : "Masuk ke room buat mulai ngobrol"}
          </div>
        </div>
      </div>
    </div>
  );
}
