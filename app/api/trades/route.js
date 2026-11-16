import { getTrades, addTrade, updateTrade } from '../../../lib/notion';
export const dynamic = 'force-dynamic';
const wrap = f => async req => { try { return Response.json(await f(req)); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); } };
export const GET = wrap(async () => ({ rows: await getTrades(), start: +process.env.ACCOUNT_SIZE || 100000 }));
export const POST = wrap(async r => addTrade(await r.json()));
export const PATCH = wrap(async r => { const { id, ...t } = await r.json(); return updateTrade(id, t); });
