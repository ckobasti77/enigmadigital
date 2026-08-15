"use client";

import { createContext, useContext } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type WorkspaceContextValue = {
  user: { id: string; email: string | null; name: string | null } | null;
  workspace: { id: string; name: string; slug: string } | null;
  role: "owner" | "client_viewer" | null;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Loads the signed-in user + their workspace once and exposes it to every page
 * via `useWorkspace()`. Rendered inside `<Authenticated>`, so the query only
 * runs when the auth token is ready.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const data = useQuery(api.workspaces.currentContext);

  const value: WorkspaceContextValue = {
    user: data?.user ?? null,
    workspace: data?.workspace ?? null,
    role: data?.role ?? null,
    isLoading: data === undefined,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === null) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
