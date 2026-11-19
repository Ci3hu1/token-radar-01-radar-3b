// Tests for the radar-3 model. Run: node --test tests/model.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  anchorsOf,
  boardIssue,
  bootstrapRankRanges,
  buildBoard,
  buildRadar,
  farmPlan,
  fitSizeCurve,
  impliedValue,
  isRankable,
  parseSnapshot,
  validateModel,
} from '../lib/model.ts';

const snapshot = parseSnapshot(
  readFileSync(new URL('../../token-radar-01-radar-3b-kit/input/snapshot.json', import.meta.url), 'utf8'),
);

test('snapshot: 758 protocols, 40 on the watchlist', () => {
  assert.equal(snapshot.protocols.length, 758);
  assert.equal(snapshot.watchlist.length, 40);
  assert.equal(snapshot.as_of, '2026-11-14');
});

test('anchors: one per ticker, 128 traded tokens', () => {
  const anchors = anchorsOf(snapshot);
  assert.equal(anchors.length, 128);
  const symbols = new Set(anchors.map((a) => a.symbol));
  assert.equal(symbols.size, 128);
  for (const a of anchors) assert.ok(a.mcap_usd! > 0 && a.tvl_usd > 0);
});

test('fit: positive slope, R-squared in (0, 1), 14 category multipliers', () => {
  const fit = fitSizeCurve(anchorsOf(snapshot), snapshot.as_of);
  assert.ok(fit.slope > 0.4 && fit.slope < 0.7, `slope ${fit.slope}`);
  assert.ok(fit.r_squared > 0.1 && fit.r_squared < 0.5, `R2 ${fit.r_squared}`);
  assert.equal(fit.anchors, 128);
  assert.equal(Object.keys(fit.category_multipliers).length, 14);
});

test('board: 227 rows, watchlist covered, ranks 1..N, implied non-increasing', () => {
  const { board } = buildRadar(snapshot);
  assert.equal(board.length, 227);
  assert.equal(boardIssue(board, snapshot), null);
  const watch = new Set(snapshot.watchlist);
  assert.equal(board.filter((r) => r.watchlist).length, 40);
  for (const slug of watch) assert.ok(board.some((r) => r.slug === slug), slug);
  board.forEach((r, i) => assert.equal(r.rank, i + 1));
  for (let i = 1; i < board.length; i++) assert.ok(board[i]!.implied_value_usd <= board[i - 1]!.implied_value_usd);
});

test('farm plan: EV nets to airdrop minus gas minus capital cost', () => {
  const { board } = buildRadar(snapshot);
  for (const row of board) {
    const p = snapshot.protocols.find((q) => q.slug === row.slug)!;
    const plan = farmPlan(p, row.implied_value_usd, row.age_days);
    assert.equal(plan.expected_value_usd, Math.round((plan.expected_airdrop_usd - plan.gas_total_usd - plan.capital_cost_usd) * 100) / 100);
    assert.ok(['farm', 'thin', 'skip'].includes(plan.verdict));
    assert.equal(plan.steps.length, 6);
    assert.equal(row.farm.verdict, plan.verdict);
    assert.equal(row.farm_steps.length, 6);
  }
});

test('validation: holdout 38, walk-forward folds, LOO over 128', () => {
  const v = validateModel(snapshot, anchorsOf(snapshot));
  assert.equal(v.holdout.n_test, 38);
  assert.equal(v.holdout.n_train, 90);
  assert.equal(v.walk_forward.length, 2);
  assert.equal(v.walk_forward[0]!.n_train, 47);
  assert.equal(v.leave_one_out.n_test, 128);
  assert.ok(v.holdout.mape_median > 0 && v.holdout.mape_median < 5);
  assert.equal(v.bootstrap_refits, 200);
});

test('bootstrap: rank ranges valid, top rank holds 1-2', () => {
  const anchors = anchorsOf(snapshot);
  const rankable = snapshot.protocols.filter((p) => isRankable(p));
  const { ranges, medianWidth } = bootstrapRankRanges(rankable, anchors, snapshot.as_of);
  assert.equal(ranges.size, 227);
  assert.ok(medianWidth > 0 && medianWidth < 227);
  for (const [lo, hi] of ranges.values()) assert.ok(lo >= 1 && hi >= lo && hi <= 227);
  const fit = fitSizeCurve(anchors, snapshot.as_of);
  const top = rankable
    .map((p) => ({ slug: p.slug, implied: impliedValue(p, snapshot.as_of, fit).implied }))
    .sort((a, b) => b.implied - a.implied)[0]!;
  assert.deepEqual(ranges.get(top.slug), [1, 2]);
});

test('determinism: two full builds write identical JSON', () => {
  const a = buildRadar(snapshot);
  const b = buildRadar(snapshot);
  assert.equal(JSON.stringify(a.board), JSON.stringify(b.board));
  assert.equal(JSON.stringify(a.radar), JSON.stringify(b.radar));
});
