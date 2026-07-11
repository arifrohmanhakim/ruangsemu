"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
  const defaultName =
    nameFromUrl ||
    (typeof window !== "undefined"
      ? localStorage.getItem("ruangsemu_name")
      : "") ||
    getPeerId();

  return <RoomView roomId={roomId} userName={defaultName} />;
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
