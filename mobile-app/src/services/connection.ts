import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { checkHealth, getDesktopIP, setDesktopIP } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionContextValue {
  ip: string;
  connected: boolean;
  connecting: boolean;
  lastChecked: Date | null;
  setIP: (ip: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const ConnectionContext = createContext<ConnectionContextValue>({
  ip: '',
  connected: false,
  connecting: false,
  lastChecked: null,
  setIP: async () => {},
  refresh: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [ip, setIpState] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const ping = useCallback(async (targetIp?: string) => {
    const resolvedIp = (targetIp ?? ip).trim();
    if (!resolvedIp) return;

    setConnecting(true);
    try {
      // Pass IP directly — avoids AsyncStorage race condition
      await checkHealth(resolvedIp);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setConnecting(false);
      setLastChecked(new Date());
    }
  }, [ip]);

  // Load saved IP on mount
  useEffect(() => {
    (async () => {
      const saved = await getDesktopIP();
      if (saved) {
        setIpState(saved);
        await ping(saved);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-ping whenever ip changes
  useEffect(() => {
    if (ip) ping(ip);
  }, [ip]); // eslint-disable-line react-hooks/exhaustive-deps

  const setIP = useCallback(async (newIp: string) => {
    const trimmed = newIp.trim();
    await setDesktopIP(trimmed);
    setIpState(trimmed);
    // ping will fire via the useEffect above
  }, []);

  const refresh = useCallback(async () => {
    await ping();
  }, [ping]);

  return React.createElement(
    ConnectionContext.Provider,
    {
      value: { ip, connected, connecting, lastChecked, setIP, refresh },
    },
    children
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConnection(): ConnectionContextValue {
  return useContext(ConnectionContext);
}
