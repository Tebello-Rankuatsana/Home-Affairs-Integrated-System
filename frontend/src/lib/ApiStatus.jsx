// GovServe Lesotho — backend connection badge + health hook (new file, no backend change).
import { useEffect, useState } from 'react';
import { apiBase, ping, getToken } from './api.js';

export function useBackendStatus() {
  const [state, setState] = useState({ checking: true, up: false, authed: false });
  useEffect(() => {
    let alive = true;
    ping()
      .then(() => alive && setState({ checking: false, up: true, authed: Boolean(getToken()) }))
      .catch(() => alive && setState({ checking: false, up: false, authed: Boolean(getToken()) }));
    return () => { alive = false; };
  }, []);
  return state;
}

export function ApiBadge() {
  const { checking, up, authed } = useBackendStatus();
  const label = checking
    ? 'Checking backend…'
    : up && authed
      ? `Live API · ${apiBase()} · authenticated`
      : up
        ? `Live API · ${apiBase()} · sign in to sync`
        : `Offline · prototype data · backend at ${apiBase()} unreachable`;
  const bg = checking ? '#fffbeb' : up ? '#f0fdf4' : '#fef2f2';
  const fg = checking ? '#92400e' : up ? '#166534' : '#991b1b';
  return (
    <p className="muted" role="status" style={{ background: bg, color: fg, border: '1px solid', borderRadius: 8, padding: '8px 12px' }}>
      {label}
    </p>
  );
}
