// Site speed for creator tenants — Google PageSpeed Insights (Lighthouse lab score +
// real-user Core Web Vitals field data). Cached 24h so we hit the API at most once a day.
// Works keyless (shared anonymous quota); set PAGESPEED_API_KEY for a reliable own-project quota.

export interface SpeedMetric {
  key: string;
  label: string;
  value: number; // p75
  display: string; // human-formatted (e.g. "2.1 s", "0.04", "180 ms")
  rating: "good" | "warn" | "bad";
}

export interface SiteSpeed {
  url: string;
  perfScore: number | null; // Lighthouse lab performance, 0–100
  fieldOverall: "FAST" | "AVERAGE" | "SLOW" | null;
  metrics: SpeedMetric[];
  hasField: boolean;
  fetchedAt: string;
}

const CATEGORY_RATING: Record<string, SpeedMetric["rating"]> = {
  FAST: "good",
  AVERAGE: "warn",
  SLOW: "bad",
};

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

interface PsiMetric {
  percentile?: number;
  category?: string;
}

interface PsiResponse {
  lighthouseResult?: { categories?: { performance?: { score?: number } } };
  loadingExperience?: { overall_category?: string; metrics?: Record<string, PsiMetric> };
  error?: { message?: string };
}

const FIELD_KEYS: { psi: string; key: string; label: string; kind: "ms" | "cls" }[] = [
  { psi: "LARGEST_CONTENTFUL_PAINT_MS", key: "lcp", label: "Largest Contentful Paint", kind: "ms" },
  { psi: "INTERACTION_TO_NEXT_PAINT", key: "inp", label: "Interaction to Next Paint", kind: "ms" },
  { psi: "CUMULATIVE_LAYOUT_SHIFT_SCORE", key: "cls", label: "Cumulative Layout Shift", kind: "cls" },
  { psi: "EXPERIENCE_FIRST_CONTENTFUL_PAINT_MS", key: "fcp", label: "First Contentful Paint", kind: "ms" },
  { psi: "EXPERIENCE_TIME_TO_FIRST_BYTE", key: "ttfb", label: "Time to First Byte", kind: "ms" },
];

export async function fetchSiteSpeed(rawUrl: string): Promise<SiteSpeed | null> {
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PsiResponse;
  if (data.error) return null;

  const score = data.lighthouseResult?.categories?.performance?.score;
  const le = data.loadingExperience ?? {};
  const fieldMetrics = le.metrics ?? {};
  const hasField = !!le.overall_category;

  const metrics: SpeedMetric[] = [];
  for (const f of FIELD_KEYS) {
    const m = fieldMetrics[f.psi];
    if (!m || typeof m.percentile !== "number") continue;
    const p75 = f.kind === "cls" ? m.percentile / 100 : m.percentile;
    metrics.push({
      key: f.key,
      label: f.label,
      value: p75,
      display: f.kind === "cls" ? p75.toFixed(2) : fmtMs(m.percentile),
      rating: CATEGORY_RATING[m.category ?? ""] ?? "warn",
    });
  }

  return {
    url,
    perfScore: typeof score === "number" ? Math.round(score * 100) : null,
    fieldOverall: (le.overall_category as SiteSpeed["fieldOverall"]) ?? null,
    metrics,
    hasField,
    fetchedAt: new Date().toISOString(),
  };
}
