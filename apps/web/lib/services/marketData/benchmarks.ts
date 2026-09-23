import type { BenchmarkFixing, BenchmarkIndex, BenchmarkTenor } from "@/lib/services/types";

export type BenchmarkAdapter = {
  id: string;
  fetchFixings(date: string): Promise<BenchmarkFixing[]>;
};

const BASE: Record<BenchmarkIndex, Record<BenchmarkTenor, number>> = {
  SOFR: { ON: 4.29, "1M": 4.31, "3M": 4.18 },
  HIBOR: { ON: 3.55, "1M": 3.72, "3M": 3.48 },
  SHIBOR: { ON: 1.52, "1M": 1.68, "3M": 1.71 },
};

function hash(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) >>> 0;
  return n;
}

/** Deterministic mock adapter — swap for a live vendor in production. */
export const mockBenchmarkAdapter: BenchmarkAdapter = {
  id: "mock-fixings-v1",
  async fetchFixings(date: string) {
    const indexes: BenchmarkIndex[] = ["SOFR", "HIBOR", "SHIBOR"];
    const tenors: BenchmarkTenor[] = ["ON", "1M", "3M"];
    return indexes.flatMap((index) =>
      tenors.map((tenor) => {
        const wobble = ((hash(`${date}:${index}:${tenor}`) % 17) - 8) / 1000;
        return {
          index,
          tenor,
          date,
          ratePct: Number((BASE[index][tenor] + wobble).toFixed(4)),
          source: "MOCK",
        };
      }),
    );
  },
};

let activeAdapter: BenchmarkAdapter = mockBenchmarkAdapter;

export function setBenchmarkAdapter(adapter: BenchmarkAdapter) {
  activeAdapter = adapter;
}

export function getBenchmarkAdapter(): BenchmarkAdapter {
  return activeAdapter;
}

export async function syncBenchmarks(date: string): Promise<BenchmarkFixing[]> {
  return activeAdapter.fetchFixings(date);
}
