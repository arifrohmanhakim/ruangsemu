"use client";

import { useEffect } from "react";
import { Paper, Text, Button, Group } from "@mantine/core";
import { getRoomById } from "@/lib/map";

interface ProfileDialogProps {
  target: { pid: string; name: string; area: string | null; isMe: boolean } | null;
  onClose: () => void;
  onStartDm: (pid: string, name: string) => void;
}

export function ProfileDialog({ target, onClose, onStartDm }: ProfileDialogProps) {
  useEffect(() => {
    if (!target) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <Paper
        p="md"
        radius="lg"
        w={260}
        shadow="xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-surface2)", pointerEvents: "auto" }}
      >
        <Group justify="space-between" mb="sm">
          <Text fw={700} size="sm" c="var(--color-text)">👤 Profil</Text>
          <Text
            component="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-dim)", fontSize: "18px", lineHeight: 1 }}
          >
            ✕
          </Text>
        </Group>
        <Group gap="sm" mb="sm" wrap="nowrap">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 700,
              background: target.isMe ? "var(--color-warning)" : "var(--color-accent-blue)",
              color: "#000",
              flexShrink: 0,
            }}
          >
            {target.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <Text size="sm" fw={600} c="var(--color-text)">{target.name}</Text>
            <Text size="xs" c="var(--color-dim)">
              {target.area ? getRoomById(target.area)?.name || target.area : "🚶 Koridor"}
            </Text>
          </div>
        </Group>
        {!target.isMe && (
          <Button
            fullWidth
            style={{
              background: "color-mix(in srgb, var(--color-warning) 20%, transparent)",
              color: "var(--color-warning)",
              fontWeight: 600,
              border: "none",
            }}
            onClick={() => { onStartDm(target.pid, target.name); onClose(); }}
          >
            💬 Kirim DM
          </Button>
        )}
      </Paper>
    </div>
  );
}
