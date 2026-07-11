"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateCode, getPeerId } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

interface MyRoom {
  id: string;
  name: string;
  memberCount: number;
  hostUserId: string;
}

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
  const [hasRejoin, setHasRejoin] = useState(false);
  const [rejoinRoomId, setRejoinRoomId] = useState("");
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MyRoom | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Initialize
  useEffect(() => {
    const pid = getPeerId();
    setPeerId(pid);

    try {
      const stored = localStorage.getItem("ruangsemu_last_room");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.roomId) {
          setHasRejoin(true);
          setRejoinRoomId(data.roomId);
        }
      }
    } catch {}

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

        // Ensure users row exists
        supabase.from("users").upsert(
          { id: data.user.id, peer_id: pid, name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User", avatar_url: data.user.user_metadata?.avatar_url },
          { onConflict: "id" },
        ).then(() => {});
      }
      setLoading(false);
      setStatus("✅ Siap!");
      setStatusType("success");
    });
  }, []);

  // Fetch my rooms when peerId is ready
  useEffect(() => {
    if (!peerId) return;
    fetchMyRooms();
  }, [peerId]);

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
    } catch {
      // silent
    }
    setRoomsLoading(false);
  };

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

  const handleRejoin = useCallback(() => {
    try {
      const stored = localStorage.getItem("ruangsemu_last_room");
      if (stored) {
        const data = JSON.parse(stored);
        const displayName = user?.name || peerId;
        window.location.href = `/room/${data.roomId}?name=${encodeURIComponent(displayName)}`;
      }
    } catch {}
  }, [user?.name, peerId]);

  const clearRejoin = useCallback(() => {
    localStorage.removeItem("ruangsemu_last_room");
    setHasRejoin(false);
    setStatus("✅ Data room dibuang");
    setStatusType("success");
  }, []);

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

  const statusColors = {
    info: "text-dim",
    error: "text-danger",
    success: "text-ruangsemu",
    warn: "text-warning",
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-center text-dim">
          <div className="text-5xl mb-4">🚪</div>
          <div className="text-lg animate-pulse">RuangSemu...</div>
        </div>
      </div>
    );
  }

  // Not logged in — login screen
  if (!user) {
    return (
      <div
        className="h-screen flex items-center justify-center bg-bg"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, #1a1a3e 0%, #0f0f1a 70%)",
        }}
      >
        <div className="bg-surface rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl mx-4">
          <div className="text-5xl mb-2">🚪</div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-ruangsemu to-accent-blue bg-clip-text text-transparent mb-6">
            Ruang Semu
          </h1>
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white text-gray-800 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            Masuk dengan Google
          </button>
        </div>
      </div>
    );
  }

  // Logged in — dashboard
  return (
    <div className="min-h-screen bg-bg p-4 md:p-6 flex justify-center">
      <div className="w-full max-w-2xl">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-6 bg-surface p-3 md:p-4 rounded-2xl border border-surface2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚪</span>
            <h1 className="text-lg font-bold text-white">Ruang semu</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dim hidden md:block">{peerId}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-dim hover:text-danger transition px-2 py-1 rounded-lg hover:bg-surface2"
            >
              Keluar
            </button>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-ruangsemu flex items-center justify-center text-black font-bold text-sm">
                {user.name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* My rooms */}
        <div className="mb-6">
          <h2 className="text-dim mb-3 text-sm font-medium">Grup kamu</h2>
          {roomsLoading ? (
            <div className="text-dim text-sm animate-pulse">Memuat...</div>
          ) : myRooms.length === 0 ? (
            <div className="bg-surface rounded-xl p-6 text-center border border-surface2">
              <p className="text-dim text-sm">Belum ada grup</p>
              <p className="text-dim/50 text-xs mt-1">
                Buat grup baru atau gabung dengan kode undangan
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {myRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-surface p-4 rounded-xl flex justify-between items-center border border-surface2 hover:border-surface3 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white text-sm truncate">
                      {room.name}
                    </div>
                    <div className="text-xs text-dim">
                      {room.id} · {room.memberCount} anggota
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {user.id === room.hostUserId && (
                      <>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-xs text-dim hover:text-danger transition px-2 py-1.5 rounded-lg hover:bg-surface2"
                          title="Hapus grup"
                        >
                          Hapus
                        </button>
                        <button
                          onClick={() => {
                            setRenameTarget(room);
                            setRenameValue(room.name);
                            setShowRenameModal(true);
                          }}
                          className="text-xs text-dim hover:text-text transition px-2 py-1.5 rounded-lg hover:bg-surface2"
                          title="Edit nama"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEnterRoom(room.id)}
                      className="bg-surface2 text-white px-4 py-2 rounded-lg text-sm hover:bg-surface3 transition"
                    >
                      Buka
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rejoin card */}
        {hasRejoin && (
          <div className="mb-6 bg-surface2/30 rounded-xl p-4 border border-warning/30">
            <div className="text-xs text-warning font-semibold mb-1">
              🔄 Kamu punya room sebelumnya!
            </div>
            <div className="text-lg font-bold font-mono text-ruangsemu tracking-wider mb-2">
              {rejoinRoomId}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRejoin}
                className="flex-1 bg-ruangsemu text-black font-bold py-2.5 px-4 rounded-xl hover:bg-ruangsemu-dark transition text-sm"
              >
                🚪 Masuk Lagi
              </button>
              <button
                onClick={clearRejoin}
                className="flex-1 bg-ghost text-dim py-2.5 px-4 rounded-xl text-xs hover:text-text transition"
              >
                Buang
              </button>
            </div>
          </div>
        )}

        {/* Create / Join */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
          <button
            onClick={() => {
              setNewRoomName(user?.name || peerId);
              setShowCreateModal(true);
            }}
            className="md:col-span-2 bg-warning text-black font-bold py-3 px-5 rounded-xl hover:bg-amber-500 transition text-sm"
          >
            ✨ Buat grup
          </button>
          <div className="md:col-span-3 flex gap-2">
            <input
              type="text"
              placeholder="Kode grup (RM-XXXX)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
              className="flex-1 bg-surface2 px-4 rounded-xl w-full text-white text-sm outline-none focus:ring-2 focus:ring-ruangsemu/50 placeholder:text-dim/50 uppercase"
            />
            <button
              onClick={handleJoinRoom}
              className="bg-ruangsemu text-black font-bold px-6 py-2 rounded-xl text-sm whitespace-nowrap"
            >
              Gabung
            </button>
          </div>
        </div>

        {/* Status */}
        <div
          className={`text-xs min-h-5 text-center ${statusColors[statusType]}`}
        >
          {status}
        </div>
      </div>

      {/* Rename Room Modal */}
      {showRenameModal && renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-surface2">
            <h3 className="text-lg font-bold text-white mb-4">
              Edit nama grup
            </h3>
            <div className="text-xs text-dim mb-3 font-mono">
              {renameTarget.id}
            </div>
            <input
              type="text"
              placeholder="Nama grup"
              maxLength={50}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="w-full bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm focus:border-ruangsemu transition outline-none placeholder:text-dim/50 mb-6"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowRenameModal(false);
                  handleRenameRoom(renameTarget.id, renameValue);
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRenameModal(false)}
                className="flex-1 bg-ghost text-dim py-2.5 rounded-xl text-sm hover:text-text transition"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  handleRenameRoom(renameTarget.id, renameValue);
                }}
                className="flex-1 bg-ruangsemu text-black font-bold py-2.5 rounded-xl hover:bg-ruangsemu-dark transition text-sm"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-surface2">
            <h3 className="text-lg font-bold text-white mb-4">
              Buat grup baru
            </h3>
            <input
              type="text"
              placeholder="Nama grup"
              maxLength={50}
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              autoFocus
              className="w-full bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm focus:border-ruangsemu transition outline-none placeholder:text-dim/50 mb-6"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowCreateModal(false);
                  handleCreateRoom(newRoomName);
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-ghost text-dim py-2.5 rounded-xl text-sm hover:text-text transition"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  handleCreateRoom(newRoomName);
                }}
                className="flex-1 bg-warning text-black font-bold py-2.5 rounded-xl hover:bg-amber-500 transition text-sm"
              >
                Buat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
