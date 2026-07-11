"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/realtime-js";
import { randomPos } from "@/lib/utils";

interface PeerState {
  x: number;
  y: number;
  name: string;
  currentArea?: string | null;
}

interface UsePeerConnectionProps {
  roomId: string;
  userName: string;
  userId: string;
  onPeerJoin: (peerId: string, name: string, area: string | null) => void;
  onPeerLeave: (peerId: string, name: string) => void;
  onMessage: (sid: string, data: Record<string, unknown>) => void;
  onSyncRequest?: () => void;
}

export function usePeerConnection({
  roomId,
  userName,
  userId,
  onPeerJoin,
  onPeerLeave,
  onMessage,
  onSyncRequest,
}: UsePeerConnectionProps) {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());
  const roomMembersChannelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  const isLeavingRef = useRef(false);
  const isListeningRef = useRef(false);
  const [connState, setConnState] = useState<"connecting" | "connected" | "error">("connecting");

  const meRef = useRef({
    x: 200,
    y: 500,
    peerId: "",
    userId,
    name: userName,
    currentArea: null as string | null,
  });

  const restorePosition = useCallback(async () => {
    const members = await getExistingMembers();
    const saved = members.find((m) => m.user_id === meRef.current.userId);
    if (saved) {
      meRef.current.x = saved.x;
      meRef.current.y = saved.y;
      meRef.current.currentArea = saved.current_area;
    }
    return members;
  }, []);

  async function getExistingMembers() {
    try {
      const { data } = await supabaseRef.current
        .from("room_members")
        .select("user_id, peer_id, name, x, y, current_area")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      return (data || []) as { user_id: string; peer_id: string; name: string; x: number; y: number; current_area: string | null }[];
    } catch {
      return [];
    }
  }

  const upsertMember = useCallback(async () => {
    const me = meRef.current;
    try {
      await supabaseRef.current.from("room_members").upsert(
        {
          room_id: roomId,
          user_id: me.userId,
          peer_id: me.peerId,
          name: me.name,
          x: Math.round(me.x),
          y: Math.round(me.y),
          current_area: me.currentArea,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "room_id,user_id" },
      );
    } catch (e) {
      console.error("upsertMember error:", e);
    }
  }, [roomId]);

  async function deleteMember() {
    try {
      await supabaseRef.current
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", meRef.current.userId);
    } catch {}
  }

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
      peerStatesRef.current.set(pid, { x: rp.x, y: rp.y, name: pid });
      onPeerJoin(pid, pid, null);
    }

    const others: string[] = [];
    for (const [p] of connectionsRef.current) if (p !== pid) others.push(p);
    sendJson(dc, { type: "pl", peers: others });
    sendJson(dc, { type: "mv", x: meRef.current.x, y: meRef.current.y, name: meRef.current.name });
    bc({ type: "pj", pid, name: pid }, pid);
  }

  function setupDC(dc: DataConnection, pid: string) {
    dc.on("data", (d: unknown) => handleMsg(pid, d));
    dc.on("close", () => handleLeave(pid));
    dc.on("error", () => {});
  }

  function handleMsg(sid: string, raw: unknown) {
    let data: Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
    } else if (raw && typeof raw === "object") {
      data = raw as Record<string, unknown>;
    } else {
      return;
    }
    if (!data.type) return;
    onMessage(sid, data);
  }

  function sendJson(dc: DataConnection, data: Record<string, unknown>) {
    try {
      dc.send(JSON.stringify(data));
    } catch {}
  }

  const bc = useCallback((data: Record<string, unknown>, exclude?: string) => {
    const j = JSON.stringify(data);
    for (const [pid, dc] of connectionsRef.current) {
      if (pid !== exclude && dc.open) {
        try {
          dc.send(j);
        } catch {}
      }
    }
  }, []);

  function connectTo(pid: string) {
    if (connectionsRef.current.has(pid) || pid === meRef.current.peerId || !peerRef.current) return;

    const dc = peerRef.current.connect(pid, { reliable: true });
    dc.on("open", () => {
      if (connectionsRef.current.has(pid)) {
        dc.close();
        return;
      }
      connectionsRef.current.set(pid, dc);
      setupDC(dc, pid);
      if (!peerStatesRef.current.has(pid)) {
        const rp = randomPos();
        peerStatesRef.current.set(pid, { x: rp.x, y: rp.y, name: pid });
        onPeerJoin(pid, pid, null);
      }
      sendJson(dc, { type: "mv", x: meRef.current.x, y: meRef.current.y, name: meRef.current.name });
    });
    dc.on("error", () => {});
  }

  function handleLeave(pid: string) {
    connectionsRef.current.delete(pid);
    const s = peerStatesRef.current.get(pid);
    const name = s?.name || pid;
    peerStatesRef.current.delete(pid);
    onPeerLeave(pid, name);
  }

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
        (payload: RealtimePostgresChangesPayload<{ user_id: string; peer_id: string; name: string; x: number; y: number; current_area: string | null }>) => {
          if (!payload.new || !("peer_id" in payload.new)) return;
          const m = payload.new;
          if (m.user_id === meRef.current.userId) return;
          if (!peerStatesRef.current.has(m.peer_id)) {
            peerStatesRef.current.set(m.peer_id, { x: m.x || 200, y: m.y || 0, name: m.name || m.peer_id });
            onPeerJoin(m.peer_id, m.name || m.peer_id, m.current_area);
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
        (payload: RealtimePostgresChangesPayload<{ user_id: string; peer_id: string }>) => {
          if (!payload.old || !("peer_id" in payload.old)) return;
          const old = payload.old;
          if (old.user_id === meRef.current.userId) return;
          handleLeave(old.peer_id!);
        },
      )
      .subscribe();

    roomMembersChannelRef.current = channel;
  }

  const handleLeaveRoom = useCallback(async () => {
    if (!confirm("Keluar dari room?")) return;
    isLeavingRef.current = true;
    bc({ type: "typing", typing: false, areaId: meRef.current.currentArea || "" });
    if (roomMembersChannelRef.current) {
      supabaseRef.current.removeChannel(roomMembersChannelRef.current);
    }
    await deleteMember();
    localStorage.removeItem("ruangsemu_last_room");
    for (const [, dc] of connectionsRef.current) {
      try { dc.close(); } catch {}
    }
    connectionsRef.current.clear();
    peerStatesRef.current.clear();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    window.location.assign("/");
  }, []);

  // Main peer setup effect
  useEffect(() => {
    const peerId = localStorage.getItem("ruangsemu_peer_id") || crypto.randomUUID();
    localStorage.setItem("ruangsemu_peer_id", peerId);
    meRef.current.peerId = peerId;

    let peer = new Peer(peerId);
    peerRef.current = peer;

    peer.on("open", async (pid) => {
      meRef.current.peerId = pid;
      setConnState("connected");
      ensureListening();

      const members = await restorePosition();
      await upsertMember();

      localStorage.setItem(
        "ruangsemu_last_room",
        JSON.stringify({ roomId, peerId: pid, name: meRef.current.name }),
      );
      for (const m of members) {
        if (m.peer_id !== pid) {
          if (!peerStatesRef.current.has(m.peer_id)) {
            peerStatesRef.current.set(m.peer_id, { x: m.x || 200, y: m.y || 0, name: m.name || m.peer_id });
            onPeerJoin(m.peer_id, m.name || m.peer_id, m.current_area);
          }
          connectTo(m.peer_id);
        }
      }
      onSyncRequest?.();
      fetchRoomConfig();
      fetchCustomRooms();
      subscribeRoomMembers();
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        const newId = crypto.randomUUID();
        localStorage.setItem("ruangsemu_peer_id", newId);
        meRef.current.peerId = newId;
        peer.destroy();
        peer = new Peer(newId);
        peerRef.current = peer;
        peer.on("open", async (pid) => {
          meRef.current.peerId = pid;
          ensureListening();
          await upsertMember();
          localStorage.setItem("ruangsemu_last_room", JSON.stringify({ roomId, peerId: pid, name: meRef.current.name }));
          const members = await getExistingMembers();
          for (const m of members) {
            if (m.peer_id !== pid) {
              if (!peerStatesRef.current.has(m.peer_id)) {
                peerStatesRef.current.set(m.peer_id, { x: m.x || 200, y: m.y || 0, name: m.name || m.peer_id });
                onPeerJoin(m.peer_id, m.name || m.peer_id, m.current_area);
              }
              connectTo(m.peer_id);
            }
          }
onSyncRequest?.();
          fetchRoomConfig();
          fetchCustomRooms();
          subscribeRoomMembers();
        });
      } else {
        setConnState("error");
      }
    });

    const handleBeforeUnload = () => {
      const me = meRef.current;
      try {
        const body = JSON.stringify({
          room_id: roomId,
          user_id: me.userId,
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
            headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
            body, keepalive: true,
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
      if (roomMembersChannelRef.current) sb.removeChannel(roomMembersChannelRef.current);
      for (const [, dc] of conns) { try { dc.close(); } catch {} }
      conns.clear();
      if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    };
  }, [roomId, onPeerJoin, onPeerLeave, onSyncRequest]);

  // Exposed refs and functions
  return {
    meRef,
    peerStatesRef,
    connectionsRef,
    connState,
    setMeArea: (area: string | null) => { meRef.current.currentArea = area; },
    upsertMember,
    bc,
    sendJson,
    handleLeaveRoom,
  };
}

// Placeholder - these will be moved to useRoomConfig
async function fetchRoomConfig() {}
async function fetchCustomRooms() {}