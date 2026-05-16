'use client';

import { useEffect, useState, useRef } from 'react';
import { useHelpMode } from '@/lib/help-context';

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

export default function HelpOverlay() {
  const { helpMode } = useHelpMode();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpMode) {
      setTooltip(null);
      document.documentElement.classList.remove('help-mode');
      return;
    }

    document.documentElement.classList.add('help-mode');

    function onMove(e: MouseEvent) {
      const el = (e.target as Element).closest('[title]') as HTMLElement | null;
      const text = el?.title?.trim();
      if (text) {
        setTooltip({ text, x: e.clientX, y: e.clientY });
      } else {
        setTooltip(null);
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.classList.remove('help-mode');
    };
  }, [helpMode]);

  if (!helpMode || !tooltip) return null;

  // Smart positioning: keep tooltip inside viewport
  const PAD = 14;
  const TW = 260; // approx tooltip max-width
  const TH = 70;  // approx tooltip max-height
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const left = tooltip.x + PAD + TW > vw ? tooltip.x - PAD - TW : tooltip.x + PAD;
  const top  = tooltip.y + PAD + TH > vh ? tooltip.y - PAD - TH : tooltip.y + PAD;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] pointer-events-none"
      style={{ left, top }}
    >
      <div className="bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs rounded-xl shadow-2xl px-3.5 py-2.5 max-w-[260px] leading-snug">
        <span className="font-semibold text-amber-600 mr-1">?</span>
        {tooltip.text}
      </div>
    </div>
  );
}
