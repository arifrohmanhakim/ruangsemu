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
}

interface VisualBubble {
  pid: string;
  createdAt: number;
}

function handleMsg(_sid: string, data: Record<string, unknown>) {
  // Implementation will be below
}

export default function RoomView({ roomId, userName }: RoomViewProps) {
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
    name: string;
    currentArea: string | null;
    x: number;
    y: number;
  }>({
    peerId: "",
    name: "",
    currentArea: null,
    x: 0,
    y: 0,
  });

  // Area config
  const areaConfigsRef = useRef<Map<string, AreaConfig>>(new Map());
  const unlockedRoomsRef = useRef<Set<string>>(new Set());

  // Chat refs for breaking circular dependency
  const chatRef = useRef<ReturnType<typeof useChat> | null>(null);
  const configRef = useRef<ReturnType<typeof useRoomConfig> | null>(null);

// Peer connection
  const peer = usePeerConnection({
    roomId,
    userName,
    onPeerJoin: (pid, name, _area) => chatRef.current?.addSysGlobal(`${name} masuk room 🚶`),
    onPeerLeave: (pid, name) => chatRef.current?.addSysGlobal(`${name} keluar room 👋`),
    onMessage: handleMsg,
  });

  const { connState, handleLeaveRoom, meRef: peerMeRef, bc, peerStatesRef: peerPeerStatesRef, sendJson, connectionsRef, upsertMember } = peer;

  // Typing
  const typing = useTyping(peerMeRef, bc);

  // Chat
  const chat = useChat({
    roomId,
    meRef: peerMeRef,
    sendJson,
    connectionsRef,
  });

  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  // Sync peerStates with peer.peerStatesRef for render
  useEffect(() => {
    setPeerStates(new Map(peerPeerStatesRef.current));
  }, [peerPeerStatesRef]);

  // Sync me with peer.meRef for render
  useEffect(() => {
    setMe({
      peerId: peerMeRef.current.peerId,
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
  }, [config]);

  // Handle incoming messages
  useEffect(() => {
    for (const [, dc] of connectionsRef.current) {
      dc.on("data", (d: unknown) =>
        handleMsg(dc.peer as string, d as Record<string, unknown>),
      );
    }
  }, [connectionsRef]);

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

  // Area detection
  useEffect(() => {
    const detectedArea = detectRoom(me.x, me.y);
    config.checkAreaAccess(detectedArea);
  }, [me, config]);

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
      // Area check
      const detectedArea = detectRoom(me.x, me.y);
      config.checkAreaAccess(detectedArea);
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
    <div className="h-screen w-full flex flex-row room-layout">
      {/* Canvas */}
      <div className="canvas-wrap flex-1 relative bg-surface overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* HUD top */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between pointer-events-none z-10">
          <div className="pointer-events-auto bg-bg/85 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs text-dim flex items-center gap-2">
            🏠 <strong className="text-ngumpul">{roomId}</strong>
            <span id="onlineCount">0 online</span>
            <span className="text-warning font-semibold">{userName}</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${connState === "connected" ? "bg-green" : connState === "connecting" ? "bg-warning animate-pulse" : "bg-danger"}`}
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
            className="bg-bg/85 backdrop-blur-sm px-4 py-1.5 rounded-xl text-sm font-semibold text-ngumpul border border-ngumpul/20"
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
      <div className="side-panel w-[340px] max-w-[90vw] bg-surface border-l border-surface2 flex flex-col shrink-0">
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
          sendChat={chat.sendChat}
          broadcastTyping={typing.broadcastTyping}
          loadHistory={chat.loadHistory}
          syncRoomChat={() => {}}
          syncDmChat={() => {}}
          typingNamesRef={typing.typingNamesRef}
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
