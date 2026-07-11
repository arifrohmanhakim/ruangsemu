"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  TextInput,
  Modal,
  Group,
  Stack,
  Avatar,
  Loader,
  Box,
} from "@mantine/core";
import { createClient } from "@/lib/supabase/client";
import { generateCode, getPeerId } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

interface MyRoom {
  id: string;
  name: string;
  memberCount: number;
  hostUserId: string;
}

const statusStyles: Record<string, React.CSSProperties> = {
  info: { color: "var(--color-dim)" },
  error: { color: "var(--color-danger)" },
  success: { color: "var(--color-ruangsemu)" },
  warn: { color: "var(--color-warning)" },
};

export default function LobbyPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState("");
  const [status, setStatus] = useState("⏳ Nyiapin...");
  const [statusType, setStatusType] = useState<
    "info" | "error" | "success" | "warn"
  >("info");
  const [peerId, setPeerId] = useState<string>("");
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MyRoom | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    const pid = getPeerId();
    setPeerId(pid);

    supabase.auth.getUser().then((result: any) => {
      const data = result.data;
      if (data?.user) {
        setUser({
          id: data.user.id,
          name:
            data.user.user_metadata?.full_name ||
            data.user.email?.split("@")[0] ||
            "User",
          email: data.user.email,
          avatarUrl: data.user.user_metadata?.avatar_url,
          peerId: pid,
        });

        supabase
          .from("users")
          .upsert(
            {
              id: data.user.id,
              peer_id: pid,
              name:
                data.user.user_metadata?.full_name ||
                data.user.email?.split("@")[0] ||
                "User",
              avatar_url: data.user.user_metadata?.avatar_url,
            },
            { onConflict: "id" },
          )
          .then(() => {});
      }
      setLoading(false);
      setStatus("✅ Siap!");
      setStatusType("success");
    });
  }, []);

  const fetchMyRooms = async () => {
    setRoomsLoading(true);
    try {
      const { data: memberships } = await supabase
        .from("room_members")
        .select("room_id")
        .eq("peer_id", peerId);

      if (!memberships || memberships.length === 0) {
        setMyRooms([]);
        setRoomsLoading(false);
        return;
      }

      const roomIds = memberships.map((m: any) => m.room_id);

      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, name, host_user_id")
        .in("id", roomIds)
        .order("created_at", { ascending: false });

      if (!rooms) {
        setMyRooms([]);
        setRoomsLoading(false);
        return;
      }

      const roomsWithCount = await Promise.all(
        (rooms as { id: string; name: string; host_user_id: string }[]).map(
          async (room) => {
            const { count } = await supabase
              .from("room_members")
              .select("*", { count: "exact", head: true })
              .eq("room_id", room.id);
            return {
              id: room.id,
              name: room.name,
              memberCount: count ?? 0,
              hostUserId: room.host_user_id,
            };
          },
        ),
      );

      setMyRooms(roomsWithCount);
    } catch {}
    setRoomsLoading(false);
  };

  useEffect(() => {
    if (!peerId) return;
    fetchMyRooms();
  }, [peerId]);

  const handleGoogleLogin = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("❌ Gagal login: " + error.message);
      setStatusType("error");
    }
  }, [supabase.auth]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus("✅ Logout berhasil");
    setStatusType("success");
  }, [supabase.auth]);

  const handleCreateRoom = useCallback(
    async (customName?: string) => {
      const displayName = user?.name || peerId;
      const roomName = customName?.trim() || `${displayName}'s Room`;
      const code = generateCode();
      setStatus("⏳ Bikin room...");
      setStatusType("info");

      try {
        const { error } = await supabase.from("rooms").insert({
          id: code,
          name: roomName,
          host_user_id: user?.id,
        });
        if (error) throw error;

        localStorage.setItem(
          "ruangsemu_last_room",
          JSON.stringify({ roomId: code, peerId, name: displayName }),
        );

        window.location.href = `/room/${code}?name=${encodeURIComponent(displayName)}`;
      } catch (err: any) {
        setStatus("❌ " + (err.message || "Gagal bikin room"));
        setStatusType("error");
      }
    },
    [user?.name, peerId, supabase],
  );

  const handleJoinRoom = useCallback(async () => {
    const input = roomCode.trim().toUpperCase();
    if (!input) {
      setStatus("❌ Masukin kode room dulu");
      setStatusType("error");
      return;
    }

    const displayName = user?.name || peerId;
    setStatus("⏳ Mencari room...");
    setStatusType("info");

    try {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", input)
        .single();

      if (error || !room) {
        setStatus("❌ Room gak ditemukan. Cek kode lagi.");
        setStatusType("error");
        return;
      }

      localStorage.setItem(
        "ruangsemu_last_room",
        JSON.stringify({ roomId: input, peerId, name: displayName }),
      );

      window.location.href = `/room/${input}?name=${encodeURIComponent(displayName)}`;
    } catch (err: any) {
      setStatus("❌ " + (err.message || "Gagal cari room"));
      setStatusType("error");
    }
  }, [roomCode, user?.name, peerId, supabase]);

  const handleEnterRoom = useCallback(
    (roomId: string) => {
      const displayName = user?.name || peerId;
      window.location.href = `/room/${roomId}?name=${encodeURIComponent(displayName)}`;
    },
    [user?.name, peerId],
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      if (!confirm("Hapus grup ini?")) return;
      setStatus("⏳ Menghapus grup...");
      setStatusType("info");
      try {
        const { error } = await supabase
          .from("rooms")
          .delete()
          .eq("id", roomId);
        if (error) throw error;
        setMyRooms((prev) => prev.filter((r) => r.id !== roomId));
        setStatus("✅ Grup dihapus");
        setStatusType("success");
      } catch (err: any) {
        setStatus("❌ " + (err.message || "Gagal menghapus grup"));
        setStatusType("error");
      }
    },
    [supabase],
  );

  const handleRenameRoom = useCallback(
    async (roomId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      setStatus("⏳ Mengubah nama...");
      setStatusType("info");
      try {
        const { error } = await supabase
          .from("rooms")
          .update({ name: trimmed })
          .eq("id", roomId);
        if (error) throw error;
        setMyRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, name: trimmed } : r)),
        );
        setStatus("✅ Nama grup diubah");
        setStatusType("success");
      } catch (err: any) {
        setStatus("❌ " + (err.message || "Gagal mengubah nama"));
        setStatusType("error");
      }
    },
    [supabase],
  );

  const BASE_STYLE: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (loading) {
    return (
      <Container size="xs" style={{ ...BASE_STYLE, background: "var(--color-bg)" }}>
        <Stack align="center" gap="md">
          <Text fz={48}>🚪</Text>
          <Loader color="gray" />
          <Text size="lg" c="var(--color-dim)">
            RuangSemu...
          </Text>
        </Stack>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container
        size="xs"
        style={{
          ...BASE_STYLE,
          background:
            "radial-gradient(ellipse at 20% 50%, #1a1a3e 0%, #0f0f1a 70%)",
        }}
      >
        <Paper
          p="xl"
          radius="lg"
          bg="var(--color-surface)"
          w="100%"
          maw={380}
          ta="center"
          shadow="xl"
        >
          <Text fz={48} mb="xs">
            🚪
          </Text>
          <Title
            order={1}
            fz={30}
            fw={800}
            mb="lg"
            style={{
              background: "linear-gradient(to right, var(--color-ruangsemu), var(--color-accent-blue))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Ruang Semu
          </Title>
          <Button
            fullWidth
            size="md"
            variant="default"
            leftSection={
              <svg style={{ width: 20, height: 20 }} viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            }
            onClick={handleGoogleLogin}
          >
            Masuk dengan Google
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box style={{ minHeight: "100vh", background: "var(--color-bg)", padding: "16px" }}>
      <Container size={672} w="100%">
        {/* Top bar */}
        <Paper
          p="md"
          radius="lg"
          bg="var(--color-surface)"
          withBorder
          mb="lg"
          style={{ borderColor: "var(--color-surface2)" }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Text fz={24}>🚪</Text>
              <Title order={4} c="white">
                Ruang semu
              </Title>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Text size="xs" c="var(--color-dim)" visibleFrom="md">
                {peerId}
              </Text>
              <Button
                variant="subtle"
                size="compact-sm"
                color="gray"
                onClick={handleLogout}
              >
                Keluar
              </Button>
              <Avatar
                src={user.avatarUrl}
                alt={user.name}
                color="var(--color-ruangsemu)"
                size="sm"
              >
                {user.name.charAt(0)}
              </Avatar>
            </Group>
          </Group>
        </Paper>

        {/* My rooms */}
        <Box mb="md">
          <Text c="var(--color-dim)" mb="xs" size="sm" fw={500}>
            Grup kamu
          </Text>

          {roomsLoading ? (
            <Group gap="xs" c="var(--color-dim)">
              <Loader size="xs" color="gray" />
              <Text size="sm">Memuat...</Text>
            </Group>
          ) : myRooms.length === 0 ? (
            <Paper
              p="xl"
              bg="var(--color-surface)"
              radius="lg"
              withBorder
              ta="center"
              style={{ borderColor: "var(--color-surface2)" }}
            >
              <Text size="sm" c="var(--color-dim)">
                Belum ada grup
              </Text>
              <Text size="xs" c="var(--color-dim)" style={{ opacity: 0.5, marginTop: 4, fontFamily: "inherit" }}>
                Buat grup baru atau gabung dengan kode undangan
              </Text>
            </Paper>
          ) : (
            <Stack gap="xs">
              {myRooms.map((room) => (
                <Paper
                  key={room.id}
                  p="sm"
                  bg="var(--color-surface)"
                  withBorder
                  style={{ borderColor: "var(--color-surface2)" }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} c="white" size="sm" truncate style={{ maxWidth: "100%" }}>                        {room.name}
                      </Text>
                      <Text size="xs" c="var(--color-dim)">
                        {room.id} · {room.memberCount} anggota
                      </Text>
                    </Box>
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      {user.id === room.hostUserId && (
                        <>
                          <Button
                            variant="subtle"
                            color="red"
                            size="compact-sm"
                            onClick={() => handleDeleteRoom(room.id)}
                          >
                            Hapus
                          </Button>
                          <Button
                            variant="subtle"
                            color="gray"
                            size="compact-sm"
                            onClick={() => {
                              setRenameTarget(room);
                              setRenameValue(room.name);
                              setShowRenameModal(true);
                            }}
                          >
                            Edit
                          </Button>
                        </>
                      )}
                      <Button
                        variant="filled"
                        size="compact-sm"
                        style={{
                          background: "var(--color-surface2)",
                          color: "white",
                          border: "none",
                        }}
                        onClick={() => handleEnterRoom(room.id)}
                      >
                        Buka
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        {/* Create / Join */}
        <Group gap="sm" mb="md" align="end">
          <Button
            fullWidth
            size="md"
            style={{
              background: "var(--color-warning)",
              color: "#000",
              border: "none",
              flex: 2,
            }}
            onClick={() => {
              setNewRoomName(user?.name || peerId);
              setShowCreateModal(true);
            }}
          >
            ✨ Buat grup
          </Button>
          <TextInput
            placeholder="Kode grup (RM-XXXX)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
            style={{ flex: 1 }}
            styles={{
              input: {
                background: "var(--color-surface2)",
                color: "white",
                border: "1px solid var(--color-surface2)",
              },
            }}
          />
          <Button
            size="md"
            style={{
              background: "var(--color-ruangsemu)",
              color: "#000",
              border: "none",
            }}
            onClick={handleJoinRoom}
          >
            Gabung
          </Button>
        </Group>

        {/* Status */}
        <Text ta="center" size="xs" style={statusStyles[statusType]}>
          {status}
        </Text>
      </Container>

      {/* Rename Room Modal */}
      <Modal
        opened={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        title="Edit nama grup"
        styles={{
          content: { background: "var(--color-surface)" },
          header: { background: "var(--color-surface)" },
          title: { color: "white", fontWeight: 700 },
        }}
      >
        {renameTarget && (
          <>
            <Text size="xs" c="var(--color-dim)" mb="sm" style={{ fontFamily: "monospace" }}>
              {renameTarget.id}
            </Text>
            <TextInput
              placeholder="Nama grup"
              maxLength={50}
              value={renameValue}
              onChange={(e) => setRenameValue(e.currentTarget.value)}
              styles={{
                input: {
                  background: "var(--color-bg)",
                  borderColor: "var(--color-surface2)",
                  color: "var(--color-text)",
                },
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowRenameModal(false);
                  handleRenameRoom(renameTarget.id, renameValue);
                }
              }}
              mb="md"
            />
            <Group gap="sm">
              <Button
                variant="subtle"
                color="gray"
                fullWidth
                onClick={() => setShowRenameModal(false)}
              >
                Batal
              </Button>
              <Button
                fullWidth
                style={{
                  background: "var(--color-ruangsemu)",
                  color: "#000",
                  border: "none",
                }}
                onClick={() => {
                  setShowRenameModal(false);
                  handleRenameRoom(renameTarget.id, renameValue);
                }}
              >
                Simpan
              </Button>
            </Group>
          </>
        )}
      </Modal>

      {/* Create Room Modal */}
      <Modal
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Buat grup baru"
        styles={{
          content: { background: "var(--color-surface)" },
          header: { background: "var(--color-surface)" },
          title: { color: "white", fontWeight: 700 },
        }}
      >
        <TextInput
          placeholder="Nama grup"
          maxLength={50}
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.currentTarget.value)}
          styles={{
            input: {
              background: "var(--color-bg)",
              borderColor: "var(--color-surface2)",
              color: "var(--color-text)",
            },
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setShowCreateModal(false);
              handleCreateRoom(newRoomName);
            }
          }}
          mb="md"
        />
        <Group gap="sm">
          <Button
            variant="subtle"
            color="gray"
            fullWidth
            onClick={() => setShowCreateModal(false)}
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
            onClick={() => {
              setShowCreateModal(false);
              handleCreateRoom(newRoomName);
            }}
          >
            Buat
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
