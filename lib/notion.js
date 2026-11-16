const DS = process.env.NOTION_DS_ID || '8cf9975a-11dd-48c8-a6ac-3580b12d76b8';
const H = { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' };
async function call(path, method = 'GET', body) {
  const r = await fetch('https://api.notion.com/v1' + path, { method, headers: H, body: body && JSON.stringify(body), cache: 'no-store' });
  const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Notion error'); return j;
}
// every column of the 100k database (names include trailing spaces exactly as in Notion)
export const F = {
  side: ['trade', 'select'], result: ['Result', 'select'], session: ['Session', 'select'], bias: ['Bias', 'select'], day: ['day', 'select'],
  entry: ['Entry', 'number'], sl: ['Stop Loss', 'number'], tp: ['Take Profit ', 'number'], lots: ['Lots', 'number'],
  balance: ['P&L', 'number'], usd: ['Result in USD', 'number'], comm: ['Commission', 'number'], exit: ['Exit Price', 'number'],
  symbol: ['Symbol', 'select'], open: ['Entry Timestamp', 'date'], close: ['Exit Timestamp', 'date'], dur: ['Duration', 'text'],
  emo: ['Emotional Control ', 'number'], rating: ['Overall Rating ', 'number'],
  rr: ['Risk to reward', 'text'], candle: ['Entry Candle ', 'text'], biasReason: ['Bias reason', 'text'], why: ['Why Did I took the trade', 'text'],
  right: ['what i did right', 'text'], wrong: ['what i did wrong ', 'text'], wrongThings: ['what things get worng ', 'text'], improve: ['improvement ', 'text'],
  before: ['Before ', 'files'], after: ['After', 'files'], pic: ['15m Pic', 'files'],
};
const txt = a => (a || []).map(x => x.plain_text).join('');
function parse(pg) {
  const P = pg.properties, t = { id: pg.id, title: txt(P.Title?.title), date: P.Date?.date?.start?.slice(0, 10) };
  for (const [k, [n, ty]] of Object.entries(F)) {
    const p = P[n]; if (!p) continue;
    t[k] = ty === 'select' ? p.select?.name ?? null : ty === 'number' ? p.number : ty === 'date' ? p.date?.start ?? null : ty === 'text' ? txt(p.rich_text)
      : (p.files || []).map(f => f.file?.url || f.external?.url);
  }
  return t;
}
export async function getTrades() {
  let out = [], cursor;
  do {
    const j = await call(`/data_sources/${DS}/query`, 'POST', { page_size: 100, start_cursor: cursor, sorts: [{ property: 'Date', direction: 'ascending' }] });
    out.push(...j.results.map(parse)); cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}
function toProps(t) {
  const p = {};
  for (const [k, [n, ty]] of Object.entries(F)) {
    const v = t[k]; if (v === undefined || ty === 'files') continue;
    if (ty === 'select') p[n] = { select: v ? { name: v } : null };
    else if (ty === 'number') p[n] = { number: v === '' || v === null ? null : Number(v) };
    else if (ty === 'date') p[n] = { date: v ? { start: v.length === 16 ? v + ':00Z' : v } : null };
    else p[n] = { rich_text: v ? [{ text: { content: String(v) } }] : [] };
  }
  return p;
}
const DAYS = ['Sun', 'Mon', 'Tus', 'Wed', 'Thu', 'Fri', 'Sat']; // "Tus" matches your option name
export async function addTrade(t) {
  const all = await getTrades();
  // balance = account size + every real trade's (gross - commission), so it never depends on row order
  const start = +process.env.ACCOUNT_SIZE || 100000;
  const done = all.filter(x => x.side && x.side !== 'Skip' && x.result && x.result !== 'No trade').reduce((s, x) => s + (x.usd || 0) - (x.comm || 0), 0);
  if (t.open && t.close && !t.dur) { const sec = Math.round((new Date(t.close.length === 16 ? t.close + ':00Z' : t.close) - new Date(t.open.length === 16 ? t.open + ':00Z' : t.open)) / 1000); if (sec >= 0) t.dur = [sec / 3600, (sec % 3600) / 60, sec % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':'); }
  t.day = DAYS[new Date(t.date + 'T00:00:00Z').getUTCDay()];
  if (t.balance == null) t.balance = +(start + done + (+t.usd || 0) - (+t.comm || 0)).toFixed(2);
  const [y, m, d] = t.date.split('-');
  return call('/pages', 'POST', { parent: { type: 'data_source_id', data_source_id: DS },
    properties: { Title: { title: [{ text: { content: [`${d}/${m}`, t.symbol, t.side].filter(Boolean).join(' ') } }] }, Date: { date: { start: t.date } }, ...toProps(t) } });
}
export const updateTrade = (id, t) => call(`/pages/${id}`, 'PATCH', { properties: toProps(t) });
