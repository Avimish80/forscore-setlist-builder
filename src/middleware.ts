import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always allow the login page and static assets
  if (pathname === '/login') return NextResponse.next();

  const auth = req.cookies.get('auth')?.value;
  if (auth === password) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sql-wasm.wasm|sql-wasm.js|library.db|pdfjs.min.js|pdf.worker.min.js|api/auth).*)'],
};
