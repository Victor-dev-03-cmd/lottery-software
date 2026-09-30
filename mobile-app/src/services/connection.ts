import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from 'react';
import { checkHealth, getDesktopIP, setDesktopIP } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectionContextValue {
  ip:           string;
  connected:    boolean;
  connecting:   boolean;
  lastChecked:  Date | null;
  scanning:     boolean;       // subnet scan in progress
  setIP:        (ip: string) => Promise<void>;
  refresh:      () => Promise<void>;
  autoDiscover: () => Promise<string | null>;  // returns found IP or null
}

// ── Context default ────────────────────────────────────────────────────────────

export const ConnectionContext = createContext<ConnectionContextValue>({
  ip: '', connected: false, connecting: false, lastChecked: null, scanning: false,
  setIP:        async () => {},
  refresh:      async () => {},
  autoDiscover: async () => null,
});

// ── Heartbeat intervals ───────────────────────────────────────────────────────
const POLL_CONNECTED_MS    = 30_000;  // 30 s when connected
const POLL_DISCONNECTED_MS = 12_000;  // 12 s when not connected

// ── Subnet scanner ────────────────────────────────────────────────────────────
// Sends HTTP requests in parallel batches to find the lottery server on LAN.
// Works in Expo Go (no native UDP needed).
async function scanSubnet(prefix: string): Promise<string | null> {
  // Try the most common server positions first, then full sweep
  const priority = [1, 100, 101, 102, 103, 2, 3, 4, 5, 200, 254];
  const rest = Array.from({ length: 254 }, (_, i) => i + 1)
    .filter(n => !priority.includes(n));
  const candidates = [...priority, ...rest];

  const BATCH = 15;
  const TIMEOUT = 700; // ms per request

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (n) => {
        const ip = `${prefix}${n}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        try {
          const resp = await fetch(`http://${ip}:7423/api/v1/health`, {
            signal: controller.signal,
            headers: { 'x-api-key': 'mobile' },
          });
          clearTimeout(timer);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.status === 'ok') return ip;
          }
          throw new Error('not lottery server');
        } finally {
          clearTimeout(timer);
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && typeof r.value === 'string') {
        return r.value; // Found!
      }
    }
  }
  return null;
}

// Derive subnet prefix from a device IP (e.g. "192.168.1.45" → "192.168.1.")
function subnetPrefix(deviceIp: string): string {
  const parts = deviceIp.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.`;
  return '192.168.1.';
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [ip,          setIpState]   = useState<string>('');
  const [connected,   setConnected] = useState<boolean>(false);
  const [connecting,  setConnecting]= useState<boolean>(false);
  const [lastChecked, setLastCheck] = useState<Date | null>(null);
  const [scanning,    setScanning]  = useState<boolean>(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Ping helper ─────────────────────────────────────────────────────────────
  const ping = useCallback(async (targetIp?: string): Promise<boolean> => {
    const resolvedIp = (targetIp ?? ip).trim();
    if (!resolvedIp) return false;
    setConnecting(true);
    try {
      await checkHealth(resolvedIp);
      setConnected(true);
      setLastCheck(new Date());
      return true;
    } catch {
      setConnected(false);
      setLastCheck(new Date());
      return false;
    } finally {
      setConnecting(false);
    }
  }, [ip]);

  // ── Heartbeat ────────────────────────────────────────────────────────────────
  const startHeartbeat = useCallback((currentIp: string, isConnected: boolean) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (!currentIp) return;
    const interval = isConnected ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS;
    heartbeatRef.current = setInterval(() => {
      ping(currentIp).then(ok => {
        // Re-schedule with correct interval when state changes
        if (ok !== isConnected) startHeartbeat(currentIp, ok);
      });
    }, interval);
  }, [ping]);

  // ── Auto-discover subnet scan ────────────────────────────────────────────────
  const autoDiscover = useCallback(async (): Promise<string | null> => {
    setScanning(true);
    try {
      // Try to get device IP from a dummy fetch (React Native doesn't expose NetInfo in Expo Go)
      // Fall back to scanning common home/office subnets
      const subnets = ['192.168.1.', '192.168.0.', '10.0.0.', '10.89.185.', '172.16.0.'];

      // If we already have a saved IP, try its subnet first
      const savedIp = await getDesktopIP();
      if (savedIp) {
        const prefix = subnetPrefix(savedIp);
        if (!subnets.includes(prefix)) subnets.unshift(prefix);
        else {
          // Move it to front
          subnets.splice(subnets.indexOf(prefix), 1);
          subnets.unshift(prefix);
        }
      }

      for (const prefix of subnets) {
        const found = await scanSubnet(prefix);
        if (found) {
          await setDesktopIP(found);
          setIpState(found);
          const ok = await ping(found);
          if (ok) return found;
        }
      }
      return null;
    } finally {
      setScanning(false);
    }
  }, [ping]);

  // ── Load saved IP on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = await getDesktopIP();
      if (saved) {
        setIpState(saved);
        const ok = await ping(saved);
        startHeartbeat(saved, ok);
      }
    })();
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── setIP ────────────────────────────────────────────────────────────────────
  const setIP = useCallback(async (newIp: string) => {
    const trimmed = newIp.trim();
    // Cancel any existing heartbeat immediately so the old IP stops pinging
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    // Save to AsyncStorage and update React state
    await setDesktopIP(trimmed);
    setIpState(trimmed);
    // Ping the new IP directly (pass explicitly — never reads from stale closure)
    const ok = await ping(trimmed);
    // Restart heartbeat on the new IP
    startHeartbeat(trimmed, ok);
  }, [ping, startHeartbeat]);

  const refresh = useCallback(async () => {
    const ok = await ping();
    startHeartbeat(ip, ok);
  }, [ping, ip, startHeartbeat]);

  return React.createElement(
    ConnectionContext.Provider,
    { value: { ip, connected, connecting, lastChecked, scanning, setIP, refresh, autoDiscover } },
    children,
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useConnection(): ConnectionContextValue {
  return useContext(ConnectionContext);
}
