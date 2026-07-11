"use client";

import { useRef, useEffect } from "react";
import { Paper, Text, Button, TextInput, Group, Stack } from "@mantine/core";

interface PinDialogProps {
  isOpen: boolean;
  areaName: string;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

export function PinDialog({ isOpen, areaName, error, onSubmit, onClose }: PinDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        p="lg"
        radius="lg"
        w={300}
        shadow="xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-surface2)", pointerEvents: "auto" }}
      >
        <Text ta="center" fw={700} c="var(--color-warning)" mb="sm">
          🔒 {areaName}
        </Text>
        <Text ta="center" size="xs" c="var(--color-dim)" mb="md">
          Room ini private. Masukin PIN buat masuk.
        </Text>
        <TextInput
          ref={inputRef as any}
          type="password"
          maxLength={6}
          placeholder="******"
          ta="center"
          styles={{
            input: {
              background: "var(--color-bg)",
              borderColor: "var(--color-surface2)",
              color: "var(--color-text)",
              textAlign: "center",
              fontSize: "18px",
              letterSpacing: "0.2em",
            },
          }}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onClose(); }}
        />
        {error && (
          <Text ta="center" size="xs" c="var(--color-danger)" mt="sm">
            {error}
          </Text>
        )}
        <Group gap="sm" mt="md">
          <Button
            variant="subtle"
            color="gray"
            fullWidth
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            fullWidth
            style={{
              background: "var(--color-warning)",
              color: "#000",
              border: "none",
            }}
            onClick={onSubmit}
          >
            Masuk
          </Button>
        </Group>
      </Paper>
    </div>
  );
}
