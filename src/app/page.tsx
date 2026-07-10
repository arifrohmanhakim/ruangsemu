'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { generateCode, getPeerId } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

export default function LobbyPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('⏳ Nyiapin...');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success' | 'warn'>('info');
  const [peerId, setPeerId] = useState<string>('');
  const [hasRejoin, setHasRejoin] = useState(false);
  const [rejoinRoomId, setRejoinRoomId] = useState('');

  // Init
  useEffect(() => {
    const pid = getPeerId();
    setPeerId(pid);
    const savedName = localStorage.getItem('ruangsemu_name') || '';
    setName(savedName);

    // Check for rejoin
    try {
      const stored = localStorage.getItem('ruangsemu_last_room');
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
          name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email,
          avatarUrl: data.user.user_metadata?.avatar_url,
          peerId: pid,
        });
        if (!savedName) {
          setName(data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '');
        }
      }
      setLoading(false);
      setStatus('✅ Siap!');
      setStatusType('success');
    });
  }, []);

  // Save name
  useEffect(() => {
    if (name) localStorage.setItem('ruangsemu_name', name);
  }, [name]);

  const handleGoogleLogin = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setStatus('❌ Gagal login: ' + error.message);
      setStatusType('error');
    }
  }, [supabase.auth]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus('✅ Logout berhasil');
    setStatusType('success');
  }, [supabase.auth]);

  const handleCreateRoom = useCallback(async () => {
    const displayName = name.trim() || peerId;
    const code = generateCode();
    setStatus('⏳ Bikin room...');
    setStatusType('info');

    try {
      const { error } = await supabase.from('rooms').insert({
        id: code,
        name: `${displayName}'s Room`,
        host_peer_id: peerId,
      });
      if (error) throw error;

      localStorage.setItem('ruangsemu_name', displayName);
      localStorage.setItem(
        'ruangsemu_last_room',
        JSON.stringify({ roomId: code, peerId, name: displayName })
      );

      window.location.href = `/room/${code}?name=${encodeURIComponent(displayName)}`;
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'Gagal bikin room'));
      setStatusType('error');
    }
  }, [name, peerId, supabase]);

  const handleJoinRoom = useCallback(async () => {
    const input = roomCode.trim().toUpperCase();
    if (!input) {
      setStatus('❌ Masukin kode room dulu');
      setStatusType('error');
      return;
    }

    const displayName = name.trim() || peerId;
    setStatus('⏳ Mencari room...');
    setStatusType('info');

    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', input)
        .single();

      if (error || !room) {
        setStatus('❌ Room gak ditemukan. Cek kode lagi.');
        setStatusType('error');
        return;
      }

      localStorage.setItem('ruangsemu_name', displayName);
      localStorage.setItem(
        'ruangsemu_last_room',
        JSON.stringify({ roomId: input, peerId, name: displayName })
      );

      // Gak perlu ?host= — semua equal via Supabase room_members
      window.location.href = `/room/${input}?name=${encodeURIComponent(displayName)}`;
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'Gagal cari room'));
      setStatusType('error');
    }
  }, [roomCode, name, peerId, supabase]);

  const handleRejoin = useCallback(() => {
    try {
      const stored = localStorage.getItem('ruangsemu_last_room');
      if (stored) {
        const data = JSON.parse(stored);
        const displayName = name.trim() || peerId;
        window.location.href = `/room/${data.roomId}?name=${encodeURIComponent(displayName)}`;
      }
    } catch {}
  }, [name, peerId]);

  const clearRejoin = useCallback(() => {
    localStorage.removeItem('ruangsemu_last_room');
    setHasRejoin(false);
    setStatus('✅ Data room dibuang');
    setStatusType('success');
  }, []);

  const statusColors = {
    info: 'text-dim',
    error: 'text-danger',
    success: 'text-ruangsemu',
    warn: 'text-warning',
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-center text-dim">
          <div className="text-5xl mb-4">🐱</div>
          <div className="text-lg animate-pulse">Ngumpul...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-bg"
      style={{
        background: 'radial-gradient(ellipse at 20% 50%, #1a1a3e 0%, #0f0f1a 70%)',
      }}
    >
      <div className="bg-surface rounded-2xl p-8 w-full max-w-md shadow-2xl mx-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-1">🐱</div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-ruangsemu to-accent-blue bg-clip-text text-transparent">
            Ngumpul
          </h1>
          <p className="text-dim text-sm mt-1">Virtual space — jalan, ketemu, ngobrol</p>
        </div>

        {/* Auth section */}
        <div className="mb-5">
          {user ? (
            <div className="flex items-center gap-3 bg-bg rounded-xl p-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-ruangsemu flex items-center justify-center text-black font-bold text-lg">
                  {user.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{user.name}</div>
                <div className="text-dim text-xs truncate">{user.email}</div>
              </div>
              <button onClick={handleLogout} className="text-xs text-dim hover:text-danger transition px-2 py-1 rounded-lg hover:bg-surface2">
                Keluar
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white text-gray-800 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Masuk dengan Google
            </button>
          )}
        </div>

        {/* Name input */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Nama kamu..."
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm focus:border-ruangsemu transition outline-none placeholder:text-dim/50"
          />
        </div>

        {/* Peer ID badge */}
        <div className="bg-bg rounded-lg px-3 py-2 mb-4 text-center text-xs text-dim flex items-center justify-center gap-2">
          🆔 ID: <span className="text-ruangsemu font-semibold tracking-wide text-sm">{peerId}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(peerId);
              setStatus('📋 ID disalin!');
              setStatusType('success');
              setTimeout(() => setStatusType('info'), 2000);
            }}
            className="text-dim hover:text-text transition"
          >
            📋
          </button>
        </div>

        {/* Join room */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Kode Room (RM-XXXX)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            className="flex-1 bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm focus:border-ruangsemu transition outline-none placeholder:text-dim/50 uppercase"
          />
          <button
            onClick={handleJoinRoom}
            className="bg-ruangsemu text-black font-bold px-5 py-3 rounded-xl hover:bg-ruangsemu-dark transition text-sm whitespace-nowrap"
          >
            Gabung
          </button>
        </div>

        {/* Status */}
        <div className={`text-xs min-h-5 mb-3 ${statusColors[statusType]}`}>
          {status}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-surface2" />
          <span className="text-dim text-xs">Atau</span>
          <div className="flex-1 h-px bg-surface2" />
        </div>

        {/* Create room */}
        <button
          onClick={handleCreateRoom}
          className="w-full bg-warning text-black font-bold py-3 px-5 rounded-xl hover:bg-amber-500 transition text-sm"
        >
          ✨ Buat Room Baru
        </button>

        {/* Rejoin card */}
        {hasRejoin && (
          <div className="mt-4 bg-surface2/30 rounded-xl p-4 border border-warning/30">
            <div className="text-xs text-warning font-semibold mb-1">🔄 Kamu punya room sebelumnya!</div>
            <div className="text-xl font-bold font-mono text-ruangsemu tracking-wider mb-1">
              {rejoinRoomId}
            </div>
            <button
              onClick={handleRejoin}
              className="w-full bg-ruangsemu text-black font-bold py-2.5 px-4 rounded-xl hover:bg-ruangsemu-dark transition text-sm mt-2"
            >
              🚪 Masuk Lagi ke Room
            </button>
            <button
              onClick={clearRejoin}
              className="w-full bg-ghost text-dim py-2 px-4 rounded-xl mt-2 text-xs hover:text-text transition"
            >
              Buang & buat baru
            </button>
          </div>
        )}

        {/* Features */}
        <div className="flex justify-center gap-7 mt-6">
          <span className="flex flex-col items-center gap-0.5 text-[11px] text-dim uppercase font-semibold">
            <b className="text-[22px] normal-case">🧑‍🤝‍🧑</b> Multiplayer
          </span>
          <span className="flex flex-col items-center gap-0.5 text-[11px] text-dim uppercase font-semibold">
            <b className="text-[22px] normal-case">🗺️</b> Virtual Space
          </span>
          <span className="flex flex-col items-center gap-0.5 text-[11px] text-dim uppercase font-semibold">
            <b className="text-[22px] normal-case">💬</b> Room Chat
          </span>
        </div>
      </div>
    </div>
  );
}
