import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * App Router root middleware. Refreshes the Supabase Auth cookie on every
 * request per @supabase/ssr's documented pattern, so organiser login state
 * (auth.users, via Supabase Auth) stays valid across navigations.
 *
 * This governs ONLY organiser account login. It does not touch, validate, or
 * interact with the existing organiser_token/anon_token bearer-credential
 * system used by the 10 session-scoped API routes (see src/lib/api/auth.ts)
 * — those are completely unaffected by this middleware.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
