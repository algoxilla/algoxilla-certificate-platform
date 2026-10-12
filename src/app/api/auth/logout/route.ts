// Algoxilla Certificate Platform - Logout Endpoint
// Route Handler: POST /api/auth/logout
// Clears authenticated session cookie.

import { NextResponse } from "next/server";
import { serializeLogoutCookie } from "@/lib/auth/session";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true, message: "Logged out successfully." });
  response.headers.set("Set-Cookie", serializeLogoutCookie());
  return response;
}
