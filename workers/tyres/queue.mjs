import { parseSize, selectGuides } from './guide.mjs';
export class GuideQueue {
  constructor(lookup, { brands, ttlMs = 300000, timeoutMs = 20000, maxPending = 8, maxCache = 200, clock = Date.now } = {}) {
    Object.assign(this, { lookup, brands, ttlMs, timeoutMs, maxPending, maxCache, clock });
    this.cache = new Map(); this.pending = new Map(); this.tail = Promise.resolve(); this.blocked = false;
  }
  async get(size, quantity = 1) {
    const normal = parseSize(size).key;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('Invalid quantity');
    const key = `${normal}:${quantity}`;
    const cached = this.cache.get(key);
    if (cached && this.clock() - cached.time < this.ttlMs) return structuredClone(cached.result);
    this.cache.delete(key);
    if (this.blocked) throw new Error('WORKER_RESTART_REQUIRED');
    if (this.pending.has(key)) return structuredClone(await this.pending.get(key));
    if (this.pending.size >= this.maxPending) throw new Error('WORKER_BUSY');
    const task = this.tail.then(async () => {
      if (this.blocked) throw new Error('WORKER_RESTART_REQUIRED');
      const controller = new AbortController();
      let timer;
      try {
        const payload = await Promise.race([
          Promise.resolve().then(() => this.lookup(normal, { signal: controller.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => {
            // An uncancelled browser search must never overlap the following search.
            this.blocked = true; controller.abort(); reject(new Error('LOOKUP_TIMEOUT'));
          }, this.timeoutMs); })
        ]);
        const result = selectGuides(payload.rows, { size: normal, quantity, brands: this.brands, settings: payload.settings, now: this.clock() });
        if (this.cache.size >= this.maxCache) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { time: this.clock(), result });
        return result;
      } finally { clearTimeout(timer); }
    });
    this.tail = task.catch(() => {});
    this.pending.set(key, task);
    try { return structuredClone(await task); } finally { this.pending.delete(key); }
  }
}
