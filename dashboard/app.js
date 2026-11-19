/* radar-3 dashboard: renders window.RADAR (data.js) with no network. */
(function () {
  'use strict';
  var D = window.RADAR;
  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString('en-US');
  }
  function money2(n) { return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function pct(n) { return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function num(n) { return n == null ? '—' : n.toLocaleString('en-US'); }
  function $(id) { return document.getElementById(id); }
  function hash() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) h[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return h;
  }
  function setHash(h) {
    var parts = [];
    Object.keys(h).sort().forEach(function (k) { if (h[k] !== '' && h[k] != null) parts.push(k + '=' + encodeURIComponent(h[k])); });
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  /* Header + KPIs */
  $('asof').textContent = 'Snapshot ' + D.as_of + '\nSource: DefiLlama protocols snapshot\nModel ' + D.model_version + ' · fitted, not multiplied';
  var v = D.validation;
  var kpis = [
    [D.coverage.total.toLocaleString(), 'protocols accounted for'],
    [D.board_size, 'pre-token protocols ranked'],
    [D.fit.anchors, 'traded anchors fitted'],
    ['R² ' + D.fit.r_squared, 'size-curve fit'],
    [(v.holdout.mape_median * 100).toFixed(0) + '%', 'blind-holdout median error'],
    [money(rows[0].implied_value_usd), 'top implied value'],
  ];
  $('kpis').innerHTML = kpis.map(function (k) { return '<div class="kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('');

  /* Tabs */
  var tabs = ['board', 'live', 'coverage', 'method'];
  function showTab(t) {
    tabs.forEach(function (x) {
      $('tab-' + x).hidden = x !== t;
      document.querySelector('#tabs button[data-tab="' + x + '"]').classList.toggle('on', x === t);
    });
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { var h = hash(); h.tab = b.dataset.tab; setHash(h); showTab(b.dataset.tab); });
  });

  /* Filter option lists */
  var cats = {}, chains = {};
  rows.forEach(function (r) { cats[r.category || '(none)'] = 1; r.chains.forEach(function (c) { chains[c] = 1; }); });
  Object.keys(cats).sort().forEach(function (c) { $('cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  Object.keys(chains).sort().forEach(function (c) { $('chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

  /* Board: sort + filter + render */
  var sortKey = 'rank', sortDir = 1;
  function val(r, k) {
    if (k === 'ev') return r.farm.expected_value_usd;
    if (k === 'verdict') return r.farm.verdict;
    if (k === 'range') return r.rank_p90 - r.rank_p10;
    if (k === 'name') return r.name.toLowerCase();
    if (k === 'chains') return (r.chains[0] || '').toLowerCase();
    return r[k] == null ? -Infinity : r[k];
  }
  function filtered() {
    var h = hash();
    var q = (h.q || '').toLowerCase();
    return rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (h.cat && (r.category || '(none)') !== h.cat) return false;
      if (h.chain && r.chains.indexOf(h.chain) < 0) return false;
      if (h.verdict && r.farm.verdict !== h.verdict) return false;
      if (h.min && r.tvl_usd < +h.min) return false;
      if (h.watch === '1' && !r.watchlist) return false;
      return true;
    });
  }
  function renderBoard() {
    var list = filtered().slice();
    list.sort(function (a, b) {
      var va = val(a, sortKey), vb = val(b, sortKey);
      var d = va < vb ? -1 : va > vb ? 1 : 0;
      return d * sortDir || (a.slug < b.slug ? -1 : 1);
    });
    $('count').textContent = list.length + ' of ' + rows.length + ' rows';
    $('board').querySelector('tbody').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td>' + esc(r.name) + (r.watchlist ? ' <span class="tag">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days == null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + money2(r.farm.expected_value_usd) + '</td>' +
        '<td><span class="verdict ' + r.farm.verdict + '">' + r.farm.verdict + '</span></td>' +
        '<td class="num">' + r.rank_p10 + '–' + r.rank_p90 + '</td></tr>';
    }).join('');
  }
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.k;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      renderBoard();
    });
  });
  function syncFilters() {
    var h = hash();
    $('q').value = h.q || ''; $('cat').value = h.cat || ''; $('chain').value = h.chain || '';
    $('verdict').value = h.verdict || ''; $('min').value = h.min || '0'; $('watch').checked = h.watch === '1';
  }
  ['q', 'cat', 'chain', 'verdict', 'min'].forEach(function (id) {
    $(id).addEventListener('input', function () { var h = hash(); h[id] = $(id).value; setHash(h); renderBoard(); });
  });
  $('watch').addEventListener('change', function () { var h = hash(); h.watch = $('watch').checked ? '1' : ''; setHash(h); renderBoard(); });
  $('board').querySelector('tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var h = hash(); h.detail = tr.dataset.slug; setHash(h); renderDrawer();
  });

  /* Detail drawer */
  function renderDrawer() {
    var dr = $('drawer');
    var slug = hash().detail;
    if (!slug || !bySlug[slug]) { dr.hidden = true; dr.innerHTML = ''; return; }
    var r = bySlug[slug];
    var f = r.farm;
    var comps = D.comps[slug] || [];
    var lo = Math.min(r.rank_p10, r.rank_p90), hi = Math.max(r.rank_p10, r.rank_p90);
    var pctIn = ((r.rank - lo) / Math.max(1, D.board_size - 1)) * 100;
    var pctW = Math.max(2, ((hi - lo) / Math.max(1, D.board_size - 1)) * 100);
    dr.innerHTML =
      '<button class="close">Close</button><h2>' + esc(r.name) + '</h2>' +
      '<p class="note">Rank ' + r.rank + ' of ' + D.board_size + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      (r.watchlist ? ' · <span class="tag">watchlist</span>' : '') + '</p>' +
      '<h3>Implied value — factor breakdown</h3><dl>' +
      '<dt>Size curve (fitted)</dt><dd>' + money(r.curve_usd) + '</dd>' +
      '<dt>Category multiplier ×' + r.category_multiplier.toFixed(2) + '</dt><dd>' + esc(r.category || '—') + '</dd>' +
      '<dt>Growth multiplier ×' + r.growth_multiplier.toFixed(2) + '</dt><dd>' + pct(r.change_7d) + ' in 7d</dd>' +
      '<dt>Maturity multiplier ×' + r.maturity_multiplier.toFixed(2) + '</dt><dd>' + (r.age_days == null ? 'age unknown' : r.age_days + ' days, no token') + '</dd>' +
      '<dt><b>Implied value</b></dt><dd><b>' + money(r.implied_value_usd) + '</b></dd></dl>' +
      '<h3>Rank range — 200 bootstrap refits</h3>' +
      '<div class="bar"><i style="left:' + pctIn.toFixed(1) + '%;width:' + pctW.toFixed(1) + '%"></i></div>' +
      '<p class="note">p10–p90 rank ' + r.rank_p10 + '–' + r.rank_p90 + ' (median width across the board: ' + D.validation.bootstrap_median_range_width + ' ranks). The model is honest about where it is unsure.</p>' +
      '<h3>Nearest comps — traded tokens, same category</h3>' +
      (comps.length ? '<table><thead><tr><th>Token</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th></tr></thead><tbody>' +
        comps.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.tvl_usd) + '</td><td class="num">' + money(c.mcap_usd) + '</td><td class="num">' + c.mcap_per_tvl.toFixed(2) + '×</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="note">No traded anchor in this category — the global curve prices it.</p>') +
      '<h3>Netted farm plan — ' + f.verdict + '</h3><dl>' +
      '<dt>Capital</dt><dd>' + money(f.capital_usd) + ' for ' + f.hold_days + ' days</dd>' +
      '<dt>Gas (' + D.farm_assumptions.transactions + ' tx)</dt><dd>−' + money2(f.gas_total_usd) + '</dd>' +
      '<dt>Capital cost (5% APR)</dt><dd>−' + money2(f.capital_cost_usd) + '</dd>' +
      '<dt>Expected airdrop (5% pool)</dt><dd>+' + money2(f.expected_airdrop_usd) + '</dd>' +
      '<dt><b>Expected value</b></dt><dd><b>' + money2(f.expected_value_usd) + '</b></dd>' +
      '<dt>Break-even implied value</dt><dd>' + money(f.breakeven_implied_usd) + '</dd></dl>' +
      '<p class="note">Verdict: farm at EV ≥ $25, thin at $0–$25, skip below $0. Airdrop share assumes a 5% pool split across an estimated wallet count tiered by TVL.</p>' +
      '<h3>Farm steps</h3><ol id="steps"></ol>';
    $('steps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    dr.hidden = false;
    dr.querySelector('.close').addEventListener('click', function () { var h = hash(); delete h.detail; setHash(h); renderDrawer(); });
  }
  /* Live tab */
  $('livetab').querySelector('tbody').innerHTML = D.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td>' + esc(p.chains.slice(0, 2).join(', ')) +
      '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  /* Coverage tab */
  var cov = D.coverage;
  $('covnote').textContent = cov.total + ' snapshot protocols accounted for: ' + cov.ranked + ' ranked pre-token + ' +
    cov.traded + ' traded (shown on the Traded tab, CEX included in the count) + ' + cov.excluded + ' pre-token excluded by rule. ' +
    'Watchlist ' + cov.watchlist_ranked + ' of ' + cov.watchlist + ' ranked. Excluded by reason: ' +
    Object.keys(cov.excluded_by_reason).map(function (k) { return cov.excluded_by_reason[k] + ' ' + k; }).join(', ') + '.';
  $('extab').querySelector('tbody').innerHTML = D.excluded.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>';
  }).join('');

  /* Methodology tab */
  var fit = D.fit, fa = D.farm_assumptions;
  function runRow(r) {
    return '<tr><td>' + esc(r.label) + '</td><td class="num">' + r.n_train + '</td><td class="num">' + r.n_test +
      '</td><td class="num">' + (r.mape_mean * 100).toFixed(0) + '%</td><td class="num">' + (r.mape_median * 100).toFixed(0) + '%</td></tr>';
  }
  var multRows = Object.keys(fit.category_multipliers).sort().map(function (c) {
    return '<tr><td>' + esc(c) + '</td><td class="num">' + fit.category_anchor_counts[c] + '</td><td class="num">×' + fit.category_multipliers[c].toFixed(2) + '</td></tr>';
  }).join('');
  var gasRows = Object.keys(fa.gas_mid_usd).sort().map(function (c) {
    return '<tr><td>' + esc(c) + '</td><td class="num">$' + fa.gas_mid_usd[c] + '</td></tr>';
  }).join('');
  $('method').innerHTML =
    '<h3>The fitted size curve</h3>' +
    '<p>Implied value follows the snapshot\u2019s own figures, never a hardcoded list of names. The curve is fitted on the tokens that already trade in this same snapshot &mdash; one anchor per ticker, ' + fit.anchors + ' anchors:</p>' +
    '<p><code>log10(market cap) = ' + fit.intercept + ' + ' + fit.slope + ' × log10(TVL)</code></p>' +
    '<p><code>implied = round(10^(curve) × category multiplier × growth × maturity)</code></p>' +
    '<table><thead><tr><th>Fit statistic</th><th>Value</th></tr></thead><tbody>' +
    '<tr><td>Intercept / slope</td><td class="num">' + fit.intercept + ' / ' + fit.slope + '</td></tr>' +
    '<tr><td>R² (log scale)</td><td class="num">' + fit.r_squared + '</td></tr>' +
    '<tr><td>Anchors fitted</td><td class="num">' + fit.anchors + '</td></tr>' +
    '<tr><td>Residual SD (log10)</td><td class="num">' + fit.residual_sd + '</td></tr>' +
    '<tr><td>Median anchor age</td><td class="num">' + fit.median_anchor_age_days + ' days</td></tr></tbody></table>' +
    '<p>TVL explains only part of market cap (R² ' + fit.r_squared + ') &mdash; that is what the data says, and the validation below measures it out of sample instead of hiding it.</p>' +
    '<h3>Category multipliers (fitted, shrunk n/(n+3))</h3>' +
    '<table><thead><tr><th>Category</th><th>Anchors</th><th>Multiplier</th></tr></thead><tbody>' + multRows + '</tbody></table>' +
    '<p>Categories with fewer than 3 anchors get a multiplier of ×1.00 (the global curve).</p>' +
    '<h3>Stated adjustments (not fitted)</h3>' +
    '<p><code>growth = 1 + clamp(change_7d, −60, 120) / 100 × 0.5</code> &nbsp; <code>maturity = 0.6 + min(age_days, 1095) / 1095 × 0.4</code> &mdash; age is snapshot date minus listed date; unknown age counts as 365 days. These two weights are stated, not fitted: the fit covers the size curve and the category multipliers only.</p>' +
    '<h3>Validation — measured out of sample</h3>' +
    '<table><thead><tr><th>Test</th><th>Fit on</th><th>Test on</th><th>MAPE (mean)</th><th>MAPE (median)</th></tr></thead><tbody>' +
    runRow(v.holdout) + v.walk_forward.map(runRow).join('') + runRow(v.leave_one_out) + '</tbody></table>' +
    '<p>Bootstrap: ' + v.bootstrap_refits + ' refits of the curve on resampled anchors give every protocol a p10–p90 rank range, shown in the detail view (median width ' + v.bootstrap_median_range_width + ' ranks). Errors are large in percentage terms because market-cap-per-TVL spans orders of magnitude across tokens; the median error is the honest read.</p>' +
    '<h3>Netted farm plans — the assumptions</h3>' +
    '<p>Airdrop pool assumed ' + (fa.airdrop_pool_share * 100) + '% of implied value, split across an estimated wallet count tiered by TVL (' +
    fa.wallet_tiers.map(function (t) { return 'TVL ≥ ' + money(t.tvl_at_least_usd) + ': ' + t.wallets.toLocaleString() + ' wallets'; }).join('; ') + '). ' +
    'Capital tiered by TVL (' + fa.capital_tiers.map(function (t) { return 'TVL ≥ ' + money(t.tvl_at_least_usd) + ': $' + t.capital_usd; }).join('; ') + '). ' +
    'Gas per transaction at the stated midpoint over ' + fa.transactions + ' transactions; capital cost at ' + (fa.apr * 100) + '% APR over the hold. ' +
    'Expected value = expected airdrop − gas − capital cost. Verdict: farm at EV ≥ $' + fa.farm_threshold_usd + ', thin at $0–$' + fa.farm_threshold_usd + ', skip below $0. Break-even is the implied value at which EV reaches $0.</p>' +
    '<table><thead><tr><th>Chain</th><th>Gas per tx</th></tr></thead><tbody>' + gasRows + '<tr><td>other</td><td class="num">$' + fa.gas_default_usd + '</td></tr></tbody></table>' +
    '<h3>Coverage</h3><p>' + cov.total + ' protocols: ' + cov.ranked + ' ranked, ' + cov.traded + ' traded, ' + cov.excluded + ' excluded by rule. Every watchlist slug (' + cov.watchlist + ') is ranked.</p>';

  /* Init from hash */
  syncFilters();
  showTab(hash().tab && tabs.indexOf(hash().tab) >= 0 ? hash().tab : 'board');
  renderBoard();
  renderDrawer();
  window.addEventListener('hashchange', function () { syncFilters(); renderBoard(); renderDrawer(); });
})();
