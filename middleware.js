import { NextResponse } from 'next/server';
export function middleware(req) {
  const u = process.env.DASH_USER, p = process.env.DASH_PASS;
  if (!p) return NextResponse.next();
  const a = req.headers.get('authorization') || '';
  if (a.startsWith('Basic ') && atob(a.slice(6)) === `${u}:${p}`) return NextResponse.next();
  return new NextResponse('Auth required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Dash"' } });
}
