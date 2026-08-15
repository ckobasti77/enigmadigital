"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { useMemo } from "react";

const PLACEHOLDER_URL = "https://placeholder.convex.cloud";

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      console.warn(
        "NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` to link a deployment.",
      );
    }
    return new ConvexReactClient(url ?? PLACEHOLDER_URL);
  }, []);

  return (
    <ConvexAuthNextjsProvider client={client}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
