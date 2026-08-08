'use client';

/**
 * The address to show a human for "open this on your other device."
 *
 * Prefers the hub's own Bonjour/mDNS name (`something.local`), which stays
 * correct across a DHCP lease renewal — the plain IP a device loaded the
 * page on does not, and that address changing mid-setup with no warning is
 * exactly what makes "the other device can't find it" so hard to debug.
 *
 * Falls back to `location.origin` (what this page actually loaded from)
 * when there's no hub to ask — including on Vercel, where /api/hub-info
 * doesn't exist at all and the fetch simply 404s.
 */

import { useEffect, useState } from 'react';

export function useHubAddress(): string {
  const [address, setAddress] = useState('');

  useEffect(() => {
    const origin = window.location.origin;
    setAddress(origin);

    fetch('/api/hub-info', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(info => {
        if (info?.hostname) setAddress(`http://${info.hostname}:${info.port}`);
      })
      .catch(() => {}); // No hub reachable — the origin fallback already stands.
  }, []);

  return address;
}
