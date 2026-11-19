// Token Radar, model radar-3.
//
// One sealed snapshot in, one ranked board out. The board ranks EVERY
// rankable pre-token protocol in the snapshot -- the 40 watchlist slugs
// plus every other rankable protocol below the floor -- so the radar is
// complete, not a top-N cut. Rankable means pre-token and not a derivative
// of a token that already trades: no exchange, no bridge, no versioned
// pool, no wrapped/staked product, no exchange-named product (the house
// watchlist's own rule, minus its TVL floor). Live-token protocols are
// never ranked: they already trade, so the dashboard shows them apart.
//
// The value model is FITTED, not multiplied by a hand-picked constant:
//
//   1. Size curve. Ordinary least squares on the tokens that already
//      trade in this same snapshot (one anchor per ticker, 128 anchors):
//        log10(mcap) = a + b * log10(tvl)
//      The fit's intercept, slope, R-squared and anchor count are shown
//      on the dashboard. The fitted curve is the protocol's curve value.
//   2. Category multiplier. For each category with at least 3 anchors,
//      the median log-residual of that category's anchors, shrunk by
//      n / (n + 3) toward 1. Categories with fewer anchors get 1.00.
//   3. Two STATED adjustments, labelled as stated, not fitted:
//        growth   = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//        maturity = 0.6 + min(age_days, 1095) / 1095 * 0.4
//      Age is snapshot as_of minus listed_at, in whole days; unknown
//      listed_at counts as 365 days.
//        implied = round(curve * category_multiplier * growth * maturity)
//
// Validation is computed from the same snapshot and shown on the
// dashboard: a blind holdout (fit on 70% of anchors by slug order, test
// on the other 30%), walk-forward by listing date (fit the earliest 50%
// and 75%, test the rest), leave-one-out over all 128 anchors, and a
// 200-refit bootstrap (fixed seed, so deterministic) that gives every
// ranked protocol a p10-p90 rank range.
//
// Farm plans are NETTED per protocol, from the protocol's own record
// (category, first chain, TVL, age) and the fitted implied value:
// capital tiered by TVL, gas per chain at a stated midpoint, eight
// transactions per plan, capital cost at 5% APR over the hold, and an
// expected airdrop of 5% of implied value shared among an estimated
// wallet count tiered by TVL. Expected value = airdrop share - gas -
// capital cost; the verdict is farm (EV >= $25), thin (0 < EV < $25)
// or skip (EV <= 0), with the break-even implied value shown.
//
// Deterministic: no clock, no randomness (the bootstrap uses a fixed-seed
// generator), no network. Every sort breaks ties by slug, so two runs
// write identical bytes.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve plus its category multipliers. */
export interface SizeFit {
  intercept: number;
  slope: number;
  r_squared: number;
  anchors: number;
  /** log10(mcap) residual spread of the anchors, for the dashboard. */
  residual_sd: number;
  /** Category -> multiplier; only categories with >= 3 anchors. */
  category_multipliers: Record<string, number>;
  /** Category -> anchor count behind its multiplier. */
  category_anchor_counts: Record<string, number>;
  /** Median anchor age in days, used where listed_at is unknown. */
  median_anchor_age_days: number;
}

/** One validation run: mean and median absolute percentage error. */
export interface ValidationRun {
  label: string;
  n_train: number;
  n_test: number;
  mape_mean: number;
  mape_median: number;
}

/** Everything the dashboard's methodology panel shows about validation. */
export interface Validation {
  holdout: ValidationRun;
  walk_forward: ValidationRun[];
  leave_one_out: ValidationRun;
  bootstrap_refits: number;
  /** Median width (p90 - p10) of the rank ranges across ranked rows. */
  bootstrap_median_range_width: number;
}

/** The farm assumptions, stated on the dashboard. */
export interface FarmAssumptions {
  airdrop_pool_share: number;
  apr: number;
  transactions: number;
  farm_threshold_usd: number;
  capital_tiers: { tvl_at_least_usd: number; capital_usd: number }[];
  wallet_tiers: { tvl_at_least_usd: number; wallets: number }[];
  gas_mid_usd: Record<string, number>;
  gas_default_usd: number;
}

export const FARM: FarmAssumptions = {
  airdrop_pool_share: 0.05,
  apr: 0.05,
  transactions: 8,
  farm_threshold_usd: 25,
  capital_tiers: [
    { tvl_at_least_usd: 5_000_000_000, capital_usd: 500 },
    { tvl_at_least_usd: 1_000_000_000, capital_usd: 250 },
    { tvl_at_least_usd: 100_000_000, capital_usd: 100 },
    { tvl_at_least_usd: 0, capital_usd: 50 },
  ],
  wallet_tiers: [
    { tvl_at_least_usd: 5_000_000_000, wallets: 100_000 },
    { tvl_at_least_usd: 1_000_000_000, wallets: 50_000 },
    { tvl_at_least_usd: 100_000_000, wallets: 20_000 },
    { tvl_at_least_usd: 0, wallets: 5_000 },
  ],
  gas_mid_usd: {
    ethereum: 5.5,
    solana: 0.05,
    base: 0.25,
    arbitrum: 0.25,
    optimism: 0.25,
    bsc: 0.55,
    polygon: 0.55,
    avalanche: 0.55,
    tron: 0.55,
    bitcoin: 0.55,
  },
  gas_default_usd: 0.55,
};

/** The model's version label, named by the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** How the bootstrap resamples: fixed seed, so two runs agree exactly. */
export const BOOTSTRAP_REFITS = 200;
export const BOOTSTRAP_SEED = 20261119;

/** The stated (not fitted) adjustment weights, shown as stated. */
export const STATED = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** One farm step: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A protocol's netted farm plan. */
export interface FarmPlan {
  capital_usd: number;
  hold_days: number;
  gas_per_tx_usd: number;
  gas_total_usd: number;
  capital_cost_usd: number;
  expected_airdrop_usd: number;
  expected_value_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
  breakeven_implied_usd: number;
  wallets_estimated: number;
  steps: FarmStep[];
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  model: {
    curve_usd: number;
    category_multiplier: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  rank_p10: number;
  rank_p90: number;
  farm: {
    capital_usd: number;
    hold_days: number;
    gas_total_usd: number;
    capital_cost_usd: number;
    expected_airdrop_usd: number;
    expected_value_usd: number;
    verdict: 'farm' | 'thin' | 'skip';
    breakeven_implied_usd: number;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js; the page regenerates farm steps. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  curve_usd: number;
  category_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  rank_p10: number;
  rank_p90: number;
  farm: BoardRow['farm'];
  farm_steps: string[];
}

/** A live-token protocol: the market's own value, never a model number. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One excluded pre-token protocol, with the rule that kept it out. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** How the 758 snapshot protocols are accounted for. */
export interface Coverage {
  total: number;
  ranked: number;
  traded: number;
  excluded: number;
  excluded_by_reason: Record<string, number>;
  watchlist: number;
  watchlist_ranked: number;
}

/** One anchor's comps for the detail view: nearest traded tokens. */
export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  mcap_per_tvl: number;
}

/** Everything the dashboard needs to render. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: SizeFit;
  validation: Validation;
  farm_assumptions: FarmAssumptions;
  coverage: Coverage;
  watchlist_size: number;
  board_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
  comps: Record<string, CompRow[]>;
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A deterministic generator: mulberry32, so the bootstrap repeats exactly. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scored {
  implied: number;
  curve: number;
  catMult: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
}

/** The stated growth adjustment: 1 + clamped 7d change x 0.5. */
export function growthMultiplier(protocol: SnapshotProtocol): number {
  const raw = finite(protocol.change_7d, 0);
  const pct = Math.min(STATED.growth_cap, Math.max(STATED.growth_floor, raw));
  return 1 + (pct / 100) * STATED.growth_weight;
}

/** The stated maturity adjustment: older with no token counts for more. */
export function maturityMultiplier(age: number | null): number {
  const a = age ?? STATED.unknown_age_days;
  return STATED.maturity_floor + (Math.min(Math.max(a, 0), STATED.maturity_days) / STATED.maturity_days) * STATED.maturity_range;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that is a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** The categories that move an existing token rather than run a protocol of their own. */
const BRIDGE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether the board may rank a protocol: pre-token, not an exchange, not a
 * bridge of an existing token, not a versioned pool, and not a wrapped or
 * staked product of a token that already trades (the same rule the
 * watchlist applies, minus its TVL floor). A rule, never a list of names.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== 'CEX' &&
    !BRIDGE_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_OR_STAKED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The first exclusion rule a pre-token protocol trips, or null when rankable. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category === 'CEX') return 'exchange (CEX)';
  if (BRIDGE_CATEGORIES.has(p.category ?? '')) return 'bridge category';
  if (VERSIONED.test(p.name)) return 'versioned pool';
  if (WRAPPED_OR_STAKED.test(p.name)) return 'wrapped / staked product';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-named product';
  return null;
}

/**
 * The anchors the size curve is fitted on: every traded protocol with a
 * positive TVL and market cap, one per ticker (the highest-TVL record
 * wins a ticker). All 128 in this snapshot carry distinct tickers.
 */
export function anchorsOf(snapshot: Snapshot): SnapshotProtocol[] {
  const bySymbol = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.symbol === null) continue;
    const prev = bySymbol.get(p.symbol);
    if (prev === undefined || p.tvl_usd > prev.tvl_usd) bySymbol.set(p.symbol, p);
  }
  return [...bySymbol.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Ordinary least squares for y = a + b*x; returns [intercept, slope]. */
export function ols(points: [number, number][]): [number, number] {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  return [(sy - slope * sx) / n, slope];
}

/** Median of a sorted-or-not number list. */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length;
  if (m === 0) return 0;
  return m % 2 === 1 ? v[(m - 1) / 2]! : (v[m / 2 - 1]! + v[m / 2]!) / 2;
}

/**
 * Fit the size curve on `anchors`: OLS of log10(mcap) on log10(tvl),
 * R-squared, residual spread, and one shrunk median-residual multiplier
 * per category with at least 3 anchors.
 */
export function fitSizeCurve(anchors: SnapshotProtocol[], asOf: string): SizeFit {
  const points = anchors.map((p): [number, number] => [Math.log10(p.tvl_usd), Math.log10(p.mcap_usd!)]);
  const [intercept, slope] = ols(points);
  const ys = points.map(([, y]) => y);
  const yMean = ys.reduce((s, y) => s + y, 0) / ys.length;
  let ssRes = 0;
  let ssTot = 0;
  const residuals: number[] = [];
  for (const [x, y] of points) {
    const r = y - (intercept + slope * x);
    residuals.push(r);
    ssRes += r * r;
    ssTot += (y - yMean) * (y - yMean);
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const residualSd = Math.sqrt(ssRes / Math.max(1, points.length - 2));
  const byCategory = new Map<string, number[]>();
  for (let i = 0; i < anchors.length; i++) {
    const cat = anchors[i]!.category ?? '(no category)';
    const list = byCategory.get(cat) ?? [];
    list.push(residuals[i]!);
    byCategory.set(cat, list);
  }
  const categoryMultipliers: Record<string, number> = {};
  const categoryAnchorCounts: Record<string, number> = {};
  for (const [cat, list] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (list.length < 3) continue;
    const shrink = list.length / (list.length + 3);
    categoryMultipliers[cat] = round4(Math.pow(10, shrink * median(list)));
    categoryAnchorCounts[cat] = list.length;
  }
  const ages = anchors
    .map((p) => ageDays(asOf, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  const medianAnchorAge = ages.length > 0 ? ages[Math.floor(ages.length / 2)]! : STATED.unknown_age_days;
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    r_squared: round4(rSquared),
    anchors: anchors.length,
    residual_sd: round4(residualSd),
    category_multipliers: categoryMultipliers,
    category_anchor_counts: categoryAnchorCounts,
    median_anchor_age_days: medianAnchorAge,
  };
}

/** The fitted curve value of a protocol's TVL, before multipliers. */
export function curveValue(tvlUsd: number, fit: SizeFit): number {
  return Math.pow(10, fit.intercept + fit.slope * Math.log10(tvlUsd));
}

/** The four factors and the implied value one protocol gets under `fit`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, fit: SizeFit): Scored {
  const age = ageDays(asOf, protocol.listed_at);
  const curve = curveValue(protocol.tvl_usd, fit);
  const catMult = fit.category_multipliers[protocol.category ?? '(no category)'] ?? 1;
  const growthMult = growthMultiplier(protocol);
  const maturityMult = maturityMultiplier(age);
  const implied = Math.max(1, Math.round(curve * catMult * growthMult * maturityMult));
  return { implied, curve: Math.round(curve), catMult: round4(catMult), growthMult: round4(growthMult), maturityMult: round4(maturityMult), age };
}

/** Mean and median absolute percentage error of predictions vs actuals. */
export function apeStats(pairs: [number, number][]): { mape_mean: number; mape_median: number } {
  const apes = pairs
    .map(([pred, actual]) => Math.abs(pred - actual) / actual)
    .sort((a, b) => a - b);
  const mean = apes.reduce((s, v) => s + v, 0) / Math.max(1, apes.length);
  return { mape_mean: round4(mean), mape_median: round4(apes.length > 0 ? apes[Math.floor(apes.length / 2)]! : 0) };
}

/**
 * The full validation suite for one fitted pipeline. `predict` scores a
 * protocol under a fit made on `train`; every run refits from scratch.
 */
export function validateModel(snapshot: Snapshot, anchors: SnapshotProtocol[]): Validation {
  const asOf = snapshot.as_of;
  const predict = (p: SnapshotProtocol, fit: SizeFit): number => impliedValue(p, asOf, fit).implied;

  // Blind holdout: slug order, every 10th row in {3, 7, 9} is the test set.
  const bySlug = [...anchors].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const holdTrain = bySlug.filter((_, i) => i % 10 !== 3 && i % 10 !== 7 && i % 10 !== 9);
  const holdTest = bySlug.filter((_, i) => i % 10 === 3 || i % 10 === 7 || i % 10 === 9);
  const holdFit = fitSizeCurve(holdTrain, asOf);
  const holdStats = apeStats(holdTest.map((p) => [predict(p, holdFit), p.mcap_usd!]));
  const holdout: ValidationRun = {
    label: 'blind holdout (fit 70% / test 30%, by slug order)',
    n_train: holdTrain.length,
    n_test: holdTest.length,
    ...holdStats,
  };

  // Walk-forward by listing date: fit the earliest 50% and 75%, test the rest.
  const dated = anchors
    .filter((p) => ageDays(asOf, p.listed_at) !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const walkForward: ValidationRun[] = [];
  for (const frac of [0.5, 0.75]) {
    const k = Math.floor(dated.length * frac);
    const wfFit = fitSizeCurve(dated.slice(0, k), asOf);
    const stats = apeStats(dated.slice(k).map((p) => [predict(p, wfFit), p.mcap_usd!]));
    walkForward.push({
      label: `walk-forward (fit earliest ${Math.round(frac * 100)}% by listing date)`,
      n_train: k,
      n_test: dated.length - k,
      ...stats,
    });
  }

  // Leave-one-out over every anchor.
  const looPairs: [number, number][] = [];
  for (let i = 0; i < anchors.length; i++) {
    const train = anchors.filter((_, j) => j !== i);
    const looFit = fitSizeCurve(train, asOf);
    looPairs.push([predict(anchors[i]!, looFit), anchors[i]!.mcap_usd!]);
  }
  const looStats = apeStats(looPairs);
  const leaveOneOut: ValidationRun = {
    label: 'leave-one-out (128 refits)',
    n_train: anchors.length - 1,
    n_test: anchors.length,
    ...looStats,
  };

  return {
    holdout,
    walk_forward: walkForward,
    leave_one_out: leaveOneOut,
    bootstrap_refits: BOOTSTRAP_REFITS,
    bootstrap_median_range_width: 0, // filled in by bootstrapRankRanges
  };
}

/**
 * Bootstrap rank ranges: refit the curve on 200 resamples of the anchors
 * (fixed seed), re-rank the rankable protocols each time, and take the
 * p10-p90 rank per protocol. Returns slug -> [p10, p90] and the median
 * range width across protocols.
 */
export function bootstrapRankRanges(
  rankable: SnapshotProtocol[],
  anchors: SnapshotProtocol[],
  asOf: string,
): { ranges: Map<string, [number, number]>; medianWidth: number } {
  const rand = seededRandom(BOOTSTRAP_SEED);
  const collected = new Map<string, number[]>();
  for (const p of rankable) collected.set(p.slug, []);
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < anchors.length; i++) sample.push(anchors[Math.floor(rand() * anchors.length)]!);
    const fit = fitSizeCurve(sample, asOf);
    const scored = rankable.map((p) => ({ slug: p.slug, implied: impliedValue(p, asOf, fit).implied }));
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => collected.get(s.slug)!.push(i + 1));
  }
  const ranges = new Map<string, [number, number]>();
  const widths: number[] = [];
  for (const [slug, ranks] of collected) {
    const sorted = [...ranks].sort((a, b) => a - b);
    const lo = sorted[Math.floor(0.1 * sorted.length)]!;
    const hi = sorted[Math.floor(0.9 * sorted.length)]!;
    ranges.set(slug, [lo, hi]);
    widths.push(hi - lo);
  }
  widths.sort((a, b) => a - b);
  return { ranges, medianWidth: widths.length > 0 ? widths[Math.floor(widths.length / 2)]! : 0 };
}

/** The protocol's first chain, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas midpoint of one transaction on a chain, in whole dollars. */
export function gasMidUsd(chain: string): number {
  return FARM.gas_mid_usd[chain.toLowerCase()] ?? FARM.gas_default_usd;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  for (const tier of FARM.capital_tiers) if (p.tvl_usd >= tier.tvl_at_least_usd) return tier.capital_usd;
  return 50;
}

/** How many wallets are estimated to farm a protocol of this TVL. */
function walletsFor(p: SnapshotProtocol): number {
  for (const tier of FARM.wallet_tiers) if (p.tvl_usd >= tier.tvl_at_least_usd) return tier.wallets;
  return 5_000;
}

/** How long to hold, from the protocol's age: younger protocols get longer. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** One step as a single string: action, then cost and time, 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The category's one qualifying action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized'))
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open.`;
  if (c.includes('dex') || c.includes('liquidity manager'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a narrow range and keep it open.`;
  if (c.includes('leveraged farm') || c.includes('farm'))
    return `Open a $${capital} leveraged farm position on ${name} on ${chain} at low leverage and keep it open.`;
  if (c.includes('yield aggregator'))
    return `Deposit $${capital} of USDC into a ${name} yield vault on ${chain} and keep the vault shares.`;
  if (c.includes('yield'))
    return `Deposit $${capital} of USDC into ${name}'s main yield strategy on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds inside its app.`;
  if (c.includes('liquid restaking') || c.includes('restak'))
    return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('liquid staking') || c.includes('staking pool'))
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options') || c.includes('synthetic') || c.includes('basis'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} on ${chain} and place one market position on an outcome you follow.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable') || c.includes('algo-stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the app.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in your wallet.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('launchpad'))
    return `Stake $${capital} of the launchpad asset on ${name} on ${chain} and join one sale allocation.`;
  if (c.includes('nft'))
    return `List or buy one item worth about $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('payment') || c.includes('card'))
    return `Spend $${capital} through ${name} on ${chain} and keep the card or payment account active.`;
  if (c.includes('index'))
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it.`;
  if (c.includes('ai agent') || c.includes('decentralized ai'))
    return `Deposit $${capital} into ${name} on ${chain} and run one agent task a week.`;
  if (c.includes('privacy'))
    return `Deposit $${capital} through ${name} on ${chain} and make one private transfer a week.`;
  if (c.includes('token locker') || c.includes('governance'))
    return `Lock $${capital} of assets in ${name} on ${chain} and vote once while it is locked.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's netted farm plan: the expected airdrop, the costs, the net
 * expected value, the verdict and the break-even implied value, plus six
 * steps with a concrete cost and a concrete time in every step.
 */
export function farmPlan(p: SnapshotProtocol, implied: number, age: number | null): FarmPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasPerTx = gasMidUsd(chain);
  const gasTotal = round2(gasPerTx * FARM.transactions);
  const capitalCost = round2((capital * FARM.apr * hold) / 365);
  const wallets = walletsFor(p);
  const expectedAirdrop = round2((implied * FARM.airdrop_pool_share) / wallets);
  const ev = round2(expectedAirdrop - gasTotal - capitalCost);
  const verdict: FarmPlan['verdict'] = ev >= FARM.farm_threshold_usd ? 'farm' : ev > 0 ? 'thin' : 'skip';
  const breakeven = Math.max(1, Math.round(((gasTotal + capitalCost) * wallets) / FARM.airdrop_pool_share));
  const gas = `$${gasPerTx} of gas a transaction`;
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.`,
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return {
    capital_usd: capital,
    hold_days: hold,
    gas_per_tx_usd: gasPerTx,
    gas_total_usd: gasTotal,
    capital_cost_usd: capitalCost,
    expected_airdrop_usd: expectedAirdrop,
    expected_value_usd: ev,
    verdict,
    breakeven_implied_usd: breakeven,
    wallets_estimated: wallets,
    steps,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..N. */
export function buildBoard(
  snapshot: Snapshot,
  fit: SizeFit,
  ranges: Map<string, [number, number]>,
): BoardRow[] {
  const watchSet = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  const scored = chosen.map((p) => {
    const s = impliedValue(p, snapshot.as_of, fit);
    const plan = farmPlan(p, s.implied, s.age);
    return { p, s, plan };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((entry, i) => {
    const p = entry.p;
    const s = entry.s;
    const plan = entry.plan;
    const range = ranges.get(p.slug) ?? [i + 1, i + 1];
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      watchlist: watchSet.has(p.slug),
      model: {
        curve_usd: s.curve,
        category_multiplier: s.catMult,
        growth_multiplier: s.growthMult,
        maturity_multiplier: s.maturityMult,
        age_days: s.age,
      },
      rank_p10: range[0],
      rank_p90: range[1],
      farm: {
        capital_usd: plan.capital_usd,
        hold_days: plan.hold_days,
        gas_total_usd: plan.gas_total_usd,
        capital_cost_usd: plan.capital_cost_usd,
        expected_airdrop_usd: plan.expected_airdrop_usd,
        expected_value_usd: plan.expected_value_usd,
        verdict: plan.verdict,
        breakeven_implied_usd: plan.breakeven_implied_usd,
      },
      farm_steps: plan.steps.map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols the rule keeps out, with the reason each trips. */
export function excludedRows(snapshot: Snapshot): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p) ?? 'excluded by rule',
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
}

/** The nearest comps per ranked protocol: traded anchors in its category. */
export function compsFor(snapshot: Snapshot, anchors: SnapshotProtocol[], rankable: SnapshotProtocol[]): Record<string, CompRow[]> {
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const a of anchors) {
    const list = byCategory.get(a.category ?? '') ?? [];
    list.push(a);
    byCategory.set(a.category ?? '', list);
  }
  const out: Record<string, CompRow[]> = {};
  for (const p of rankable) {
    const pool = (byCategory.get(p.category ?? '') ?? []).filter((a) => a.slug !== p.slug);
    pool.sort(
      (a, b) =>
        Math.abs(Math.log10(a.tvl_usd) - Math.log10(p.tvl_usd)) - Math.abs(Math.log10(b.tvl_usd) - Math.log10(p.tvl_usd)) ||
        (a.slug < b.slug ? -1 : 1),
    );
    out[p.slug] = pool.slice(0, 3).map((a) => ({
      slug: a.slug,
      name: a.name,
      category: a.category,
      tvl_usd: a.tvl_usd,
      mcap_usd: a.mcap_usd!,
      mcap_per_tvl: round4(a.mcap_usd! / a.tvl_usd),
    }));
  }
  return out;
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    curve_usd: row.model.curve_usd,
    category_multiplier: row.model.category_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    rank_p10: row.rank_p10,
    rank_p90: row.rank_p90,
    farm: row.farm,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const anchors = anchorsOf(snapshot);
  const fit = fitSizeCurve(anchors, snapshot.as_of);
  const validation = validateModel(snapshot, anchors);
  const rankable = snapshot.protocols.filter((p) => isRankable(p));
  const { ranges, medianWidth } = bootstrapRankRanges(rankable, anchors, snapshot.as_of);
  validation.bootstrap_median_range_width = medianWidth;
  const board = buildBoard(snapshot, fit, ranges);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  const byReason: Record<string, number> = {};
  for (const e of excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  const coverage: Coverage = {
    total: snapshot.protocols.length,
    ranked: board.length,
    traded: live.length + snapshot.protocols.filter((p) => !isPreToken(p) && p.category === 'CEX').length,
    excluded: excluded.length,
    excluded_by_reason: byReason,
    watchlist: snapshot.watchlist.length,
    watchlist_ranked: board.filter((r) => r.watchlist).length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    validation,
    farm_assumptions: FARM,
    coverage,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    rows: board.map(radarRow),
    live,
    excluded,
    comps: compsFor(snapshot, anchors, rankable),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.rank_p10 < 1 || r.rank_p90 < r.rank_p10 || r.rank_p90 > board.length) return `${r.slug} has rank range ${r.rank_p10}-${r.rank_p90}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
