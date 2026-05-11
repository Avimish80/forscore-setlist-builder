import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.SITE_PASSWORD;

  if (!expected || password !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const res = new NextResponse('OK', { status: 200 });
  res.cookies.set('auth', password, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}
