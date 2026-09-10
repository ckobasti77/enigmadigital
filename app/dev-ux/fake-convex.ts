import { getFunctionName, type FunctionReference } from "convex/server";
import type { ConvexReactClient } from "convex/react";

/**
 * Lažni Convex klijent za razvojni prikaz ekrana (A1 §6).
 *
 * Prava aplikacija traži sesiju (email + lozinka) i živ Convex — ni jedno ni
 * drugo noćni run nema. Ovaj klijent zadovoljava tačno onaj deo ugovora
 * `convex/react` koji `useQuery`/`useMutation`/`ConvexProviderWithAuth`
 * koriste: `watchQuery` vraća „watch" čiji `localQueryResult()` odmah daje
 * sintetički rezultat (ili `undefined` = ekran crta skeleton), a mutacije i
 * akcije su prazna obećanja. Nema mreže, nema pretplata, nema tajni.
 *
 * Koristi se SAMO iz `app/dev-ux` (koji u produkciji vraća 404).
 */
export type FixtureResolver = (
  name: string,
  args: Record<string, unknown>,
) => unknown;

export function createFakeConvexClient(
  resolve: FixtureResolver,
): ConvexReactClient {
  const fake = {
    watchQuery(query: FunctionReference<"query">, ...rest: unknown[]) {
      const name = getFunctionName(query);
      const args = (
        rest[0] && typeof rest[0] === "object" ? rest[0] : {}
      ) as Record<string, unknown>;
      return {
        onUpdate: () => () => {},
        localQueryResult: () => resolve(name, args),
        localQueryLogs: () => [],
        journal: () => undefined,
      };
    },
    async query(query: FunctionReference<"query">, args?: Record<string, unknown>) {
      return resolve(getFunctionName(query), args ?? {});
    },
    async mutation() {
      return undefined;
    },
    async action() {
      return undefined;
    },
    setAuth(
      _fetchToken: unknown,
      onChange?: (isAuthenticated: boolean) => void,
    ) {
      onChange?.(true);
    },
    clearAuth() {},
    subscribeToConnectionState() {
      return () => {};
    },
    connectionState() {
      return {
        hasInflightRequests: false,
        isWebSocketConnected: true,
        timeOfOldestInflightRequest: null,
        hasEverConnected: true,
        connectionCount: 1,
        connectionRetries: 0,
        inflightMutations: 0,
        inflightActions: 0,
      };
    },
    async close() {},
    logger: console,
  };
  return fake as unknown as ConvexReactClient;
}
