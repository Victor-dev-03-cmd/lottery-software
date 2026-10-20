/**
 * Desktop ↔ Mobile relay service.
 * Connects to the Go relay server via WebSocket and broadcasts/receives messages.
 * Works across any network (Ethernet, WiFi, 4G, 5G).
 */

type RelayEventHandler = (payload: Record<string, unknown>) => void;

interface RelayConfig {
  relayUrl: string;  // wss://your-relay.example.com  or  ws://localhost:8080
  sessionId: string;
}

class RelayService {
  private ws:       WebSocket | null = null;
  private config:   RelayConfig | null = null;
  private handlers: Map<string, RelayEventHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  /** Connect to the relay server as the desktop peer */
  connect(config: RelayConfig) {
    this.config = config;
    this._connect();
  }

  private _connect() {
    if (!this.config) return;
    const url = `${this.config.relayUrl}/ws?session=${this.config.sessionId}&role=desktop`;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        console.log(`[Relay] Connected to session ${this.config!.sessionId}`);
        this._emit('connection', { status: 'connected' });
      };

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          const type: string = msg.type ?? '';
          const data: Record<string, unknown> = msg.data ?? {};
          this._emit(type, data);
          this._emit('*', { type, data });
        } catch { /* ignore malformed */ }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._emit('connection', { status: 'disconnected' });
        // Auto-reconnect after 3s
        this.reconnectTimer = setTimeout(() => this._connect(), 3000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch { /* ignore if WebSocket unavailable */ }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  /** Send a message to all mobile peers in the session */
  send(type: string, data: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, session: this.config?.sessionId, data }));
  }

  on(event: string, handler: RelayEventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: RelayEventHandler) {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(event, list.filter(h => h !== handler));
  }

  private _emit(event: string, data: Record<string, unknown>) {
    (this.handlers.get(event) ?? []).forEach(h => h(data));
  }

  get isConnected() { return this.connected; }
}

export const relayService = new RelayService();

// ── QR pairing URL builder ────────────────────────────────────────────────────

export function buildPairingUrl(relayUrl: string, sessionId: string): string {
  // lottery://pair?session=XXXX&relay=wss://...
  const wsUrl = relayUrl.replace(/^http/, 'ws');
  return `lottery://pair?session=${sessionId}&relay=${encodeURIComponent(wsUrl)}`;
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}
