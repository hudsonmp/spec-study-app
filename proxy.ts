import { NextResponse, type NextRequest } from 'next/server';

// Cookie-presence check only. Full validation lives in server actions.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasParticipant = request.cookies.has('specstudy_session');
  const hasResearcher = request.cookies.has('specstudy_researcher');

  if (pathname.startsWith('/create')) {
    if (pathname === '/create/login') return NextResponse.next();
    if (!hasResearcher) {
      const url = request.nextUrl.clone();
      url.pathname = '/create/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/onboard') || pathname.startsWith('/study')) {
    if (!hasParticipant) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/onboard/:path*', '/study/:path*', '/create/:path*'],
};
