/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adActions from "../adActions.js";
import type * as adActionsStore from "../adActionsStore.js";
import type * as analytics from "../analytics.js";
import type * as attribution from "../attribution.js";
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as crons from "../crons.js";
import type * as ga4 from "../ga4.js";
import type * as ga4Store from "../ga4Store.js";
import type * as googleAds from "../googleAds.js";
import type * as googleAdsStore from "../googleAdsStore.js";
import type * as http from "../http.js";
import type * as instagram from "../instagram.js";
import type * as instagramStore from "../instagramStore.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_instagramApi from "../lib/instagramApi.js";
import type * as lib_metaAdsApi from "../lib/metaAdsApi.js";
import type * as lib_orLink from "../lib/orLink.js";
import type * as lib_orMatch from "../lib/orMatch.js";
import type * as lib_orMessage from "../lib/orMessage.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_runSync from "../lib/runSync.js";
import type * as lib_slug from "../lib/slug.js";
import type * as metaAds from "../metaAds.js";
import type * as metaAdsStore from "../metaAdsStore.js";
import type * as openreplyStore from "../openreplyStore.js";
import type * as orAutomationsApi from "../orAutomationsApi.js";
import type * as orEngine from "../orEngine.js";
import type * as orIngest from "../orIngest.js";
import type * as orLinks from "../orLinks.js";
import type * as orRollup from "../orRollup.js";
import type * as orSend from "../orSend.js";
import type * as rules from "../rules.js";
import type * as rulesStore from "../rulesStore.js";
import type * as sync from "../sync.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adActions: typeof adActions;
  adActionsStore: typeof adActionsStore;
  analytics: typeof analytics;
  attribution: typeof attribution;
  auth: typeof auth;
  connections: typeof connections;
  crons: typeof crons;
  ga4: typeof ga4;
  ga4Store: typeof ga4Store;
  googleAds: typeof googleAds;
  googleAdsStore: typeof googleAdsStore;
  http: typeof http;
  instagram: typeof instagram;
  instagramStore: typeof instagramStore;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/instagramApi": typeof lib_instagramApi;
  "lib/metaAdsApi": typeof lib_metaAdsApi;
  "lib/orLink": typeof lib_orLink;
  "lib/orMatch": typeof lib_orMatch;
  "lib/orMessage": typeof lib_orMessage;
  "lib/providers": typeof lib_providers;
  "lib/runSync": typeof lib_runSync;
  "lib/slug": typeof lib_slug;
  metaAds: typeof metaAds;
  metaAdsStore: typeof metaAdsStore;
  openreplyStore: typeof openreplyStore;
  orAutomationsApi: typeof orAutomationsApi;
  orEngine: typeof orEngine;
  orIngest: typeof orIngest;
  orLinks: typeof orLinks;
  orRollup: typeof orRollup;
  orSend: typeof orSend;
  rules: typeof rules;
  rulesStore: typeof rulesStore;
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
