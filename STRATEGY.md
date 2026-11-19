# STRATEGY.md — token-radar-01 radar-3

## What this entry is

A token launch radar whose value model is **fitted from the snapshot
itself**, not multiplied by a hand-picked constant. The judge only ever
sees three screenshots plus the dashboard source (the dossier), so
everything below is visible on the dashboard: the methodology panel,
the detail drawer, and the board.

## Measured edge (all numbers computed from the sealed snapshot, 2026-11-14)

- **Size curve, fitted:** `log10(market cap) = 3.0247 + 0.5223 × log10(TVL)`,
  ordinary least squares on **128 anchors** — every token that already
  trades in this snapshot, one per ticker. **R² = 0.194** on the log
  scale; residual SD 0.91 log points. TVL explains only part of market
  cap. That is the honest read, and it is why the entry validates out
  of sample instead of claiming precision it does not have.
- **Category multipliers, fitted:** median log-residual per category,
  shrunk n/(n+3), for the 14 categories with ≥3 anchors. Range
  ×0.47 (Liquid Staking) to ×2.51 (Privacy). Categories
  with fewer anchors get ×1.00.
- **Validation, all out of sample:**
  - Blind holdout (fit 70% of anchors by slug order, test 30%, n=38):
    MAPE mean 633.1%, **median 97.0%**.
  - Walk-forward by listing date: fit earliest 50% → MAPE mean
    603.5%, median 91.5% (n=48); fit earliest 75% → MAPE mean
    314.0%, median 74.3% (n=24).
  - Leave-one-out (128 refits): MAPE mean 1131.4%, **median 86.3%**.
  - Bootstrap, 200 refits: every protocol carries a p10–p90 rank
    range in its detail view; median width 66 ranks. Rank #1
    (steakhouse-financial) holds rank 1–2 across refits.
- **Coverage:** 758 protocols accounted for — 227 ranked pre-token
  (all 40 watchlist slugs included), 416 traded on a separate tab,
  115 pre-token excluded by the house rule, with the reason counts
  shown. The study that motivated this rebuild said "198 pre-token";
  the snapshot's own rule counts 227 rankable — the data wins.
- **Farm plans, netted:** every ranked protocol gets capital tiered
  by TVL, gas at a stated per-chain midpoint over 8 transactions,
  capital cost at 5% APR, and an expected airdrop of 5% of implied
  value split across an estimated wallet count tiered by TVL.
  Verdict farm at EV ≥ $25, thin at $0–$25, skip below $0, with the
  break-even implied value shown.

## Rules the entry follows

- Same function scores every row; no protocol name is special-cased.
- A protocol that records no token is described as recording no
  token, never as having none.
- Live-token protocols are never ranked; they are the comps.
- Deterministic: fixed-seed bootstrap, no clock, no network, ties by
  slug. Two runs write identical bytes.
- Dashboard source stays under the 64 KiB dossier text cap; three
  screenshots at 1440×900, each under 512 KiB.

## Tried and dropped

- **Fitting growth and age into the regression** (log mcap on log
  TVL + 7d growth + log age): R² rose only 0.194 → 0.213, and the
  fitted growth coefficient came out negative (−1.65) — in this
  snapshot fast 7-day growth marks a small base catching up, not a
  premium — which would have cut high-growth protocols' implied
  values ~100×. Dropped: growth and maturity stay as stated,
  bounded adjustments (×0.70–1.60 and ×0.60–1.00), and the fit
  covers the size curve and category multipliers only.
- **Hand-picked constant multiple (TVL × 0.25, radar-2):** scored
  773.663 live (rank 12,478). The gap to the paid places is a
  proof gap, not a row-count gap: the old model was never fitted or
  tested. Replaced by the fitted curve above.
- **Ranking only the 40 watchlist rows:** the gate needs ≥100 rows
  and the watchlist is a floor, never a ceiling. All 227 rankable
  protocols are ranked.
- **Mean APE as the headline validation number:** a few tokens with
  tiny market caps blow the mean past 1000%. The median APE is the
  headline; the mean is still shown beside it.
- **A single global curve with no category term:** category
  residuals are systematic (bridges trade 1.4–2.3× the curve, liquid
  staking ~0.5×). The shrunk per-category multiplier keeps that
  signal without letting a 3-anchor category run away with the fit.
