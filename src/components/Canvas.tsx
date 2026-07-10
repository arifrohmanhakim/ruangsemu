"use client";

import { useRef, useEffect, useCallback } from "react";
import { MAP_W, MAP_H, getAllRooms, type WallSegment } from "@/lib/map";
import type { PeerState } from "@/lib/types";

interface CanvasProps {
  meRef: { current: { x: number; y: number; peerId: string; name: string } };
  peerStatesRef: { current: Map<string, PeerState> };
  wallsRef: { current: WallSegment[] };
  visualBubblesRef: { current: Array<{ pid: string; createdAt: number }> };
  areaConfigsRef: { current: Map<string, { visibility: string }> };
  clockRef: { current: number };
  drawAvatar: (ctx: CanvasRenderingContext2D, x: number, y: number, name: string, pid: string, self: boolean) => void;
  drawVisualBubble: (ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) => void;
  pruneBubbles: () => void;
}

export function Canvas({
  meRef,
  peerStatesRef,
  wallsRef,
  visualBubblesRef,
  areaConfigsRef,
  clockRef,
  drawAvatar,
  drawVisualBubble,
  pruneBubbles,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px"; canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasSizeRef.current = { w: rect.width, h: rect.height };
    const sx = rect.width / MAP_W, sy = rect.height / MAP_H, sc = Math.min(sx, sy) * 0.92;
    const ox = (rect.width - MAP_W * sc) / 2, oy = (rect.height - MAP_H * sc) / 2;
    transRef.current = { scale: sc, ox, oy };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; const { scale, ox, oy } = transRef.current;
    ctx.clearRect(0, 0, canvasSizeRef.current.w, canvasSizeRef.current.h);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);

    // Floor
    ctx.fillStyle = "#0f0f1a"; ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Grid
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 0.5;
    for (let x = 0; x <= MAP_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke(); }
    for (let y = 0; y <= MAP_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke(); }
    ctx.fillStyle = "#121222"; ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Rooms
    for (const room of getAllRooms()) {
      ctx.fillStyle = room.color; ctx.beginPath(); ctx.roundRect(room.x, room.y, room.w, room.h, 4); ctx.fill();
      ctx.fillStyle = "#8888aa55"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(room.name, room.x + room.w / 2, room.y + 24);
    }

    // Walls
    ctx.strokeStyle = "#48cae4"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.shadowColor = "#48cae455"; ctx.shadowBlur = 6;
    for (const w of wallsRef.current) { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); }
    ctx.shadowBlur = 0;

    // Doors + lock icons
    for (const room of getAllRooms()) {
      const d = room.door;
      ctx.fillStyle = "rgba(72, 202, 228, 0.25)";
      if (d.side === "bottom" || d.side === "top") ctx.fillRect(d.x, d.side === "bottom" ? d.y - 4 : d.y - 2, d.w, 8);
      else ctx.fillRect(d.side === "left" ? d.x - 4 : d.x - 2, d.y, 8, d.w);
      ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (d.side === "bottom") { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.w, d.y); }
      else if (d.side === "top") { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.w, d.y); }
      else if (d.side === "left") { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.w); }
      else { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.w); }
      ctx.stroke(); ctx.setLineDash([]);

      const areaConfig = areaConfigsRef.current.get(room.id);
      if (areaConfig && areaConfig.visibility === "private") {
        const lx = d.side === "left" ? d.x - 4 : d.side === "right" ? d.x + 8 : d.x + d.w / 2 - 6;
        const ly = d.side === "top" ? d.y - 10 : d.side === "bottom" ? d.y + 6 : d.y + d.w / 2 + 8;
        ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffb347"; ctx.fillText("🔒", lx, ly);
      }
    }

    // Other avatars
    for (const [pid, s] of peerStatesRef.current) drawAvatar(ctx, s.x, s.y, s.name || pid, pid, false);
    // Self
    const me = meRef.current; drawAvatar(ctx, me.x, me.y, me.name || me.peerId, me.peerId, true);

    // Visual bubbles
    pruneBubbles();
    for (const bubble of visualBubblesRef.current) {
      const state = bubble.pid === me.peerId ? me : peerStatesRef.current.get(bubble.pid);
      if (!state) continue;
      const age = clockRef.current - bubble.createdAt;
      const alpha = Math.max(0, 1 - age / 2500);
      drawVisualBubble(ctx, state.x, state.y, alpha);
    }

    ctx.restore();
  }, [meRef, peerStatesRef, wallsRef, visualBubblesRef, areaConfigsRef, clockRef, drawAvatar, drawVisualBubble, pruneBubbles]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

// Draw helpers - will be memoized in parent
export function drawAvatarFn(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, name: string, pid: string, self: boolean,
  meRef: { current: { currentArea: string | null } }
) {
  const inMyRoom = !self && meRef.current.currentArea && getAllRooms().find(r => r.id === meRef.current.currentArea)?.id === meRef.current.currentArea && false; // placeholder
  const r = 16; ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2); ctx.fill();
  const grd = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
  if (self) { grd.addColorStop(0, "#ffb347"); grd.addColorStop(1, "#e67e22"); }
  else if (inMyRoom) { grd.addColorStop(0, "#00d4aa"); grd.addColorStop(1, "#00a886"); }
  else { grd.addColorStop(0, "#8888bb"); grd.addColorStop(1, "#555577"); }
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (self) { ctx.save(); ctx.shadowColor = "#ffb34755"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((name || pid).charAt(0).toUpperCase(), x, y + 1);
  ctx.fillStyle = self ? "#ffb347" : "#e8e8f0"; ctx.font = "10px sans-serif"; ctx.textBaseline = "bottom";
  ctx.fillText(name || pid, x, y - r - 6); ctx.restore();
}

export function pruneBubbles(
  visualBubblesRef: { current: Array<{ pid: string; createdAt: number }> },
  clockRef: { current: number }
) {
  const now = clockRef.current;
  visualBubblesRef.current = visualBubblesRef.current.filter(b => now - b.createdAt < 2500);
}

export function drawVisualBubbleFn(
  ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number
) {
  ctx.save(); ctx.globalAlpha = alpha; const r = 6;
  const bx = x - r, by = y - 40 - r * 2, w = 24, h = 16, cr = 6;
  ctx.fillStyle = "rgba(0, 212, 170, 0.7)"; ctx.strokeStyle = "rgba(0, 212, 170, 0.4)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + cr, by); ctx.lineTo(bx + w - cr, by); ctx.quadraticCurveTo(bx + w, by, bx + w, by + cr);
  ctx.lineTo(bx + w, by + h - cr); ctx.quadraticCurveTo(bx + w, by + h, bx + w - cr, by + h);
  ctx.lineTo(bx + cr, by + h); ctx.quadraticCurveTo(bx, by + h, bx, by + h - cr);
  ctx.lineTo(bx, by + cr); ctx.quadraticCurveTo(bx, by, bx + cr, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(0, 212, 170, 0.9)";
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(bx + 6 + i * 7, by + 7, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "rgba(0, 212, 170, 0.7)"; ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x, by + h + 6); ctx.lineTo(x + 4, by + h); ctx.closePath(); ctx.fill(); ctx.restore();
}