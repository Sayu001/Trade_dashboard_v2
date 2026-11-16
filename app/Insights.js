'use client';
import { useMemo, useState } from 'react';
import { compute } from '../lib/stats';

const m = n => (n < 0 ? '-' : '+') + '$' + Math.abs(Math.round(n)).toLocaleString();
const cls = n => (n > 0 ? 'g' : n < 0 ? 'r' : '');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WEEK = WD.slice(1).concat('Sun');
const NS = 'Not set';

function group(tr, key, order) {
  const mp = {};
  tr.forEach(t => { const k = key(t); if (k == null) return; (mp[k] ??= { k, n: 0, w: 0, v: 0 }); mp[k].n++; mp[k].v += t.n; if (t.n > 0) mp[k].w++; });
  const a = Object.values(mp);
  return order ? a.sort((x, y) => (order.indexOf(x.k) + 1 || 99) - (order.indexOf(y.k) + 1 || 99)) : a.sort((x, y) => y.v - x.v);
}

function Rows({ title, items, hint }) {
  const mx = Math.max(1, ...items.map(i => Math.abs(i.v)));
  return <div className="card"><h4>{title}</h4>
    {items.map(i => <div key={i.k} className="ix-row"><span>{i.k}</span>
      <div className="ix-bar"><i style={{ width: Math.abs(i.v) / mx * 50 + '%', [i.v < 0 ? 'right' : 'left']: '50%', background: i.v < 0 ? 'var(--r)' : 'var(--g)', opacity: i.n < 8 ? 0.4 : 1 }} /></div>
      <span className="ix-num"><b className={cls(i.v)}>{m(i.v)}</b> · {Math.round(i.w / i.n * 100)}% · {i.n}</span></div>)}
    <div className="s mut" style={{ marginTop: 8, fontSize: 11 }}>{hint || 'Net P&L · win rate · trades. Faded bar = fewer than 8 trades.'}</div></div>;
}

export default function Insights({ rows, start }) {
  const [sym, setSym] = useState('All');
  const syms = useMemo(() => ['All', ...new Set(rows.filter(r => r.symbol && r.side !== 'Skip').map(r => r.symbol))], [rows]);
  const s = useMemo(() => compute(sym === 'All' ? rows : rows.filter(r => r.symbol === sym), start), [rows, sym, start]);
  const tr = s.tr, A = s.an;

  const dims = useMemo(() => {
    const perDay = {}; tr.forEach(t => perDay[t.date] = (perDay[t.date] || 0) + 1);
    const wkOf = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(5, 10); };
    const mins = t => (t.open && t.close ? (new Date(t.close) - new Date(t.open)) / 6e4 : null);
    const al = t => (t.bias === 'Neutral' ? 'Neutral bias' : (t.side === 'Buy' && t.bias === 'UP') || (t.side === 'Sell' && t.bias === 'DOWN') ? 'With bias' : t.bias ? 'Against bias' : NS);
    const weeks = [...new Set(tr.map(t => wkOf(t.date)))].sort();
    return [
      ['By session', group(tr, t => t.session || NS, ['Pre Asia', 'Asia', 'Pre London', 'London', 'New York', NS])],
      ['By weekday', group(tr, t => WD[new Date(t.date + 'T00:00:00Z').getUTCDay()], WEEK)],
      ['By symbol', group(tr, t => t.symbol || NS)],
      ['By direction', group(tr, t => t.side)],
      ['By entry hour (UTC)', group(tr, t => (t.open ? t.open.slice(11, 13) + ':00' : null), [...Array(24)].map((_, i) => String(i).padStart(2, '0') + ':00'))],
      ['By hold time', group(tr, t => { const x = mins(t); return x == null ? null : x < 2 ? 'Under 2 min' : x < 10 ? '2–10 min' : x < 30 ? '10–30 min' : '30+ min'; }, ['Under 2 min', '2–10 min', '10–30 min', '30+ min'])],
      ['Trade vs your bias', group(tr, al, ['With bias', 'Against bias', 'Neutral bias', NS])],
      ['Trades taken that day', group(tr, t => { const c = perDay[t.date]; return c <= 2 ? '1–2 trades' : c <= 5 ? '3–5 trades' : '6+ trades'; }, ['1–2 trades', '3–5 trades', '6+ trades']), 'Shows whether taking more trades in a day helps or hurts.'],
      ['By emotional control', group(tr, t => (t.emo ? t.emo + ' / 5' : NS), ['5 / 5', '4 / 5', '3 / 5', '2 / 5', '1 / 5', NS])],
      ['By overall rating', group(tr, t => (t.rating ? t.rating + ' / 5' : NS), ['5 / 5', '4 / 5', '3 / 5', '2 / 5', '1 / 5', NS])],
      ['By result tag', group(tr, t => t.result || NS, ['TP', 'SL', 'B/E', NS]), 'B/E is only a tag. Money is counted from the real result.'],
      ['By week (Monday date)', group(tr, t => wkOf(t.date), weeks)],
    ];
  }, [tr]);

  const notes = useMemo(() => {
    const out = [];
    dims.slice(0, 9).forEach(([title, items]) => {
      const g = items.filter(i => i.n >= 8 && i.k !== NS).sort((a, b) => b.v - a.v);
      if (g.length < 2) return;
      const b = g[0], w = g[g.length - 1];
      out.push(<><b>{title.replace('By ', '').replace('Trade vs your bias', 'bias')}:</b> best is {b.k} (<span className={cls(b.v)}>{m(b.v)}</span>, {Math.round(b.w / b.n * 100)}% wins over {b.n}); worst is {w.k} (<span className={cls(w.v)}>{m(w.v)}</span>, {Math.round(w.w / w.n * 100)}% wins over {w.n}).</>);
    });
    const losses = tr.filter(t => t.n < 0).sort((a, b) => a.n - b.n), tot = losses.reduce((x, t) => x + t.n, 0), top = losses.slice(0, 5).reduce((x, t) => x + t.n, 0);
    if (losses.length >= 8) out.push(<><b>Big losses:</b> your 5 largest losses add up to <span className="r">{m(top)}</span>, which is {Math.round(top / tot * 100)}% of every dollar you lost.</>);
    A.insights.forEach(([a, b]) => { if (!/Not enough/.test(a)) out.push(<><b>{a}</b> {b}</>); });
    return out;
  }, [dims, tr, A]);

  if (!tr.length) return <div className="card">No trades for this filter yet.</div>;
  return <>
    <div className="ix-top"><div className="mut" style={{ fontSize: 12 }}>{tr.length} trades · all figures are net of commission</div>
      <div className="ix-chips">{syms.map(x => <button key={x} className={sym === x ? 'on' : ''} onClick={() => setSym(x)}>{x}</button>)}</div></div>
    <div className="card ix-key"><h4>Key takeaways</h4>
      <ul className="ins">{notes.length ? notes.map((n, i) => <li key={i}>{n}</li>) : <li>Not enough trades yet to show clear patterns.</li>}</ul>
      <div className="s mut" style={{ fontSize: 11 }}>Small samples are hints to test, not rules.</div></div>
    <div className="row tl">{A.tiles.map(([l, v, sub, c]) => <div key={l} className="card"><h4>{l}</h4><div className={'big sm ' + c}>{v}</div><span className="s mut">{sub}</span></div>)}</div>
    <div className="ix-grid">{dims.map(([t, items, hint]) => <Rows key={t} title={t} items={items} hint={hint} />)}</div>
  </>;
}
