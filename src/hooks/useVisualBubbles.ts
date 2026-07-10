"use client";

import { useCallback } from "react";
import { pruneBubbles as pruneBubblesFn } from "@/components/Canvas";

interface UseVisualBubblesProps {
  visualBubblesRef: { current: Array<{ pid: string; createdAt: number }> };
  clockRef: { current: number };
}

export function useVisualBubbles({ visualBubblesRef, clockRef }: UseVisualBubblesProps) {
  const addVisualBubble = useCallback((pid: string) => {
    visualBubblesRef.current.push({ pid, createdAt: clockRef.current });
  }, [visualBubblesRef, clockRef]);

  const pruneBubbles = useCallback(() => {
    pruneBubblesFn(visualBubblesRef, clockRef);
  }, [visualBubblesRef, clockRef]);

  return { addVisualBubble, pruneBubbles };
}