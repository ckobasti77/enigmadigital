import { defineConfig } from "vitest/config";

// Dva okruženja (plan P7):
// - Convex funkcije (`convex/**/*.test.ts`) idu kroz `convex-test` u
//   `edge-runtime`, istom okruženju u kom Convex izvršava funkcije.
// - Čiste funkcije (`lib/**/*.test.ts`) idu u `node`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        test: {
          name: "node",
          include: ["lib/**/*.test.ts"],
          environment: "node",
          // Čuvari koda (`*-cuvar.test.ts`, zakucane adrese, pozivnice) čitaju
          // stotine fajlova kroz TypeScript AST; uz paralelne fajlove
          // podrazumevanih 5 s povremeno ne stigne (ULTRA1 T12).
          testTimeout: 30_000,
        },
      },
    ],
  },
});
