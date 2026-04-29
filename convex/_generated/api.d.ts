/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_conversation from "../agent/conversation.js";
import type * as agent_embeddingsCache from "../agent/embeddingsCache.js";
import type * as agent_memory from "../agent/memory.js";
import type * as aiTown_agent from "../aiTown/agent.js";
import type * as aiTown_agentDescription from "../aiTown/agentDescription.js";
import type * as aiTown_agentInputs from "../aiTown/agentInputs.js";
import type * as aiTown_agentOperations from "../aiTown/agentOperations.js";
import type * as aiTown_conversation from "../aiTown/conversation.js";
import type * as aiTown_conversationMembership from "../aiTown/conversationMembership.js";
import type * as aiTown_game from "../aiTown/game.js";
import type * as aiTown_ids from "../aiTown/ids.js";
import type * as aiTown_inputHandler from "../aiTown/inputHandler.js";
import type * as aiTown_inputs from "../aiTown/inputs.js";
import type * as aiTown_insertInput from "../aiTown/insertInput.js";
import type * as aiTown_location from "../aiTown/location.js";
import type * as aiTown_main from "../aiTown/main.js";
import type * as aiTown_movement from "../aiTown/movement.js";
import type * as aiTown_player from "../aiTown/player.js";
import type * as aiTown_playerDescription from "../aiTown/playerDescription.js";
import type * as aiTown_world from "../aiTown/world.js";
import type * as aiTown_worldMap from "../aiTown/worldMap.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as engine_abstractGame from "../engine/abstractGame.js";
import type * as engine_historicalObject from "../engine/historicalObject.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as messages from "../messages.js";
import type * as music from "../music.js";
import type * as networking_agents from "../networking/agents.js";
import type * as networking_auth from "../networking/auth.js";
import type * as networking_cardText from "../networking/cardText.js";
import type * as networking_cards from "../networking/cards.js";
import type * as networking_conversations from "../networking/conversations.js";
import type * as networking_demoSeed from "../networking/demoSeed.js";
import type * as networking_eventActivity from "../networking/eventActivity.js";
import type * as networking_eventAgents from "../networking/eventAgents.js";
import type * as networking_eventCards from "../networking/eventCards.js";
import type * as networking_eventConnectionIntents from "../networking/eventConnectionIntents.js";
import type * as networking_eventContactReveal from "../networking/eventContactReveal.js";
import type * as networking_eventDirectory from "../networking/eventDirectory.js";
import type * as networking_eventMarkerIdentity from "../networking/eventMarkerIdentity.js";
import type * as networking_eventOperatorControls from "../networking/eventOperatorControls.js";
import type * as networking_eventOrganizerAuth from "../networking/eventOrganizerAuth.js";
import type * as networking_eventOrganizerControls from "../networking/eventOrganizerControls.js";
import type * as networking_eventRateLimits from "../networking/eventRateLimits.js";
import type * as networking_eventRecipientRules from "../networking/eventRecipientRules.js";
import type * as networking_eventSpaces from "../networking/eventSpaces.js";
import type * as networking_eventWorldTemplates from "../networking/eventWorldTemplates.js";
import type * as networking_eventWorlds from "../networking/eventWorlds.js";
import type * as networking_http from "../networking/http.js";
import type * as networking_inbox from "../networking/inbox.js";
import type * as networking_intros from "../networking/intros.js";
import type * as networking_matching from "../networking/matching.js";
import type * as networking_meetings from "../networking/meetings.js";
import type * as networking_townProjection from "../networking/townProjection.js";
import type * as networking_validators from "../networking/validators.js";
import type * as testing from "../testing.js";
import type * as townNpcs from "../townNpcs.js";
import type * as util_FastIntegerCompression from "../util/FastIntegerCompression.js";
import type * as util_assertNever from "../util/assertNever.js";
import type * as util_asyncMap from "../util/asyncMap.js";
import type * as util_compression from "../util/compression.js";
import type * as util_geometry from "../util/geometry.js";
import type * as util_isSimpleObject from "../util/isSimpleObject.js";
import type * as util_llm from "../util/llm.js";
import type * as util_minheap from "../util/minheap.js";
import type * as util_object from "../util/object.js";
import type * as util_sleep from "../util/sleep.js";
import type * as util_types from "../util/types.js";
import type * as util_xxhash from "../util/xxhash.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/conversation": typeof agent_conversation;
  "agent/embeddingsCache": typeof agent_embeddingsCache;
  "agent/memory": typeof agent_memory;
  "aiTown/agent": typeof aiTown_agent;
  "aiTown/agentDescription": typeof aiTown_agentDescription;
  "aiTown/agentInputs": typeof aiTown_agentInputs;
  "aiTown/agentOperations": typeof aiTown_agentOperations;
  "aiTown/conversation": typeof aiTown_conversation;
  "aiTown/conversationMembership": typeof aiTown_conversationMembership;
  "aiTown/game": typeof aiTown_game;
  "aiTown/ids": typeof aiTown_ids;
  "aiTown/inputHandler": typeof aiTown_inputHandler;
  "aiTown/inputs": typeof aiTown_inputs;
  "aiTown/insertInput": typeof aiTown_insertInput;
  "aiTown/location": typeof aiTown_location;
  "aiTown/main": typeof aiTown_main;
  "aiTown/movement": typeof aiTown_movement;
  "aiTown/player": typeof aiTown_player;
  "aiTown/playerDescription": typeof aiTown_playerDescription;
  "aiTown/world": typeof aiTown_world;
  "aiTown/worldMap": typeof aiTown_worldMap;
  constants: typeof constants;
  crons: typeof crons;
  "engine/abstractGame": typeof engine_abstractGame;
  "engine/historicalObject": typeof engine_historicalObject;
  http: typeof http;
  init: typeof init;
  messages: typeof messages;
  music: typeof music;
  "networking/agents": typeof networking_agents;
  "networking/auth": typeof networking_auth;
  "networking/cardText": typeof networking_cardText;
  "networking/cards": typeof networking_cards;
  "networking/conversations": typeof networking_conversations;
  "networking/demoSeed": typeof networking_demoSeed;
  "networking/eventActivity": typeof networking_eventActivity;
  "networking/eventAgents": typeof networking_eventAgents;
  "networking/eventCards": typeof networking_eventCards;
  "networking/eventConnectionIntents": typeof networking_eventConnectionIntents;
  "networking/eventContactReveal": typeof networking_eventContactReveal;
  "networking/eventDirectory": typeof networking_eventDirectory;
  "networking/eventMarkerIdentity": typeof networking_eventMarkerIdentity;
  "networking/eventOperatorControls": typeof networking_eventOperatorControls;
  "networking/eventOrganizerAuth": typeof networking_eventOrganizerAuth;
  "networking/eventOrganizerControls": typeof networking_eventOrganizerControls;
  "networking/eventRateLimits": typeof networking_eventRateLimits;
  "networking/eventRecipientRules": typeof networking_eventRecipientRules;
  "networking/eventSpaces": typeof networking_eventSpaces;
  "networking/eventWorldTemplates": typeof networking_eventWorldTemplates;
  "networking/eventWorlds": typeof networking_eventWorlds;
  "networking/http": typeof networking_http;
  "networking/inbox": typeof networking_inbox;
  "networking/intros": typeof networking_intros;
  "networking/matching": typeof networking_matching;
  "networking/meetings": typeof networking_meetings;
  "networking/townProjection": typeof networking_townProjection;
  "networking/validators": typeof networking_validators;
  testing: typeof testing;
  townNpcs: typeof townNpcs;
  "util/FastIntegerCompression": typeof util_FastIntegerCompression;
  "util/assertNever": typeof util_assertNever;
  "util/asyncMap": typeof util_asyncMap;
  "util/compression": typeof util_compression;
  "util/geometry": typeof util_geometry;
  "util/isSimpleObject": typeof util_isSimpleObject;
  "util/llm": typeof util_llm;
  "util/minheap": typeof util_minheap;
  "util/object": typeof util_object;
  "util/sleep": typeof util_sleep;
  "util/types": typeof util_types;
  "util/xxhash": typeof util_xxhash;
  world: typeof world;
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

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
