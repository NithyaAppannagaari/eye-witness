// Thin client for the agent's local API (default http://localhost:3001).
// Every type here mirrors a serialized row from the agent — bigint fields
// arrive as strings and stay as strings until the UI needs them.

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3001";

export interface LedgerEntry {
  id: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  photoId: string;
  publisher: string;
  photographer: string | null;
  pageUrl: string;
  amount: string;          // 6-decimal USDC, BigInt-parseable
  useType: string | null;
  blockTimestamp: number | null;
  createdAt: string;
}

export interface PhotoSummary {
  photoHash: string;
  owner: string;
  timestamp: string;            // BigInt seconds
  pHash: string | null;
  grossEarned: string;          // 6-decimal USDC, sum of publisher payments for this photo
  photographerEarned: string;   // 6-decimal USDC, 85% of gross
  detectionCount: number;
}

export interface AgentStatus {
  chainHead: number;
  registry: { lastBlock: number | null; lag: number | null };
  ledger: { lastBlock: number | null; lag: number | null };
}

export interface DetectionRow {
  id: number;
  pageUrl: string;
  imageUrl: string;
  matchedPhotoHash: string | null;
  ownerWallet: string | null;
  status: string;
  useType: string | null;
  licensePrice: string | null;  // 6-decimal USDC, BigInt-parseable
  publisherAddress: string | null;
  txHash: string | null;
  createdAt: string;
  dmcaSentAt: string | null;
  dmcaEmail: string | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_API}${path}`);
  if (!res.ok) throw new Error(`agent api ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const agentApi = {
  ledgerByPublisher: (publisher: string) =>
    get<LedgerEntry[]>(`/api/ledger?publisher=${publisher.toLowerCase()}`),
  ledgerByPhotographer: (photographer: string) =>
    get<LedgerEntry[]>(`/api/ledger?photographer=${photographer.toLowerCase()}`),
  photosByOwner: (owner: string) =>
    get<PhotoSummary[]>(`/api/photos?owner=${owner.toLowerCase()}`),
  detections: (wallet: string) =>
    get<DetectionRow[]>(`/api/detections?wallet=${wallet.toLowerCase()}`),
  disputes: (wallet: string) =>
    get<DetectionRow[]>(`/api/disputes?wallet=${wallet.toLowerCase()}`),
  targets: () => get<string[]>(`/api/targets`),
  status: () => get<AgentStatus>(`/api/agent-status`),
  addTarget: async (url: string) => {
    const res = await fetch(`${AGENT_API}/api/targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return res.json() as Promise<{ ok: boolean; targets?: string[]; error?: string }>;
  },
  removeTarget: async (url: string) => {
    const res = await fetch(`${AGENT_API}/api/targets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return res.json() as Promise<{ ok: boolean; targets?: string[] }>;
  },
  requeueDetection: async (id: number): Promise<RequeueResult> => {
    const res = await fetch(`${AGENT_API}/api/detections/${id}/requeue`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as Partial<RequeueResult> & { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `agent api: ${res.status}`, balance: body.balance, required: body.required };
    return { ok: true, status: body.status ?? "paid", txHash: body.txHash, amount: body.amount, reconciled: body.reconciled };
  },
};

export interface RequeueResult {
  ok: boolean;
  status?: string;
  txHash?: string;
  amount?: string;
  reconciled?: boolean;
  error?: string;
  balance?: string;
  required?: string;
}

export { AGENT_API };
