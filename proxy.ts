import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "poll_session_id";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Injeta um cookie de sessao HTTPOnly/Secure se ainda nao existir.
// Essa e a "Barreira do Cookie" do motor antifraude.
// (No Next.js 16 a convencao "middleware" foi renomeada para "proxy".)
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const existing = request.cookies.get(COOKIE_NAME)?.value;
  if (!existing) {
    const sessionId = crypto.randomUUID();
    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionId,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
  }

  return response;
}

export const config = {
  // Roda em todas as rotas exceto assets estaticos e a API interna do Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|candidatos).*)"],
};
