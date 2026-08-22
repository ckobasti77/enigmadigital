/**
 * Extension resolution for Node's built-in TypeScript support.
 *
 * Node strips types out of `.ts` files on its own, but it resolves modules as
 * ESM — where `import { x } from "./thing"` is an error, because ESM demands
 * the extension. Convex source is written the way TypeScript resolves imports,
 * extensionless, so every relative import in `convex/` fails without this.
 *
 * A resolve hook is the whole fix: try what was written, and on failure try the
 * same specifier with the extensions TypeScript would have tried. No bundler,
 * no transpiler, no dependency — `node --import ./scripts/ts-hooks.mjs` and the
 * real Convex modules load as themselves.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const CANDIDATES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const rootUrl = new URL("../", import.meta.url);
    const subPath = specifier.slice(2);
    const base = new URL(subPath, rootUrl);
    for (const ext of ["", ...CANDIDATES]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        return await next(candidate.href, context);
      }
    }
  }

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    try {
      return await next(specifier, context);
    } catch (err) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of CANDIDATES) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) {
          return await next(candidate.href, context);
        }
      }
      throw err;
    }
  }
  return next(specifier, context);
}

register(import.meta.url);
