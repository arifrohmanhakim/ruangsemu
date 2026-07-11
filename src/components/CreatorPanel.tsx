"use client";

import { useState, useEffect } from "react";
import { Text, Button, TextInput, Group, Stack } from "@mantine/core";
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

const btnStyle = {
  background: "none",
  border: "none",
  cursor: "pointer" as const,
  padding: 0,
  font: "inherit",
  color: "inherit",
};

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
    <div style={{ borderTop: "1px solid var(--color-surface2)", flexShrink: 0 }}>
      <button
        onClick={() => setCreatorPanelOpen(!creatorPanelOpen)}
        style={{
          width: "100%",
          padding: "8px 16px",
          fontSize: "12px",
          color: "var(--color-dim)",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>⚙️ Room Settings</span>
        <span style={{ transform: creatorPanelOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {creatorPanelOpen && (
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {ROOMS.map(r => {
            const cfg = areaConfigs.get(r.id);
            const isPrivate = cfg?.visibility === "private";
            const isEditing = editPinFor === r.id;
            return (
              <div key={r.id} style={{ background: "var(--color-bg)", borderRadius: "12px", padding: "12px" }}>
                <Group justify="space-between" mb={6}>
                  <Text size="xs" fw={600} c="var(--color-text)">{r.name}</Text>
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
                    style={{
                      ...btnStyle,
                      fontSize: "11px",
                      padding: "2px 10px",
                      borderRadius: "999px",
                      fontWeight: 600,
                      background: isPrivate ? "color-mix(in srgb, var(--color-warning) 20%, transparent)" : "color-mix(in srgb, var(--color-warning) 20%, transparent)",
                      color: isPrivate ? "var(--color-warning)" : "var(--color-warning)",
                    }}
                  >
                    {isPrivate ? "🔒 Private" : "🌍 Public"}
                  </button>
                </Group>
                {isPrivate && !isEditing && (
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" c="var(--color-dim)">
                      PIN: {cfg?.pin ? "•".repeat(cfg.pin.length) : "—"}
                    </Text>
                    <button
                      onClick={() => { setEditPinFor(r.id); setEditPinVal(cfg?.pin || ""); }}
                      style={{ ...btnStyle, fontSize: "11px", color: "var(--color-warning)" }}
                    >
                      Ganti
                    </button>
                  </Group>
                )}
                {isPrivate && isEditing && (
                  <Group gap={6} mt={4} wrap="nowrap">
                    <TextInput
                      type="text"
                      maxLength={6}
                      value={editPinVal}
                      onChange={e => setEditPinVal(e.currentTarget.value)}
                      placeholder="PIN baru..."
                      size="xs"
                      styles={{
                        input: {
                          background: "var(--color-surface2)",
                          color: "var(--color-text)",
                          border: "1px solid transparent",
                          fontSize: "12px",
                          padding: "4px 10px",
                        },
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={() => { if (editPinVal.trim()) onUpdateConfig(r.id, "private", editPinVal.trim()); setEditPinFor(null); }}
                      style={{ ...btnStyle, fontSize: "11px", background: "var(--color-warning)", color: "#000", fontWeight: 600, padding: "4px 10px", borderRadius: "8px" }}
                    >
                      Simpan
                    </button>
                    <button
                      onClick={() => setEditPinFor(null)}
                      style={{ ...btnStyle, fontSize: "11px", color: "var(--color-dim)" }}
                    >
                      ✕
                    </button>
                  </Group>
                )}
              </div>
            );
          })}
          <div style={{ background: "var(--color-bg)", borderRadius: "12px", padding: "12px" }}>
            {showCreateRoom ? (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="xs" fw={600} c="var(--color-text)">🏗️ Room Baru</Text>
                  <button
                    onClick={() => { setShowCreateRoom(false); setNewRoomName(""); }}
                    style={{ ...btnStyle, color: "var(--color-dim)", fontSize: "14px" }}
                  >
                    ✕
                  </button>
                </Group>
                <TextInput
                  type="text"
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.currentTarget.value)}
                  onKeyDown={e => { if (e.key === "Enter") onCreateRoom(); }}
                  placeholder="Nama room..."
                  styles={{
                    input: {
                      background: "var(--color-surface2)",
                      color: "var(--color-text)",
                      border: "1px solid transparent",
                      fontSize: "12px",
                    },
                  }}
                />
                <Button
                  fullWidth
                  size="xs"
                  style={{ background: "var(--color-warning)", color: "#000" }}
                  onClick={onCreateRoom}
                >
                  ➕ Buat
                </Button>
              </Stack>
            ) : (
              <button
                onClick={() => setShowCreateRoom(true)}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  color: "var(--color-warning)",
                  fontWeight: 600,
                  padding: "6px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
              >
                ➕ Buat Room Baru
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
