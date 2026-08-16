/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as attribution from "../attribution.js";
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as crons from "../crons.js";
import type * as ga4 from "../ga4.js";
import type * as ga4Store from "../ga4Store.js";
import type * as http from "../http.js";
import type * as instagram from "../instagram.js";
import type * as instagramStore from "../instagramStore.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_instagramApi from "../lib/instagramApi.js";
import type * as lib_openreplySql from "../lib/openreplySql.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_runSync from "../lib/runSync.js";
import type * as lib_slug from "../lib/slug.js";
import type * as openreply from "../openreply.js";
import type * as openreplyStore from "../openreplyStore.js";
import type * as sync from "../sync.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  attribution: typeof attribution;
  auth: typeof auth;
  connections: typeof connections;
  crons: typeof crons;
  ga4: typeof ga4;
  ga4Store: typeof ga4Store;
  http: typeof http;
  instagram: typeof instagram;
  instagramStore: typeof instagramStore;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/instagramApi": typeof lib_instagramApi;
  "lib/openreplySql": typeof lib_openreplySql;
  "lib/providers": typeof lib_providers;
  "lib/runSync": typeof lib_runSync;
  "lib/slug": typeof lib_slug;
  openreply: typeof openreply;
  openreplyStore: typeof openreplyStore;
  sync: typeof sync;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
