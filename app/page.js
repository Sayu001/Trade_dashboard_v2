'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { compute, isTrade, net } from '../lib/stats';
import Insights from './Insights';

const $ = n => (n < 0 ? '-' : '') + '$' + Math.abs(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const cls = n => (n > 0 ? 'g' : n < 0 ? 'r' : '');
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TXT = [['why', 'Why did I take the trade'], ['biasReason', 'Bias reason'], ['candle', 'Entry candle'], ['right', 'What I did right'],
  ['wrong', 'What I did wrong'], ['wrongThings', 'What things went wrong'], ['improve', 'Improvement']];

function Line({ data, color = '#22d3a0', h = 170 }) {
  if (!data.length) return <div className="mut">No data</div>;
  const w = 600, min = Math.min(0, ...data), max = Math.max(0, ...data) || 1;
  const sx = i => (data.length > 1 ? (i / (data.length - 1)) * w : w / 2), sy = v => h - 8 - ((v - min) / (max - min || 1)) * (h - 16);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(v)}`).join('');
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%"><line x1="0" x2={w} y1={sy(0)} y2={sy(0)} stroke="#2a3045" strokeDasharray="4" />
    <path d={`${d}L${sx(data.length - 1)},${sy(0)}L${sx(0)},${sy(0)}Z`} fill={color} opacity=".15" /><path d={d} pathLength="1" className="draw" fill="none" stroke={color} strokeWidth="2.5" /></svg>;
}
function Bars({ items, h = 150, w = 600, fmt = v => $(v) }) {
  if (!items.length) return <div className="mut">No data</div>;
  const m = Math.max(...items.map(i => Math.abs(i.v)), 1), bw = Math.min(46, w / items.length - 14), z = (h - 26) / 2 + 10;
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%"><line x1="0" x2={w} y1={z} y2={z} stroke="#2a3045" />
    {items.map((it, i) => { const x = (i + 0.5) * (w / items.length), bh = (Math.abs(it.v) / m) * (z - 18), up = it.v >= 0;
      return <g key={i}><rect className={up ? 'bar up' : 'bar dn'} style={{ animationDelay: i * 60 + 'ms' }} x={x - bw / 2} y={up ? z - bh : z} width={bw} height={Math.max(bh, 1)} rx="3" fill={up ? '#22d3a0' : '#ff5c6c'} />
        <text x={x} y={up ? z - bh - 4 : z + bh + 11} fontSize="10" textAnchor="middle">{fmt(it.v)}</text><text x={x} y={h - 3} fontSize="10" textAnchor="middle">{it.l}</text></g>; })}</svg>;
}
function Radar({ data }) {
  const c = 110, R = 80, pt = (i, v) => { const a = (Math.PI * 2 * i) / data.length - Math.PI / 2; return [c + Math.cos(a) * R * v / 100, c + Math.sin(a) * R * v / 100]; };
  const poly = data.map((d, i) => pt(i, d.v).join(',')).join(' ');
  return <svg viewBox="0 0 220 220" width="100%" style={{ maxHeight: 220 }}>
    {[25, 50, 75, 100].map(l => <polygon key={l} points={data.map((_, i) => pt(i, l).join(',')).join(' ')} fill="none" stroke="#2a3045" />)}
    <polygon points={poly} fill="#7c6cff" opacity=".3" stroke="#7c6cff" strokeWidth="2" />
    {data.map((d, i) => { const [x, y] = pt(i, 122); return <text key={i} x={x} y={y} fontSize="8.5" textAnchor="middle" fill="#8b92ab">{d.l}</text>; })}</svg>;
}
function Num({ v, f }) {
  const [x, setX] = useState(0);
  useEffect(() => { let r, t0; const run = t => { t0 ??= t; const p = Math.min((t - t0) / 900, 1); setX(v * (1 - Math.pow(1 - p, 3))); if (p < 1) r = requestAnimationFrame(run); }; r = requestAnimationFrame(run); return () => cancelAnimationFrame(r); }, [v]);
  return <>{f(x)}</>;
}
const shots = r => [['before', 'Before'], ['after', 'After'], ['pic', '15m']].flatMap(([k, l]) => (r[k] || []).map(u => ({ u, l })));
function Lightbox({ lb, setLb }) {
  const { list, i } = lb, s = list[i], go = d => setLb({ list, i: (i + d + list.length) % list.length });
  useEffect(() => { const k = e => { if (e.key === 'Escape') setLb(null); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  return <div className="lb" onClick={e => { e.stopPropagation(); setLb(null); }}>
    <img src={s.u} alt={s.l} onClick={e => e.stopPropagation()} />
    <div className="lbbar" onClick={e => e.stopPropagation()}><button className="btn alt" onClick={() => go(-1)}>‹</button><span>{s.l} · {i + 1}/{list.length}</span><button className="btn alt" onClick={() => go(1)}>›</button>
      <a className="btn" href={s.u} target="_blank" rel="noreferrer">Open in new tab ↗</a><button className="btn alt" onClick={() => setLb(null)}>✕</button></div></div>;
}
const Card = ({ t, children, cls: c = '' }) => <div className={'card ' + c}><h4>{t}</h4>{children}</div>;

function DayModal({ date, rows, onClose, reload }) {
  const day = rows.filter(r => r.date === date), tr = day.filter(isTrade).map(t => ({ ...t, n: net(t) }));
  const [ed, setEd] = useState({}), [busy, setBusy] = useState(''), [lb, setLb] = useState(null);
  const total = tr.reduce((s, t) => s + t.n, 0), cum = tr.reduce((a, t) => [...a, (a.at(-1) || 0) + t.n], []);
  const save = async r => { setBusy(r.id); const body = { id: r.id }; TXT.forEach(([k]) => { if (ed[r.id + k] !== undefined) body[k] = ed[r.id + k]; });
    await fetch('/api/trades', { method: 'PATCH', body: JSON.stringify(body) }); setBusy(''); reload(); };
  return <div className="modal" onClick={onClose}><div className="mbox" onClick={e => e.stopPropagation()}>
    <div className="top"><h2 style={{ margin: 0 }}>{date} <span className={cls(total)}>{$(total)}</span></h2><button className="btn alt" onClick={onClose}>Close</button></div>
    <div className="row g2"><Card t="Day equity"><Line data={cum} /></Card>
      <Card t="Stats"><table><tbody><tr><td>Trades</td><td>{tr.length}</td></tr><tr><td>Winners / Losers</td><td>{tr.filter(t => t.n > 0).length} / {tr.filter(t => t.n < 0).length}</td></tr>
        <tr><td>Commission</td><td>{$(tr.reduce((s, t) => s + (t.comm || 0), 0))}</td></tr><tr><td>Volume (lots)</td><td>{tr.reduce((s, t) => s + (t.lots || 0), 0).toFixed(2)}</td></tr></tbody></table></Card></div>
    {day.map(r => <div key={r.id} className="card" style={{ background: 'var(--card2)', marginBottom: 12 }}>
      <table><thead><tr><th>Session</th><th>Side</th><th>Result</th><th>Bias</th><th>Entry</th><th>SL</th><th>TP</th><th>Lots</th><th>Symbol</th><th>RR</th><th>Net</th><th>Emo</th><th>Rating</th></tr></thead>
        <tbody><tr><td>{r.session || '-'}</td><td>{r.side}</td><td>{r.result || '-'}</td><td>{r.bias || '-'}</td><td>{r.entry || '-'}</td><td>{r.sl || '-'}</td><td>{r.tp || '-'}</td><td>{r.lots ?? '-'}</td>
          <td>{r.symbol || '-'}</td><td>{r.rr || '-'}</td><td className={cls(net(r))}>{isTrade(r) ? $(net(r)) : '-'}</td><td>{r.emo ?? '-'}/5</td><td>{r.rating ?? '-'}/5</td></tr></tbody></table>
      <div className="imgs" style={{ margin: '10px 0' }}>{shots(r).map((x, i, arr) => <figure key={i} style={{ margin: 0 }}><img src={x.u} alt={x.l} title="Click to enlarge" onClick={() => setLb({ list: arr, i })} /><figcaption className="mut">{x.l}</figcaption></figure>)}</div>
      <div className="form">{TXT.map(([k, l]) => <div key={k} className={k === 'why' || k === 'improve' ? 'full' : ''} style={k === 'why' || k === 'improve' ? {} : { gridColumn: 'span 2' }}>
        <label>{l}</label><textarea rows="2" defaultValue={r[k] || ''} onChange={e => setEd({ ...ed, [r.id + k]: e.target.value })} /></div>)}</div>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => save(r)}>{busy === r.id ? 'Saving…' : 'Save notes to Notion'}</button></div>)}
    {lb && <Lightbox lb={lb} setLb={setLb} />}
  </div></div>;
}

function In({ f, set, k, l, type = 'text', ...p }) {
  return <div><label>{l}</label><input type={type} value={f[k] ?? ''} onChange={set(k)} onWheel={type === 'number' ? e => e.target.blur() : undefined} {...p} /></div>;
}
function Se({ f, set, k, l, o }) {
  return <div><label>{l}</label><select value={f[k] ?? ''} onChange={set(k)}><option value="">—</option>{o.map(x => <option key={x}>{x}</option>)}</select></div>;
}

function AddModal({ onClose, reload, last }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), side: 'Buy', result: 'TP', session: 'Asia', bias: 'Neutral', symbol: 'XAUUSD' }), [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async () => { const b = { ...f }; ['entry', 'exit', 'sl', 'tp', 'lots', 'usd', 'comm', 'emo', 'rating'].forEach(k => { if (b[k] === '' || b[k] === undefined) delete b[k]; else b[k] = +b[k]; });
    const r = await fetch('/api/trades', { method: 'POST', body: JSON.stringify(b) }); const j = await r.json(); if (j.error) return setErr(j.error); reload(); onClose(); };
  return <div className="modal" onClick={onClose}><div className="mbox" onClick={e => e.stopPropagation()}><h2 style={{ marginTop: 0 }}>Add trade → Notion</h2>
    <div className="form"><In f={f} set={set} k="date" l="Date" type="date" /><Se f={f} set={set} k="side" l="Trade" o={['Buy', 'Sell', 'Skip']} /><Se f={f} set={set} k="result" l="Result" o={['TP', 'SL', 'B/E', 'No trade']} /><Se f={f} set={set} k="session" l="Session" o={['Pre Asia', 'Asia', 'Pre London', 'London', 'New York']} />
      <Se f={f} set={set} k="bias" l="Bias" o={['UP', 'DOWN', 'Neutral']} /><In f={f} set={set} k="entry" l="Entry" type="number" step="any" /><In f={f} set={set} k="sl" l="Stop loss" type="number" step="any" /><In f={f} set={set} k="tp" l="Take profit" type="number" step="any" />
      <In f={f} set={set} k="lots" l="Lots" type="number" step="any" /><In f={f} set={set} k="usd" l="Result in USD (gross, minus = loss)" type="number" step="any" /><In f={f} set={set} k="comm" l="Commission" type="number" step="any" /><In f={f} set={set} k="rr" l="Risk to reward" />
      <Se f={f} set={set} k="symbol" l="Symbol" o={['XAUUSD', 'NAS100']} /><In f={f} set={set} k="emo" l="Emotional control 1-5" type="number" min="0" max="5" /><In f={f} set={set} k="rating" l="Overall rating 1-5" type="number" min="0" max="5" /><In f={f} set={set} k="exit" l="Exit price" type="number" step="any" /><In f={f} set={set} k="open" l="Entry time (UTC)" type="datetime-local" /><In f={f} set={set} k="close" l="Exit time (UTC)" type="datetime-local" />
      {TXT.map(([k, l]) => <div key={k} className="full"><label>{l}</label><textarea rows="2" value={f[k] || ''} onChange={set(k)} /></div>)}</div>
    <p className="mut" style={{ fontSize: 12 }}>Balance (P&amp;L column) and weekday are filled automatically. Add Before/After/15m screenshots in Notion — they appear here on the day view.</p>
    {err && <p className="r">{err}</p>}<button className="btn" onClick={submit}>Save to Notion</button> <button className="btn alt" onClick={onClose}>Cancel</button></div></div>;
}

const e$ = v => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m$ = v => (v < 0 ? '-' : '+') + '$' + Math.round(Math.abs(v)).toLocaleString();
const WN = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'], sh = d => MON[d.getMonth()].slice(0, 3) + ' ' + d.getDate();

function Cal({ s, rows, onPick }) {
  const n = new Date(), [c, setC] = useState({ y: n.getFullYear(), m: n.getMonth() }), ref = useRef(null);
  const f = new Date(c.y, c.m, 1).getDay(), dim = new Date(c.y, c.m + 1, 0).getDate(), wks = Math.ceil((f + dim) / 7);
  const skip = useMemo(() => new Set(rows.filter(r => r.side === 'Skip').map(r => r.date)), [rows]);
  let tot = 0, days = 0; const cells = [], weeks = [];
  for (let i = 0; i < wks; i++) {
    let wp = 0, wd = 0;
    for (let j = 0; j < 7; j++) {
      const d = i * 7 + j - f + 1; if (d < 1 || d > dim) { cells.push(<div key={i + '-' + j} className="cell off" />); continue; }
      const k = `${c.y}-${String(c.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, x = s.dm[k];
      if (x) { wp += x.n; wd++; cells.push(<div key={k} className="cell t" onClick={() => onPick(k)}><span className="n">{d}</span><div className="r2">{x.c} ⇄<b className={cls(x.n)}>{e$(Math.abs(x.n))}</b></div></div>); }
      else cells.push(<div key={k} className="cell" onClick={() => rows.some(r => r.date === k) && onPick(k)}><span className="n dim">{d}</span>{skip.has(k) && <div className="r2 dim">skip</div>}</div>);
    }
    tot += wp; days += wd;
    weeks.push(<div key={i} className="wk"><div className="wh"><b>Week {WN[i]}</b><span>{sh(new Date(c.y, c.m, i * 7 - f + 1))} – {sh(new Date(c.y, c.m, i * 7 - f + 7))}</span></div>
      {wd ? <div className="wr"><span>PnL: <b className={cls(wp)}>{$(wp)}</b></span><span>Days: <b>{wd}</b></span></div> : <div className="mut">No trades</div>}</div>);
  }
  const mv = d => setC(({ y, m }) => { const q = m + d; return { y: y + Math.floor(q / 12), m: ((q % 12) + 12) % 12 }; });
  const share = async () => { const h = (await import('html2canvas')).default; const cv = await h(ref.current, { backgroundColor: '#0b0e18', scale: 2 }); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `calendar-${MON[c.m]}-${c.y}.png`; a.click(); };
  return <div className="card" ref={ref}>
    <div className="top" style={{ marginBottom: 10 }}><b style={{ fontSize: 15 }}>Daily Summary</b><button className="btn alt" onClick={share} data-html2canvas-ignore="true">📷 Share</button></div>
    <div className="top" style={{ marginBottom: 12 }}><div className="nav"><button className="btn alt" onClick={() => mv(-1)}>‹</button><span className="ml">{MON[c.m]} {c.y}</span><button className="btn alt" onClick={() => mv(1)}>›</button>
      <button className="btn alt" onClick={() => setC({ y: n.getFullYear(), m: n.getMonth() })}>Today</button></div><div className="dpill">PnL: <b className={cls(tot)}>{$(tot)}</b><i />Days: <b>{days}</b></div></div>
    <div className="wrap"><div><div className="hd">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}</div><div className="grid">{cells}</div></div>
      <div><div className="s" style={{ marginBottom: 6 }}>Weekly Summary</div>{weeks}</div></div></div>;
}
function Settings({ ini, def, onSave, onClose }) {
  const [v, setV] = useState(ini);
  return <div className="modal" onClick={onClose}><div className="mbox" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}><h2 style={{ marginTop: 0 }}>Settings</h2>
    <label>Initial equity ($)</label><input type="number" value={v} onChange={e => setV(e.target.value)} />
    <p className="mut" style={{ fontSize: 12 }}>Current equity is read from the balance on your latest trade. This setting is saved in this browser.</p>
    <button className="btn" onClick={() => onSave(+v || def)}>Save</button> <button className="btn alt" onClick={() => onSave(null)}>Reset to default ({e$(def)})</button></div></div>;
}

export default function Page() {
  const [data, setData] = useState(null), [err, setErr] = useState(''), [view, setView] = useState('dash'), [sel, setSel] = useState(null), [add, setAdd] = useState(false), [cfg, setCfg] = useState(false), [ini, setIni] = useState(null), [sync, setSync] = useState('');
  const load = () => fetch('/api/trades').then(r => r.json()).then(j => (j.error ? setErr(j.error) : setData(j))).catch(e => setErr(String(e)));
  const doSync = async () => { setSync('go'); await Promise.all([load(), new Promise(r => setTimeout(r, 800))]); setSync('ok'); setTimeout(() => setSync(''), 1800); };
  useEffect(() => { load(); try { const v = +localStorage.getItem('ini'); if (v) setIni(v); } catch (e) {} }, []);
  useEffect(() => { const sel = '.card,.cell,.btn,.side a'; const m = e => { const d = document.documentElement.style; d.setProperty('--gx', e.clientX + 'px'); d.setProperty('--gy', e.clientY + 'px');
    for (let n = e.target; n && n !== document.body; n = n.parentElement) if (n.matches?.(sel)) { const r = n.getBoundingClientRect(); n.style.setProperty('--mx', e.clientX - r.left + 'px'); n.style.setProperty('--my', e.clientY - r.top + 'px'); } };
    window.addEventListener('mousemove', m); return () => window.removeEventListener('mousemove', m); }, []);
  const start = ini || data?.start || 100000;
  const s = useMemo(() => data && compute(data.rows, start), [data, start]);
  if (err) return <div className="main"><div className="warn">Could not load Notion: {err}</div></div>;
  if (!s) return <div className="main">Loading…</div>;
  const k = s.k, A = s.an, rows = data.rows, d = s.cur - start;
  const saveIni = v => { setIni(v); try { v ? localStorage.setItem('ini', v) : localStorage.removeItem('ini'); } catch (e) {} setCfg(false); };
  return <div className="app"><div className="side"><h2>TRADEBOARD</h2>
    {[['dash', 'Dashboard'], ['analysis', 'Insights'], ['log', 'Trade log']].map(([v, l]) => <a key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</a>)}</div>
    <div className="main">{sync === 'go' && <div className="syncbar" />}<div className="top"><h1>{{ dash: 'Dashboard', analysis: 'Insights', log: 'Trade log' }[view]} <span className="pill"><i className="dot" />100k account · live</span></h1>
      <div><button className="btn alt" onClick={() => setCfg(true)}>⚙ Settings</button> <button className={'btn alt sync ' + sync} onClick={doSync}><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" /></svg>{sync === 'go' ? 'Syncing…' : sync === 'ok' ? 'Synced ✓' : 'Sync'}</button> <button className="btn" onClick={() => setAdd(true)}>+ Add trade</button></div></div>
    {view === 'dash' && <>
      <div className="row k5">
        <Card t="Net P&L (after commission)"><div className={'big ' + cls(k.pnl)}><Num v={k.pnl} f={$} /></div><span className="mut">{k.n} trades · {k.skipped} skipped</span></Card>
        <Card t="Trade win %"><div className="big"><Num v={k.winRate * 100} f={v => v.toFixed(1) + '%'} /></div><span className="mut">{k.W}W / {k.L}L</span></Card>
        <Card t="Profit factor"><div className="big"><Num v={k.pf} f={v => v.toFixed(2)} /></div><span className="mut">Comm {$(k.comm)}</span></Card>
        <Card t="Day win %"><div className="big"><Num v={k.dayWin * 100} f={v => v.toFixed(1) + '%'} /></div><span className="mut">{s.daily.length} days</span></Card>
        <Card t="Avg win / loss"><div className="big"><Num v={k.awl} f={v => v.toFixed(2)} /></div><span className="g">{$(k.avgW)}</span> / <span className="r">-{$(k.avgL).slice(1)}</span></Card></div>
      <div className="row r2"><Card t={`Score · ${s.score.toFixed(1)}`}><Radar data={s.radar} /></Card><Card t="Cumulative net P&L"><Line data={s.cum} color={k.pnl >= 0 ? '#22d3a0' : '#ff5c6c'} /></Card></div>
      <div className="row r3"><Card t="Net daily P&L"><Bars items={s.daily.map(x => ({ l: x.d.slice(8) + '/' + x.d.slice(5, 7), v: x.n }))} h={150} /></Card>
        <Card t="Account equity"><div className="eq"><span className="s">Initial equity</span><span className="big"><Num v={start} f={e$} /></span></div>
          <div className="eq"><span className="s">Current equity<br />(last trade · {s.curDate || '–'})</span><span className="big"><Num v={s.cur} f={e$} /></span></div>
          <div className="trk"><i style={{ width: Math.min(100, Math.abs(d) / start * 1000) + '%', background: d >= 0 ? 'linear-gradient(90deg,#22d3a0,#5be3c0)' : '' }} /></div>
          <div className="s"><b className={cls(d)}>{$(d)} ({(d / start * 100).toFixed(2)}%)</b> vs initial · max drawdown {$(k.mdd)}</div></Card></div>
      <Cal s={s} rows={rows} onPick={setSel} /></>}
    {view === 'analysis' && <Insights rows={rows} start={start} />}
    {view === 'log' && <Card t={`All journal rows (${rows.length})`}><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Date</th><th>Day</th><th>Session</th><th>Trade</th><th>Result</th><th>Bias</th><th>Entry</th><th>SL</th><th>TP</th><th>Lots</th><th>Symbol</th><th>RR</th><th>USD</th><th>Comm</th><th>Net</th><th>Balance</th><th>Emo</th><th>Rating</th></tr></thead><tbody>
      {[...rows].reverse().map(r => <tr key={r.id} onClick={() => setSel(r.date)} style={{ cursor: 'pointer' }}><td>{r.date}</td><td>{r.day}</td><td>{r.session || '-'}</td><td>{r.side}</td><td>{r.result || '-'}</td><td>{r.bias || '-'}</td><td>{r.entry || '-'}</td><td>{r.sl || '-'}</td><td>{r.tp || '-'}</td><td>{r.lots ?? '-'}</td><td>{r.symbol || '-'}</td><td>{r.rr || '-'}</td><td>{r.usd ?? '-'}</td><td>{r.comm ?? '-'}</td><td className={cls(net(r))}>{isTrade(r) ? $(net(r)) : '-'}</td><td>{r.balance || '-'}</td><td>{r.emo ?? '-'}</td><td>{r.rating ?? '-'}</td></tr>)}</tbody></table></div></Card>}
    {sel && <DayModal date={sel} rows={rows} onClose={() => setSel(null)} reload={load} />}{add && <AddModal onClose={() => setAdd(false)} reload={load} />}
    {cfg && <Settings ini={start} def={data.start} onSave={saveIni} onClose={() => setCfg(false)} />}</div></div>;
}
