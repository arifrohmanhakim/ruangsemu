"use client";

import { useRef, useEffect } from "react";

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
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
      <div className="bg-surface rounded-2xl p-6 w-[300px] shadow-2xl border border-surface2 pointer-events-auto">
        <h3 className="text-lg font-bold text-ngumpul text-center mb-2">🔒 {areaName}</h3>
        <p className="text-dim text-xs text-center mb-4">Room ini private. Masukin PIN buat masuk.</p>
        <input
          ref={inputRef}
          type="password"
          maxLength={6}
          placeholder="******"
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onClose(); }}
          className="w-full bg-bg border border-surface2 rounded-xl px-4 py-3 text-text text-sm text-center tracking-widest text-lg outline-none focus:border-ngumpul transition placeholder:text-dim/30"
        />
        {error && <p className="text-danger text-xs text-center mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-ghost text-dim py-2.5 rounded-xl text-sm hover:text-text transition">Batal</button>
          <button onClick={onSubmit} className="flex-1 bg-ngumpul text-black font-bold py-2.5 rounded-xl text-sm hover:bg-ngumpul-dark transition">Masuk</button>
        </div>
      </div>
    </div>
  );
}