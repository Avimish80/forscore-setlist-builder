'use client';

/**
 * Best-effort screen wake lock for performance views — a chart that goes
 * dark mid-song is worse than a slightly warmer battery. Re-acquires after
 * the tab returns to the foreground (the OS releases locks on background).
 *
 * Silently does nothing where unavailable (older iPads, plain-http origins);
 * players there rely on their device's auto-lock setting as before.
 */

import { useEffect } from 'react';

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: any = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const wakeLock = (navigator as any).wakeLock;
        if (!wakeLock) return;
        const next = await wakeLock.request('screen');
        if (cancelled) { try { next.release(); } catch (_) {} return; }
        lock = next;
      } catch (_) {}
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try { lock?.release(); } catch (_) {}
    };
  }, [active]);
}
