import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Route Handler for Instagram OAuth Redirect Callback.
 *
 * Receives redirect from Instagram Login and forwards the authorization code
 * or error to the Settings page where the authenticated Convex client exchanges it.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");

  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  if (code) {
    settingsUrl.searchParams.set("ig_code", code);
  }
  if (error) {
    settingsUrl.searchParams.set("ig_error", error);
  }
  if (errorReason) {
    settingsUrl.searchParams.set("ig_error_reason", errorReason);
  }
  if (errorDescription) {
    settingsUrl.searchParams.set("ig_error_description", errorDescription);
  }

  return NextResponse.redirect(settingsUrl);
}
