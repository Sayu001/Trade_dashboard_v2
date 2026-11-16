const sum = a => a.reduce((s, x) => s + x, 0), avg = a => (a.length ? sum(a) / a.length : 0);
export const isTrade = t => t.side && t.side !== 'Skip' && t.result && t.result !== 'No trade';
// "Result in USD" is gross and already signed (minus = loss); balance = prev + gross - commission.
const signed = t => t.usd || 0;
export const net = t => signed(t) - (t.comm || 0);
const isXau = t => !t.symbol || t.symbol === 'XAUUSD'; // lots x 100 is the gold contract size only
const riskOf = t => (isXau(t) && t.lots > 0 && t.entry > 0 && t.sl > 0 ? t.lots * 100 * Math.abs(t.entry - t.sl) : 0);
const money = n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m0 = n => '$' + Math.round(Math.abs(n)).toLocaleString();
const dmy = d => d.slice(8) + '/' + d.slice(5, 7);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WF = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const grp = (tr, key, order) => {
  const m = {}; tr.forEach(t => { const k = key(t); (m[k] ??= { v: 0, n: 0, w: 0 }); m[k].v += t.n; m[k].n++; if (t.n > 0) m[k].w++; });
  return [...order.filter(k => m[k]), ...Object.keys(m).filter(k => !order.includes(k))].map(k => ({ l: `${k} (${m[k].n})`, key: k, ...m[k] }));
};
function analyse(tr, pnl, gp, comm, rows, start) {
  const N = tr.length, rs = tr.map(t => ({ t, risk: riskOf(t) })).filter(x => x.risk > 0).map(x => ({ ...x, R: signed(x.t) / x.risk }));
  const pl = tr.filter(t => t.entry > 0 && t.sl > 0 && t.tp > 0 && t.entry !== t.sl).map(t => Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.sl));
  const best = tr.reduce((a, t) => (!a || t.n > a.n ? t : a), null), worst = tr.reduce((a, t) => (!a || t.n < a.n ? t : a), null);
  let mx = 0, run = 0, st = 0, stT = 0;
  tr.forEach(t => { const s = t.n < 0 ? -1 : 1; if (s === stT) st++; else { st = 1; stT = s; } if (t.n < 0) { run++; mx = Math.max(mx, run); } else run = 0; });
  const risks = rs.map(x => x.risk), stops = tr.filter(t => isXau(t) && t.entry > 0 && t.sl > 0).map(t => Math.abs(t.entry - t.sl));
  const skip = rows.filter(t => t.side === 'Skip').length, jd = new Set(rows.map(t => t.date)).size, R = rs.map(x => x.R);
  const tiles = !N ? [] : [
    ['Expectancy / trade', money(pnl / N), 'after commission', pnl < 0 ? 'r' : 'g'],
    ['Avg realized R', R.length ? (avg(R) > 0 ? '+' : '') + avg(R).toFixed(2) + 'R' : '–', `${R.length} trades with full data`, avg(R) < 0 ? 'r' : 'g'],
    ['Avg planned RR', pl.length ? avg(pl).toFixed(2) : '–', 'entry→TP ÷ entry→SL', ''],
    ['Largest win', money(best.n), dmy(best.date), 'g'], ['Largest loss', money(worst.n), dmy(worst.date), 'r'],
    ['Max losing streak', String(mx), `now: ${st} ${stT < 0 ? 'losses' : 'wins'} in a row`, ''],
    ['Avg risk / trade', risks.length ? m0(avg(risks)) : '–', risks.length ? `${(avg(risks) / start * 100).toFixed(2)}% of initial equity` : '', ''],
    ['Avg stop distance', stops.length ? avg(stops).toFixed(2) + ' pts' : '–', `${stops.length} trades`, ''],
    ['Commission drag', gp ? (comm / gp * 100).toFixed(1) + '%' : '–', `of gross profit · ${m0(comm)}`, ''],
    ['No-trade days', String(skip), jd ? `${Math.round(skip / jd * 100)}% of journal days` : '', ''],
  ];
  const al = t => (t.bias === 'Neutral' ? 'Neutral' : (t.side === 'Buy' && t.bias === 'UP') || (t.side === 'Sell' && t.bias === 'DOWN') ? 'With bias' : t.bias ? 'Against' : 'Not set');
  const g = {
    session: grp(tr, t => t.session || 'Not set', ['Pre Asia', 'Asia', 'Pre London', 'London', 'New York', 'Not set']),
    day: grp(tr, t => WD[new Date(t.date + 'T00:00:00Z').getUTCDay()], WD.slice(1).concat('Sun')),
    bias: grp(tr, t => t.bias || 'Not set', ['UP', 'DOWN', 'Neutral', 'Not set']),
    align: grp(tr, al, ['With bias', 'Against', 'Neutral', 'Not set']),
    emo: grp(tr, t => (t.emo == null ? 'Not set' : t.emo + '/5'), ['5/5', '4/5', '3/5', '2/5', '1/5', 'Not set']),
    rating: grp(tr, t => (t.rating == null ? 'Not set' : t.rating >= 4 ? '4–5' : t.rating === 3 ? '3' : '1–2'), ['4–5', '3', '1–2', 'Not set']),
    size: grp(tr, t => (t.lots == null ? 'Not set' : t.lots >= 1 ? '1+ lot' : 'Under 1 lot'), ['Under 1 lot', '1+ lot', 'Not set']),
  };
  const groups = [['By session', g.session], ['By weekday', g.day], ['By bias', g.bias], ['Bias alignment', g.align], ['By emotional control', g.emo], ['By overall rating', g.rating], ['By position size', g.size]].map(([t, items]) => ({ t, items }));
  const ins = [];
  if (pl.length >= 3 && avg(pl) >= 2) { const tp = rs.filter(x => x.t.result === 'TP').length; if (tp / rs.length < 0.5) ins.push(['Targets look far.', `Planned RR averages ${avg(pl).toFixed(1)}, but only ${tp} of ${rs.length} trades reached TP (average realized ${avg(R).toFixed(2)}R).`]); }
  const ne = g.align.find(x => x.key === 'Neutral'), wb = g.align.find(x => x.key === 'With bias');
  if (ne && ne.n >= 3 && ne.w / ne.n < 0.35) ins.push([`Neutral bias is ${ne.w} for ${ne.n}`, `(${money(ne.v)}).${wb ? ` Trades with your bias on your side: ${money(wb.v)} over ${wb.n}.` : ''}`]);
  const wd = g.day.filter(x => x.n >= 3 && x.v < 0).sort((a, b) => a.v - b.v)[0]; if (wd) ins.push([`${WF[wd.key]}: ${wd.w} wins from ${wd.n} trades`, `(${money(wd.v)}).`]);
  const pos = g.emo.filter(x => x.key !== 'Not set' && x.v > 0); if (g.emo.length > 2 && pos.length === 1) ins.push([`Emotional control ${pos[0].key} is your only positive setting`, `(${money(pos[0].v)}).`]);
  if (risks.length >= 4) { const h = Math.floor(risks.length / 2), a = avg(risks.slice(0, h)), b = avg(risks.slice(h)); if (b >= 2 * a || b <= a / 2) ins.push(['Position size changed.', `Average risk per trade went from about ${m0(a)} to about ${m0(b)}.`]); }
  if (!ins.length) ins.push(['Not enough trades yet', 'to show clear patterns.']);
  return { tiles, groups, insights: ins, rr: rs.map(x => ({ l: dmy(x.t.date), v: x.R })) };
}
export function compute(rows, start = 100000) {
  const tr = rows.filter(isTrade).map(t => ({ ...t, n: net(t) }));
  const W = tr.filter(t => t.n > 0), L = tr.filter(t => t.n < 0);
  const gp = sum(W.map(t => t.n)), gl = -sum(L.map(t => t.n));
  const dm = {}; tr.forEach(t => { (dm[t.date] ??= { n: 0, c: 0 }).n += t.n; dm[t.date].c++; });
  const daily = Object.entries(dm).sort().map(([d, x]) => ({ d, ...x }));
  let eq = start, pk = start, mdd = 0; const cum = [];
  daily.forEach(x => { eq += x.n; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq - pk); cum.push(eq - start); });
  const pf = gl ? gp / gl : gp ? 99 : 0, awl = W.length && L.length ? (gp / W.length) / (gl / L.length) : 0;
  const pnl = sum(tr.map(t => t.n)), winRate = tr.length ? W.length / tr.length : 0, comm = sum(tr.map(t => t.comm || 0));
  const dayWin = daily.length ? daily.filter(x => x.n > 0).length / daily.length : 0;
  const good = tr.length ? tr.filter(t => (t.rating || 0) >= 3).length / tr.length : 0, rec = mdd ? pnl / -mdd : 0;
  const radar = [['Win %', winRate * 100], ['Profit factor', Math.min(pf / 2, 1) * 100], ['Avg win/loss', Math.min(awl / 2, 1) * 100], ['Consistency', good * 100],
    ['Max drawdown', Math.max(0, 100 + mdd / start * 1000)], ['Recovery', Math.max(0, Math.min(rec / 3, 1)) * 100]].map(([l, v]) => ({ l, v }));
  const bal = [...rows].reverse().find(t => t.balance > 1000);
  return { tr, dm, daily, cum, radar, score: sum(radar.map(r => r.v)) / 6, start, cur: start + pnl, curDate: tr.length ? dmy(tr[tr.length - 1].date) : '',
    flags: [], an: analyse(tr, pnl, gp, comm, rows, start),
    k: { n: tr.length, pnl, winRate, pf, awl, dayWin, W: W.length, L: L.length, avgW: W.length ? gp / W.length : 0, avgL: L.length ? gl / L.length : 0, mdd, comm, skipped: rows.filter(t => t.side === 'Skip').length } };
}
