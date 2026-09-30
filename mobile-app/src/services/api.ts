import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'desktop_ip';
const PORT = 7423;
// Must match COMPANION_KEY constant in src-tauri/src/lib.rs
const API_KEY = 'LOTTERY_COMPANION';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version?: string;
  uptime?: number;
}

export interface StockItem {
  game_name: string;
  game_name_si?: string;
  total_purchased: number;
  total_returned: number;
  total_invoiced: number;
  remaining: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  agent_id: number;
  agent_name?: string;
  status: 'draft' | 'confirmed' | 'paid';
  issue_date: string;
  total_amount: number;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface Agent {
  id: number;
  name: string;
  phone?: string;
  area?: string;
  active: boolean;
}

export interface PurchaseData {
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  unit_price: number;
  purchase_date: string;
  supplier_name?: string;
  notes?: string;
}

export interface ReturnData {
  game_name: string;
  barcode_start: string;
  barcode_end: string;
  qty: number;
  reason: string;
  return_date: string;
  notes?: string;
}

export interface DashboardStats {
  total_stock: number;
  todays_purchases: number;
  pending_returns: number;
  active_agents: number;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export async function setDesktopIP(ip: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, ip.trim());
}

export async function getDesktopIP(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

// ─── Axios factory ────────────────────────────────────────────────────────────

function createClient(ip: string): AxiosInstance {
  return axios.create({
    baseURL: `http://${ip}:${PORT}`,
    timeout: 8000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
  });
}

async function client(): Promise<AxiosInstance> {
  const ip = await getDesktopIP();
  if (!ip) throw new Error('Desktop IP not configured. Go to Settings to set it.');
  return createClient(ip);
}

// ─── Error helper ─────────────────────────────────────────────────────────────

export function parseNetworkError(err: any): string {
  // Axios on React Native wraps all network failures as "Network Error"
  // with no error code — must check message string
  const msg: string = err?.message ?? '';
  const code: string = err?.code ?? '';
  if (msg === 'Network Error' || code === 'ECONNREFUSED') {
    return 'Connection refused — make sure the Lottery desktop app is running and both devices are on the same WiFi.';
  }
  if (code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout')) {
    return 'Timed out — check that both devices are on the same WiFi network.';
  }
  if (msg.includes('IP not configured')) return msg;
  return `Error: ${msg || 'Unknown network error'}`;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** Pass ip directly to skip AsyncStorage read — avoids race conditions */
export async function checkHealth(directIp?: string): Promise<HealthResponse> {
  const c = directIp ? createClient(directIp) : await client();
  const res = await c.get<HealthResponse>('/api/v1/health');
  return res.data;
}

export async function getStock(): Promise<StockItem[]> {
  const c = await client();
  const res = await c.get<StockItem[]>('/api/v1/stock');
  return res.data;
}

export async function getInvoices(agentId?: number): Promise<Invoice[]> {
  const c = await client();
  const params = agentId ? { agent_id: agentId } : {};
  const res = await c.get<Invoice[]>('/api/v1/invoices', { params });
  return res.data;
}

export async function getInvoice(id: number): Promise<Invoice> {
  const c = await client();
  const res = await c.get<Invoice>(`/api/v1/invoices/${id}`);
  return res.data;
}

export async function getAgents(): Promise<Agent[]> {
  const c = await client();
  const res = await c.get<Agent[]>('/api/v1/agents');
  return res.data;
}

export async function addPurchase(data: PurchaseData): Promise<{ id: number }> {
  const c = await client();
  const res = await c.post<{ id: number }>('/api/v1/purchases', data);
  return res.data;
}

export async function addReturn(data: ReturnData): Promise<{ id: number }> {
  const c = await client();
  const res = await c.post<{ id: number }>('/api/v1/returns', data);
  return res.data;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Try a dedicated endpoint; fall back to computing from stock + invoices
  const c = await client();
  try {
    const res = await c.get<DashboardStats>('/api/v1/dashboard');
    return res.data;
  } catch {
    // Fallback: derive from stock endpoint
    const stock = await getStock();
    const totalStock = stock.reduce((sum, s) => sum + (s.remaining || 0), 0);
    return {
      total_stock: totalStock,
      todays_purchases: 0,
      pending_returns: 0,
      active_agents: 0,
    };
  }
}
