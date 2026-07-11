"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Container, Stack, Text, Loader } from "@mantine/core";
import { createClient } from "@/lib/supabase/client";
import { getPeerId } from "@/lib/utils";

const RoomView = dynamic(() => import("@/components/RoomView"), {
  ssr: false,
  loading: () => (
    <Container size="xs" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <Stack align="center" gap="md">
        <Text fz={48}>🚪</Text>
        <Text size="lg" c="var(--color-dim)">Masuk room...</Text>
      </Stack>
    </Container>
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
      const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
      if (cancelled) return;
      if (!room) { router.replace("/"); return; }

      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (cancelled) return;
      if (!authUser) { router.replace("/"); return; }

      const uid = authUser.id;
      const peerId = getPeerId();
      const name = authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User";
      const avatarUrl = authUser.user_metadata?.avatar_url;

      await supabase.from("users").upsert(
        { id: uid, peer_id: peerId, name, avatar_url: avatarUrl },
        { onConflict: "id" },
      );

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
    <Container size="xs" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <Stack align="center" gap="md">
        <Text fz={48}>🚪</Text>
        <Text size="lg" c="var(--color-dim)">Masuk room...</Text>
      </Stack>
    </Container>
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
        <Container size="xs" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
          <Text ta="center" c="var(--color-dim)" size="lg">🚪 Loading...</Text>
        </Container>
      }
    >
      <RoomPageInner roomId={roomId} />
    </Suspense>
  );
}
