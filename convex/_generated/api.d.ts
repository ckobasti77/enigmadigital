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
import type * as facebook from "../facebook.js";
import type * as facebookStore from "../facebookStore.js";
import type * as fbComments from "../fbComments.js";
import type * as fbCommentsStore from "../fbCommentsStore.js";
import type * as ga4 from "../ga4.js";
import type * as ga4Store from "../ga4Store.js";
import type * as googleAds from "../googleAds.js";
import type * as googleAdsStore from "../googleAdsStore.js";
import type * as http from "../http.js";
import type * as igComments from "../igComments.js";
import type * as igCommentsStore from "../igCommentsStore.js";
import type * as instagram from "../instagram.js";
import type * as instagramPublish from "../instagramPublish.js";
import type * as instagramPublishStore from "../instagramPublishStore.js";
import type * as instagramStore from "../instagramStore.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_facebookApi from "../lib/facebookApi.js";
import type * as lib_facebookContent from "../lib/facebookContent.js";
import type * as lib_igComments from "../lib/igComments.js";
import type * as lib_igPublish from "../lib/igPublish.js";
import type * as lib_instagramApi from "../lib/instagramApi.js";
import type * as lib_metaAdsApi from "../lib/metaAdsApi.js";
import type * as lib_orButtons from "../lib/orButtons.js";
import type * as lib_orFollow from "../lib/orFollow.js";
import type * as lib_orFollowUp from "../lib/orFollowUp.js";
import type * as lib_orLink from "../lib/orLink.js";
import type * as lib_orMatch from "../lib/orMatch.js";
import type * as lib_orMessage from "../lib/orMessage.js";
import type * as lib_orPlatform from "../lib/orPlatform.js";
import type * as lib_orProfile from "../lib/orProfile.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_runSync from "../lib/runSync.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_youtubeApi from "../lib/youtubeApi.js";
import type * as lib_ytCaptions from "../lib/ytCaptions.js";
import type * as lib_ytQuota from "../lib/ytQuota.js";
import type * as lib_ytThumbnail from "../lib/ytThumbnail.js";
import type * as lib_ytUpload from "../lib/ytUpload.js";
import type * as metaAds from "../metaAds.js";
import type * as metaAdsStore from "../metaAdsStore.js";
import type * as openreplyStore from "../openreplyStore.js";
import type * as orAutomationsApi from "../orAutomationsApi.js";
import type * as orEngine from "../orEngine.js";
import type * as orIngest from "../orIngest.js";
import type * as orLinks from "../orLinks.js";
import type * as orProfileMenu from "../orProfileMenu.js";
import type * as orRollup from "../orRollup.js";
import type * as orSend from "../orSend.js";
import type * as rules from "../rules.js";
import type * as rulesStore from "../rulesStore.js";
import type * as sync from "../sync.js";
import type * as workspaces from "../workspaces.js";
import type * as youtube from "../youtube.js";
import type * as youtubeStore from "../youtubeStore.js";
import type * as ytAuth from "../ytAuth.js";
import type * as ytAutomationsApi from "../ytAutomationsApi.js";
import type * as ytCaptions from "../ytCaptions.js";
import type * as ytComments from "../ytComments.js";
import type * as ytIngest from "../ytIngest.js";
import type * as ytMedia from "../ytMedia.js";
import type * as ytPlaylists from "../ytPlaylists.js";
import type * as ytPoll from "../ytPoll.js";
import type * as ytReply from "../ytReply.js";
import type * as ytThumbnails from "../ytThumbnails.js";
import type * as ytUpload from "../ytUpload.js";
import type * as ytVideos from "../ytVideos.js";

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
  facebook: typeof facebook;
  facebookStore: typeof facebookStore;
  fbComments: typeof fbComments;
  fbCommentsStore: typeof fbCommentsStore;
  ga4: typeof ga4;
  ga4Store: typeof ga4Store;
  googleAds: typeof googleAds;
  googleAdsStore: typeof googleAdsStore;
  http: typeof http;
  igComments: typeof igComments;
  igCommentsStore: typeof igCommentsStore;
  instagram: typeof instagram;
  instagramPublish: typeof instagramPublish;
  instagramPublishStore: typeof instagramPublishStore;
  instagramStore: typeof instagramStore;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/facebookApi": typeof lib_facebookApi;
  "lib/facebookContent": typeof lib_facebookContent;
  "lib/igComments": typeof lib_igComments;
  "lib/igPublish": typeof lib_igPublish;
  "lib/instagramApi": typeof lib_instagramApi;
  "lib/metaAdsApi": typeof lib_metaAdsApi;
  "lib/orButtons": typeof lib_orButtons;
  "lib/orFollow": typeof lib_orFollow;
  "lib/orFollowUp": typeof lib_orFollowUp;
  "lib/orLink": typeof lib_orLink;
  "lib/orMatch": typeof lib_orMatch;
  "lib/orMessage": typeof lib_orMessage;
  "lib/orPlatform": typeof lib_orPlatform;
  "lib/orProfile": typeof lib_orProfile;
  "lib/providers": typeof lib_providers;
  "lib/runSync": typeof lib_runSync;
  "lib/slug": typeof lib_slug;
  "lib/youtubeApi": typeof lib_youtubeApi;
  "lib/ytCaptions": typeof lib_ytCaptions;
  "lib/ytQuota": typeof lib_ytQuota;
  "lib/ytThumbnail": typeof lib_ytThumbnail;
  "lib/ytUpload": typeof lib_ytUpload;
  metaAds: typeof metaAds;
  metaAdsStore: typeof metaAdsStore;
  openreplyStore: typeof openreplyStore;
  orAutomationsApi: typeof orAutomationsApi;
  orEngine: typeof orEngine;
  orIngest: typeof orIngest;
  orLinks: typeof orLinks;
  orProfileMenu: typeof orProfileMenu;
  orRollup: typeof orRollup;
  orSend: typeof orSend;
  rules: typeof rules;
  rulesStore: typeof rulesStore;
  sync: typeof sync;
  workspaces: typeof workspaces;
  youtube: typeof youtube;
  youtubeStore: typeof youtubeStore;
  ytAuth: typeof ytAuth;
  ytAutomationsApi: typeof ytAutomationsApi;
  ytCaptions: typeof ytCaptions;
  ytComments: typeof ytComments;
  ytIngest: typeof ytIngest;
  ytMedia: typeof ytMedia;
  ytPlaylists: typeof ytPlaylists;
  ytPoll: typeof ytPoll;
  ytReply: typeof ytReply;
  ytThumbnails: typeof ytThumbnails;
  ytUpload: typeof ytUpload;
  ytVideos: typeof ytVideos;
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
