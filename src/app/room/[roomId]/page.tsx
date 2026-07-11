"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPeerId } from "@/lib/utils";

const RoomView = dynamic(() => import("@/components/RoomView"), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="text-center text-dim">
        <div className="text-5xl mb-4 animate-bounce">🚪</div>
        <div className="text-lg">Masuk room...</div>
      </div>
    </div>
  ),
});

function RoomPageInner({ roomId }: { roomId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nameFromUrl = searchParams.get("name") || "";
  const defaultName = nameFromUrl || getPeerId();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // 1. Room must exist
      const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
      if (cancelled) return;
      if (!room) { router.replace("/"); return; }

      // 2. User must be logged in
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (cancelled) return;
      if (!authUser) { router.replace("/"); return; }

      const uid = authUser.id;
      const peerId = getPeerId();
      const name = authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User";
      const avatarUrl = authUser.user_metadata?.avatar_url;

      // 3. Ensure users row exists
      await supabase.from("users").upsert(
        { id: uid, peer_id: peerId, name, avatar_url: avatarUrl },
        { onConflict: "id" },
      );

      // 4. User must be a room member
      const { data: member } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (!member) { router.replace("/"); return; }

      setUserId(uid);
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [roomId, router]);

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="text-center text-dim">
        <div className="text-5xl mb-4 animate-bounce">🚪</div>
        <div className="text-lg">Masuk room...</div>
      </div>
    </div>
  );

  return <RoomView roomId={roomId} userName={defaultName} userId={userId || ""} />;
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);

  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-bg">
          <div className="text-center text-dim animate-pulse text-lg">
            🚪 Loading...
          </div>
        </div>
      }
    >
      <RoomPageInner roomId={roomId} />
    </Suspense>
  );
}
