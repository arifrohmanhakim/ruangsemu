"use client";

import { useEffect, useRef, useCallback } from "react";
import { escHtml } from "@/lib/utils";
import { detectRoom, getRoomById } from "@/lib/map";
import type { PeerState } from "@/lib/types";

interface MemberListProps {
  me: { peerId: string; name: string; currentArea: string | null };
  peerStates: Map<string, PeerState>;
  onMemberClick: (pid: string) => void;
}

export function MemberList({ me, peerStates, onMemberClick }: MemberListProps) {
  const elRef = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    const el = elRef.current; if (!el) return;
    const members: { pid: string; name: string; area: string | null; isMe: boolean }[] = [];
    members.push({ pid: me.peerId, name: me.name || me.peerId, area: me.currentArea, isMe: true });
    for (const [pid, s] of peerStates) {
      members.push({ pid, name: s.name || pid, area: detectRoom(s.x, s.y), isMe: false });
    }
    if (members.length === 0) {
      el.innerHTML = '<div class="text-dim text-xs py-2">Belum ada orang...</div>';
      return;
    }
    el.innerHTML = members.map(m => {
      const roomName = m.area ? getRoomById(m.area)?.name || m.area : "🚶 Koridor";
      const badge = m.isMe ? '<span class="text-[10px] text-ngumpul font-semibold ml-1">(lo)</span>' : "";
      return `<div class="member-item flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-surface2/50 transition text-xs cursor-pointer" data-pid="${escHtml(m.pid)}">
        <span class="w-2 h-2 rounded-full shrink-0 ${m.isMe ? "bg-ngumpul" : "bg-accent-blue"}"></span>
        <span class="text-text truncate">${escHtml(m.name)}${badge}</span>
        <span class="text-dim/60 ml-auto text-[10px] truncate">${roomName}</span>
      </div>`;
    }).join("");
    if (!el.dataset.listenerAttached) {
      el.dataset.listenerAttached = "true";
      el.addEventListener("click", (e) => {
        const item = (e.target as HTMLElement).closest(".member-item");
        if (item) { const pid = item.getAttribute("data-pid"); if (pid) onMemberClick(pid); }
      });
    }
  }, [me, peerStates, onMemberClick]);

  useEffect(() => { render(); }, [render]);

  return <div ref={elRef} id="memberList" style={{ padding: "4px 8px" }} />;
}