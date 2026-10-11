export interface ReportBatch {
  sealed?: boolean;
  samples: Record<string, unknown>[];
  epoch: string;
  sequence: number;
  sessionId: string;
  build: string;
  device: Record<string, unknown>;
}
/** Account-scoped bounded retry queue. Acknowledgement removes only its own batch. */
export class ReportOutbox {
  batches: ReportBatch[] = [];
  constructor(private storage: Storage, private key: string) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]');
      if (Array.isArray(parsed)) this.batches = parsed.filter(b => b && Array.isArray(b.samples) && b.samples.length <= 12 && typeof b.sessionId === 'string' && typeof b.epoch === 'string' && Number.isInteger(b.sequence)).slice(-240);
    } catch { /* Storage is optional when unavailable. */ }
  }
  persist(): void { try { this.storage.setItem(this.key, JSON.stringify(this.batches)); } catch { /* Keep the in-memory queue if storage is full. */ } }
  add(batch: ReportBatch): void { this.batches.push(batch); this.batches = this.batches.slice(-240); this.persist(); }
  acknowledge(batch: ReportBatch): void { this.batches = this.batches.filter(b => !(b.sessionId === batch.sessionId && b.sequence === batch.sequence)); this.persist(); }
  clear(): void { this.batches = []; try { this.storage.removeItem(this.key); } catch { /* No storage available. */ } }
}
