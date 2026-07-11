"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const nameFromUrl = searchParams.get("name") || "";
  const defaultName = nameFromUrl || getPeerId();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async (result: any) => {
      const data = result.data;
      if (data?.user) {
        const uid = data.user.id;
        const peerId = getPeerId();
        const name =
          data.user.user_metadata?.full_name ||
          data.user.email?.split("@")[0] ||
          "User";
        const avatarUrl = data.user.user_metadata?.avatar_url;

        // Ensure user row exists in public.users
        await supabase.from("users").upsert(
          { id: uid, peer_id: peerId, name, avatar_url: avatarUrl },
          { onConflict: "id" },
        );
        setUserId(uid);
      }
    });
  }, []);

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
