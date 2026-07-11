"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AreaConfig } from "@/lib/types";
import { getRoomById, getAllRooms, setCustomRooms, addCustomRoom, getWallSegments, findNextRoomPos, type WallSegment } from "@/lib/map";

interface UseRoomConfigProps {
  roomId: string;
  meRef: { current: { peerId: string; userId: string; x: number; y: number; currentArea: string | null; name: string } };
  areaConfigsRef: { current: Map<string, AreaConfig> };
  wallsRef: { current: WallSegment[] };
  unlockedRoomsRef: { current: Set<string> };
  upsertMember: () => Promise<void>;
  onConfigChange: () => void;
}

export function useRoomConfig({
  roomId,
  meRef,
  areaConfigsRef,
  wallsRef,
  unlockedRoomsRef,
  upsertMember,
}: UseRoomConfigProps) {
  const [isCreator, setIsCreator] = useState(false);
  const [creatorPanelOpen, setCreatorPanelOpen] = useState(false);
  const [editPinFor, setEditPinFor] = useState<string | null>(null);
  const [editPinVal, setEditPinVal] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [configDirty, setConfigDirty] = useState(0);
  const hostUserIdRef = useRef<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const pinDialogRef = useRef<{ areaId: string; areaName: string } | null>(null);
  const [pinDialog, setPinDialog] = useState<{ areaId: string; areaName: string } | null>(null);
  const [pinError, setPinError] = useState("");
  const supabaseRef = useRef(createClient());

  const syncConfigs = useCallback(() => {
    setConfigDirty((n) => n + 1);
  }, []);

  const fetchRoomConfig = useCallback(async () => {
    try {
      const { data: room } = await supabaseRef.current.from("rooms").select("host_user_id").eq("id", roomId).single();
      if (room) { hostUserIdRef.current = room.host_user_id; setIsCreator(room.host_user_id === meRef.current.userId); }
      const { data: configs } = await supabaseRef.current.from("room_area_config").select("*").eq("room_id", roomId);
      if (configs) {
        areaConfigsRef.current.clear();
        for (const c of configs as AreaConfig[]) areaConfigsRef.current.set(c.area_id, c);
      }
      syncConfigs();
    } catch {}
  }, []);

  async function updateAreaConfig(areaId: string, visibility: string, pin: string | null) {
    try {
      await supabaseRef.current.from("room_area_config").upsert(
        { room_id: roomId, area_id: areaId, visibility, pin: pin || null },
        { onConflict: "room_id,area_id" },
      );
      areaConfigsRef.current.set(areaId, { room_id: roomId, area_id: areaId, visibility: visibility as "public" | "private", pin: pin || null });
      syncConfigs();
    } catch {}
  }

  const fetchCustomRooms = useCallback(async () => {
    try {
      const { data } = await supabaseRef.current.from("room_defs").select("*").eq("room_id", roomId);
      if (data && data.length > 0) {
        const rooms = data.map((r: Record<string, unknown>) => ({
          id: String(r.id), name: r.name as string, x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number,
          color: r.color as string,
          door: {
            x: (r.door_side as string) === "right" || (r.door_side as string) === "left" ? (r.x as number) : (r.x as number) + (r.w as number) / 2 - ((r.door_w as number) || 70) / 2,
            y: (r.door_side as string) === "top" || (r.door_side as string) === "bottom" ? (r.y as number) + (r.h as number) : (r.y as number) + (r.h as number) / 2 - ((r.door_w as number) || 70) / 2,
            w: (r.door_w as number) || 70,
            side: r.door_side as "top" | "bottom" | "left" | "right",
          },
        }));
        setCustomRooms(rooms);
        wallsRef.current = getWallSegments();
      }
    } catch {}
  }, [roomId]);

  async function handleCreateRoom() {
    const name = newRoomName.trim(); if (!name) return;
    const w = 360, h = 280;
    const pos = findNextRoomPos(w, h);
    const side = "bottom" as const; const doorW = 70;
    try {
      const { data, error } = await supabaseRef.current.from("room_defs").insert({ room_id: roomId, name, x: pos.x, y: pos.y, w, h, color: "rgba(100, 200, 150, 0.07)", door_side: side, door_w: doorW }).select().single();
      if (error) { console.error("create room error:", error); return; }
      const newRoom = { id: data.id.toString(), name, x: pos.x, y: pos.y, w, h, color: "rgba(100, 200, 150, 0.07)", door: { x: pos.x + w / 2 - doorW / 2, y: pos.y + h, w: doorW, side } };
      addCustomRoom(newRoom); wallsRef.current = getWallSegments(); setShowCreateRoom(false); setNewRoomName(""); syncConfigs();
    } catch (e) { console.error("create room error:", e); }
  }

  function handlePinSubmit() {
    const inp = pinInputRef.current; if (!inp || !pinDialog) return;
    const config = areaConfigsRef.current.get(pinDialog.areaId);
    if (!config || !config.pin) { setPinError("Room ini gak punya PIN"); return; }
    if (inp.value === config.pin) {
      unlockedRoomsRef.current.add(pinDialog.areaId);
      const roomDef = getRoomById(pinDialog.areaId);
      if (roomDef) {
        const d = roomDef.door; const margin = 20;
        switch (d.side) {
          case "bottom": meRef.current.x = d.x + d.w / 2; meRef.current.y = roomDef.y + roomDef.h - margin; break;
          case "top": meRef.current.x = d.x + d.w / 2; meRef.current.y = roomDef.y + margin; break;
          case "left": meRef.current.x = roomDef.x + margin; meRef.current.y = d.y + d.w / 2; break;
          case "right": meRef.current.x = roomDef.x + roomDef.w - margin; meRef.current.y = d.y + d.w / 2; break;
        }
      }
      setPinDialog(null); setPinError(""); inp.value = "";
    } else { setPinError("❌ PIN salah, coba lagi"); inp.value = ""; inp.focus(); }
  }

  function dismissPinDialog() { setPinDialog(null); setPinError(""); if (pinInputRef.current) pinInputRef.current.value = ""; }

  function checkAreaAccess(detectedArea: string | null) {
    if (pinDialogRef.current && detectedArea && detectedArea !== pinDialogRef.current.areaId) { setPinDialog(null); setPinError(""); }
    if (detectedArea !== meRef.current.currentArea) {
      if (detectedArea) {
        const config = areaConfigsRef.current.get(detectedArea);
        if (config && config.visibility === "private" && !unlockedRoomsRef.current.has(detectedArea)) {
          const roomDef = getRoomById(detectedArea);
          const outside = getDoorOutsidePos(detectedArea);
          if (outside) { meRef.current.x = outside.x; meRef.current.y = outside.y; }
          setPinDialog({ areaId: detectedArea, areaName: roomDef?.name || detectedArea }); setPinError(""); return;
        }
      }
      // Normal area change (including initial entry null -> area, or area -> corridor)
      meRef.current.currentArea = detectedArea;
      upsertMember();
    }
  }

  const getDoorOutsidePos = (roomId: string) => {
    const room = getAllRooms().find(r => r.id === roomId); if (!room) return null;
    const d = room.door; const margin = 24;
    switch (d.side) {
      case "bottom": return { x: d.x + d.w / 2, y: room.y + room.h + margin };
      case "top": return { x: d.x + d.w / 2, y: room.y - margin };
      case "left": return { x: room.x - margin, y: d.y + d.w / 2 };
      case "right": return { x: room.x + room.w + margin, y: d.y + d.w / 2 };
    }
  };

  return {
    isCreator, creatorPanelOpen, setCreatorPanelOpen,
    editPinFor, setEditPinFor, editPinVal, setEditPinVal,
    showCreateRoom, setShowCreateRoom, newRoomName, setNewRoomName, handleCreateRoom,
    configDirty, syncConfigs,
    pinDialog, setPinDialog, pinError, setPinError, pinInputRef, handlePinSubmit, dismissPinDialog,
    fetchRoomConfig, fetchCustomRooms, updateAreaConfig,
    checkAreaAccess,
  };
}