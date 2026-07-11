"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { useChat, useTyping } from "@/hooks/useChat";
import { useRoomConfig } from "@/hooks/useRoomConfig";
import { MemberList } from "@/components/MemberList";
import { PinDialog } from "@/components/PinDialog";
import { ProfileDialog } from "@/components/ProfileDialog";
import { CreatorPanel } from "@/components/CreatorPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { createClient } from "@/lib/supabase/client";
import {
  MAP_W,
  MAP_H,
  AVATAR_R,
  getWallSegments,
  tryMove,
  detectRoom,
  getAllRooms,
  type WallSegment,
} from "@/lib/map";
import { BROADCAST_MS, SPEED } from "@/lib/map";
import type { AreaConfig } from "@/lib/types";

interface VisualBubble {
  pid: string;
  createdAt: number;
}

interface RoomViewProps {
  roomId: string;
  userName: string;
  userId: string;
}

interface VisualBubble {
  pid: string;
  createdAt: number;
}

// Module-level refs for handleMsg to access chat/typing
const chatRefModule = { current: null as ReturnType<typeof useChat> | null };
const typingRefModule = { current: null as ReturnType<typeof useTyping> | null };
let bumpChatVersion: (() => void) | null = null;

function handleMsg(sid: string, data: Record<string, unknown>) {
  const type = data.type as string;
  const chat = chatRefModule.current;
  const typing = typingRefModule.current;

  if (type === "chat") {
    chat?.addChat(data.text as string, data.name as string || sid, sid, data.time as string, false, data.areaId as string);
    bumpChatVersion?.();
    return;
  }
  if (type === "dm") {
    chat?.handleDmReceived(sid, data.name as string || sid, data.text as string, data.time as string);
    return;
  }
  if (type === "typing") {
    typing?.handleTypingReceived(sid, data.name as string || sid, data.typing as boolean, data.areaId as string);
    return;
  }
}

export default function RoomView({ roomId, userName, userId }: RoomViewProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastBcRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasMovingRef = useRef(false);
  const wallsRef = useRef<WallSegment[]>([]);
  const visualBubblesRef = useRef<VisualBubble[]>([]);
  const clockRef = useRef<number>(0);

  // Peer states for render - sync with peer.peerStatesRef
  const [peerStates, setPeerStates] = useState<
    Map<string, { x: number; y: number; name: string }>
  >(new Map());
  // Me state for render - sync with peer.meRef
  const [me, setMe] = useState<{
    peerId: string;
    userId: string;
    name: string;
    currentArea: string | null;
    x: number;
    y: number;
  }>({
    peerId: "",
    userId: "",
    name: "",
    currentArea: null,
    x: 0,
    y: 0,
  });
  const [chatVersion, setChatVersion] = useState(0);

  // Realtime subscription for room_messages
  const areaConfigsRef = useRef<Map<string, AreaConfig>>(new Map());
  const unlockedRoomsRef = useRef<Set<string>>(new Set());

  // Chat refs for breaking circular dependency
  const chatRef = useRef<ReturnType<typeof useChat> | null>(null);
  const configRef = useRef<ReturnType<typeof useRoomConfig> | null>(null);

  // Stable callbacks to prevent usePeerConnection effect re-run
  const handlePeerJoin = useCallback((pid: string, name: string, _area: string | null) => {
    chatRef.current?.addSysGlobal(`${name} masuk room 🚶`);
    bumpChatVersion?.();
  }, []);
  const handlePeerLeave = useCallback((pid: string, name: string) => {
    chatRef.current?.addSysGlobal(`${name} keluar room 👋`);
    bumpChatVersion?.();
  }, []);

  const peer = usePeerConnection({
    roomId,
    userName,
    userId,
    onPeerJoin: handlePeerJoin,
    onPeerLeave: handlePeerLeave,
    onMessage: handleMsg,
  });

  const { connState, handleLeaveRoom, meRef: peerMeRef, bc, peerStatesRef: peerPeerStatesRef, sendJson, connectionsRef, upsertMember, version, onlineCount } = peer;

  // Typing
  const typing = useTyping(peerMeRef, bc);
  typingRefModule.current = typing;

  // Chat
  const chat = useChat({
    roomId,
    meRef: peerMeRef,
    sendJson,
    connectionsRef,
  });
  chatRefModule.current = chat;
  bumpChatVersion = () => setChatVersion((v) => v + 1);

  const handleSendChat = useCallback((text: string) => {
    chat.sendChat(text);
    setChatVersion((v) => v + 1);
  }, [chat]);

  const handleLoadHistory = useCallback((areaId: string) => {
    chat.loadHistory(areaId);
    setChatVersion((v) => v + 1);
  }, [chat]);

  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  // Realtime subscription for room_messages (chat via Supabase)
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`room-msgs-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          const m = payload.new;
          if (!m || m.sender_user_id === userId) return;
          const c = chatRef.current;
          if (!c) return;
          c.addChat(m.content, m.sender_name, m.sender_user_id, new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), false, m.area_id);
          setChatVersion((v) => v + 1);
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [roomId, userId]);

  // Sync peerStates with peer.peerStatesRef for render
  useEffect(() => {
    setPeerStates(new Map(peerPeerStatesRef.current));
  }, [version]);

  // Sync me with peer.meRef for render
  useEffect(() => {
    setMe({
      peerId: peerMeRef.current.peerId,
      userId: peerMeRef.current.userId,
      name: peerMeRef.current.name,
      currentArea: peerMeRef.current.currentArea,
      x: peerMeRef.current.x,
      y: peerMeRef.current.y,
    });
  }, [peerMeRef]);

  // Room config
  const config = useRoomConfig({
    roomId,
    meRef: peerMeRef,
    areaConfigsRef,
    wallsRef,
    unlockedRoomsRef,
    upsertMember,
    onConfigChange: () => {},
  });

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Local state
  const [profileTarget, setProfileTarget] = useState<{
    pid: string;
    name: string;
    area: string | null;
    isMe: boolean;
  } | null>(null);

  // Fetch config on mount
  useEffect(() => {
    config.fetchRoomConfig();
    config.fetchCustomRooms();
  }, [config.fetchRoomConfig, config.fetchCustomRooms]);

  // Duplicate data handlers removed — already handled in usePeerConnection setupDC

// Member click
  const handleMemberClick = useCallback(
    (pid: string) => {
      const me = peerMeRef.current;
      if (pid === me.peerId) {
        setProfileTarget({
          pid: me.peerId,
          name: me.name,
          area: me.currentArea,
          isMe: true,
        });
        return;
      }
      const s = peerPeerStatesRef.current.get(pid);
      if (!s) return;
      setProfileTarget({ pid, name: s.name || pid, area: detectRoom(s.x, s.y), isMe: false });
    },
    [peerPeerStatesRef],
  );

  // Start DM
  const startDm = useCallback(
    (targetPid: string, targetName: string) => {
      setProfileTarget(null);
      chat.startDm(targetPid, targetName);
    },
    [chat],
  );

  // Movement
  const keysRef = useRef<Set<string>>(new Set());
  const movePlayer = useCallback(() => {
    const keys = keysRef.current;
    let dx = 0,
      dy = 0;
    if (keys.has("ArrowUp") || keys.has("KeyW")) dy = -SPEED;
    if (keys.has("ArrowDown") || keys.has("KeyS")) dy = SPEED;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) dx = -SPEED;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dx = SPEED;
    if (dx && dy) {
      dx *= 0.707;
      dy *= 0.707;
    }
    if (dx || dy) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      wasMovingRef.current = true;
      // Use tryMove with peerMeRef for collision detection
      const result = tryMove(peerMeRef.current.x, peerMeRef.current.y, dx, dy, AVATAR_R, wallsRef.current);
      peerMeRef.current.x = Math.max(AVATAR_R, Math.min(MAP_W - AVATAR_R, result.x));
      peerMeRef.current.y = Math.max(AVATAR_R, Math.min(MAP_H - AVATAR_R, result.y));
      // Update me state for render
      setMe((prev) => ({ ...prev, x: peerMeRef.current.x, y: peerMeRef.current.y }));
      const now = clockRef.current;
      if (now - lastBcRef.current > BROADCAST_MS) {
        bc({ type: "mv", x: peerMeRef.current.x, y: peerMeRef.current.y, name: me.name });
        upsertMember();
        lastBcRef.current = now;
      }
    } else {
      if (wasMovingRef.current) {
        wasMovingRef.current = false;
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          upsertMember();
        }, 3000);
      }
    }
  }, [me.name, bc, upsertMember]);

  // Game loop
  useEffect(() => {
    function loop() {
      movePlayer();
      // Area check (read from ref for latest position, not stale state)
      const detectedArea = detectRoom(peerMeRef.current.x, peerMeRef.current.y);
      config.checkAreaAccess(detectedArea);
      if (detectedArea !== me.currentArea) {
        setMe((prev) => ({ ...prev, currentArea: detectedArea }));
      }
      // Draw
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const parent = canvas.parentElement!;
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + "px";
        canvas.style.height = rect.height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sx = rect.width / MAP_W,
          sy = rect.height / MAP_H,
          sc = Math.min(sx, sy) * 0.92;
        const ox = (rect.width - MAP_W * sc) / 2,
          oy = (rect.height - MAP_H * sc) / 2;
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(sc, sc);

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
        for (const room of getAllRooms()) {
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
        for (const w of wallsRef.current) {
          ctx.beginPath();
          ctx.moveTo(w.x1, w.y1);
          ctx.lineTo(w.x2, w.y2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Doors + locks
        for (const room of getAllRooms()) {
          const d = room.door;
          ctx.fillStyle = "rgba(72, 202, 228, 0.25)";
          if (d.side === "bottom" || d.side === "top")
            ctx.fillRect(d.x, d.side === "bottom" ? d.y - 4 : d.y - 2, d.w, 8);
          else ctx.fillRect(d.side === "left" ? d.x - 4 : d.x - 2, d.y, 8, d.w);
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

        // Avatars
        function drawAvatar(
          ctx: CanvasRenderingContext2D,
          x: number,
          y: number,
          name: string,
          pid: string,
          self: boolean,
        ) {
          const inMyRoom =
            !self && me.currentArea && detectRoom(x, y) === me.currentArea;
          const r = 16;
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
          ctx.fill();
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
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((name || pid).charAt(0).toUpperCase(), x, y + 1);
          ctx.fillStyle = self ? "#ffb347" : "#e8e8f0";
          ctx.font = "10px sans-serif";
          ctx.textBaseline = "bottom";
          ctx.fillText(name || pid, x, y - r - 6);
          ctx.restore();
        }

        // Other peers
        for (const [pid, s] of peer.peerStatesRef.current)
          drawAvatar(ctx, s.x, s.y, s.name || pid, pid, false);
        // Self
        drawAvatar(ctx, peer.meRef.current.x, peer.meRef.current.y, peer.meRef.current.name || peer.meRef.current.peerId, peer.meRef.current.peerId, true);

        // Visual bubbles
        const now = clockRef.current;
        visualBubblesRef.current = visualBubblesRef.current.filter(
          (b) => now - b.createdAt < 2500,
        );
        for (const bubble of visualBubblesRef.current) {
          const state =
            bubble.pid === me.peerId
              ? me
              : peer.peerStatesRef.current.get(bubble.pid);
          if (!state) continue;
          const age = now - bubble.createdAt;
          const alpha = Math.max(0, 1 - age / 2500);
          // Draw bubble
          ctx.save();
          ctx.globalAlpha = alpha;
          const r = 6;
          const bx = state.x - r,
            by = state.y - 40 - r * 2,
            w = 24,
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
          ctx.moveTo(state.x - 4, by + h);
          ctx.lineTo(state.x, by + h + 6);
          ctx.lineTo(state.x + 4, by + h);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        ctx.restore();
      }
      animRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => cancelAnimationFrame(animRef.current);
  }, [movePlayer]);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setProfileTarget(null);
        return;
      }
      if (document.activeElement?.id === "chatInp") return;
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

  // Initialize walls
  useEffect(() => {
    wallsRef.current = getWallSegments();
  }, []);

  // Render
  return (
    <div className="room-layout" style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "row" }}>
      {/* Canvas */}
      <div className="canvas-wrap" style={{ flex: 1, position: "relative", background: "var(--color-surface)", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />

        {/* HUD top */}
        <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", pointerEvents: "none", zIndex: 10 }}>
          <div style={{ pointerEvents: "auto", background: "color-mix(in srgb, var(--color-bg) 85%, transparent)", backdropFilter: "blur(4px)", padding: "6px 12px", borderRadius: "12px", fontSize: "12px", color: "var(--color-dim)", display: "flex", alignItems: "center", gap: "8px" }}>
            🏠 <strong style={{ color: "var(--color-warning)" }}>{roomId}</strong>
            <span id="onlineCount">{onlineCount} online</span>
            <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>{userName}</span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connState === "connected" ? "var(--color-ruangsemu)" : connState === "connecting" ? "var(--color-warning)" : "var(--color-danger)",
              }}
            />
          </div>
          <div style={{ pointerEvents: "auto", display: "flex", gap: "6px" }}>
            <button
              onClick={handleLeaveRoom}
              style={{
                background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
                backdropFilter: "blur(4px)",
                color: "var(--color-text)",
                padding: "6px 12px",
                borderRadius: "12px",
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
              }}
            >
              🚪 Keluar
            </button>
          </div>
        </div>

        {/* HUD bottom */}
        <div style={{ position: "absolute", bottom: 10, left: 10, pointerEvents: "none", zIndex: 10 }}>
          <div
            id="roomInfo"
            style={{
              display: "none",
              background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
              backdropFilter: "blur(4px)",
              padding: "6px 16px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--color-warning)",
              border: "1px solid color-mix(in srgb, var(--color-warning) 20%, transparent)",
            }}
          />
          <div
            id="corridorInfo"
            style={{
              display: "none",
              background: "color-mix(in srgb, var(--color-bg) 80%, transparent)",
              backdropFilter: "blur(4px)",
              padding: "6px 16px",
              borderRadius: "12px",
              fontSize: "12px",
              color: "var(--color-dim)",
            }}
          >
            🚶 Koridor — jalan ke pintu buat masuk room
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 10, right: 10, pointerEvents: "none", zIndex: 10 }}>
          <div style={{ background: "color-mix(in srgb, var(--color-bg) 80%, transparent)", backdropFilter: "blur(4px)", padding: "4px 12px", borderRadius: "12px", fontSize: "10px", color: "var(--color-dim)", pointerEvents: "auto" }}>
            ⬆️⬇️⬅️➡️ / WASD — jalan
          </div>
        </div>

        {/* Pin Dialog */}
        <PinDialog
          isOpen={!!config.pinDialog}
          areaName={config.pinDialog?.areaName || ""}
          error={config.pinError}
          onSubmit={config.handlePinSubmit}
          onClose={config.dismissPinDialog}
        />

        {/* Profile Dialog */}
        <ProfileDialog
          target={profileTarget}
          onClose={() => setProfileTarget(null)}
          onStartDm={startDm}
        />
      </div>

      {/* Side Panel */}
      <div className="side-panel" style={{ width: 340, maxWidth: "90vw", background: "var(--color-surface)", borderLeft: "1px solid var(--color-surface2)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <ChatPanel
          area={me.currentArea}
          chatsRef={chat.chatsRef}
          activeDm={chat.activeDm}
          setActiveDm={chat.setActiveDm}
          dmMessagesRef={chat.dmMessagesRef}
          me={me}
          peerStates={peerStates}
          activeDmRef={chat.activeDmRef}
          dmTargetName={chat.dmTargetName}
          sendDm={chat.sendDm}
          sendChat={handleSendChat}
          broadcastTyping={typing.broadcastTyping}
          loadHistory={handleLoadHistory}
          syncRoomChat={() => {}}
          syncDmChat={() => {}}
          typingNamesRef={typing.typingNamesRef}
          chatVersion={chatVersion}
        />
        <MemberList
          me={me}
          peerStates={peerStates}
          onMemberClick={handleMemberClick}
        />
        <CreatorPanel
          isOpen={true}
          isCreator={config.isCreator}
          areaConfigsRef={areaConfigsRef}
          onToggleConfig={config.updateAreaConfig}
          onUpdateConfig={config.updateAreaConfig}
          onCreateRoom={config.handleCreateRoom}
          configDirty={config.configDirty}
        />
      </div>
    </div>
  );
}
