import { ConvexError } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { httpAction } from '../_generated/server';
import { NetworkingErrorCode } from './auth';

type HttpRuntimeContext = {
  runMutation: (funcRef: any, args: any) => Promise<unknown>;
  runQuery: (funcRef: any, args: any) => Promise<unknown>;
};

type SuccessEnvelope = {
  success: true;
  data: unknown;
};

type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type OwnerMetadata = {
  displayName?: string;
  xProfileUrl?: string;
  verificationMethod?: 'tweet' | 'oauth';
  websiteUrl?: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const functions = {
  agents: {
    registerAgent: makeFunctionReference<'mutation'>('networking/agents:registerAgent'),
    mockClaimAgent: makeFunctionReference<'mutation'>('networking/agents:mockClaimAgent'),
    getClaimStatus: makeFunctionReference<'query'>('networking/agents:getClaimStatus'),
  },
  eventAgents: {
    registerEventAgent: makeFunctionReference<'mutation'>(
      'networking/eventAgents:registerEventAgent',
    ),
    getOwnerReview: makeFunctionReference<'query'>('networking/eventAgents:getOwnerReview'),
    approveOwnerReview: makeFunctionReference<'mutation'>(
      'networking/eventAgents:approveOwnerReview',
    ),
    rejectOwnerReview: makeFunctionReference<'mutation'>(
      'networking/eventAgents:rejectOwnerReview',
    ),
    requestOwnerReviewChanges: makeFunctionReference<'mutation'>(
      'networking/eventAgents:requestOwnerReviewChanges',
    ),
    listApprovedPublicCards: makeFunctionReference<'query'>(
      'networking/eventAgents:listApprovedPublicCards',
    ),
  },
  eventDirectory: {
    searchEventDirectory: makeFunctionReference<'mutation'>(
      'networking/eventDirectory:searchEventDirectory',
    ),
  },
  eventSpaces: {
    getEventSpaceConfig: makeFunctionReference<'query'>(
      'networking/eventSpaces:getEventSpaceConfig',
    ),
  },
  eventConnectionIntents: {
    createEventConnectionIntent: makeFunctionReference<'mutation'>(
      'networking/eventConnectionIntents:createEventConnectionIntent',
    ),
    listEventInboundIntents: makeFunctionReference<'query'>(
      'networking/eventConnectionIntents:listEventInboundIntents',
    ),
  },
  eventRecipientRules: {
    upsertEventRecipientRules: makeFunctionReference<'mutation'>(
      'networking/eventRecipientRules:upsertEventRecipientRules',
    ),
  },
  eventContactReveal: {
    upsertEventPrivateContact: makeFunctionReference<'mutation'>(
      'networking/eventContactReveal:upsertEventPrivateContact',
    ),
    decideEventConnectionIntent: makeFunctionReference<'mutation'>(
      'networking/eventContactReveal:decideEventConnectionIntent',
    ),
    getEventContactReveal: makeFunctionReference<'mutation'>(
      'networking/eventContactReveal:getEventContactReveal',
    ),
  },
  eventOrganizerControls: {
    pauseEventRegistration: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:pauseEventRegistration',
    ),
    resumeEventRegistration: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:resumeEventRegistration',
    ),
    rotateEventSkillUrl: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:rotateEventSkillUrl',
    ),
    revokeEventAgent: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:revokeEventAgent',
    ),
    removeEventAgent: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:removeEventAgent',
    ),
    listSuspiciousRegistrations: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:listSuspiciousRegistrations',
    ),
    listHighVolumeRequesters: makeFunctionReference<'mutation'>(
      'networking/eventOrganizerControls:listHighVolumeRequesters',
    ),
  },
  cards: {
    createCard: makeFunctionReference<'mutation'>('networking/cards:createCard'),
    listCards: makeFunctionReference<'query'>('networking/cards:listCards'),
  },
  inbox: {
    listInbox: makeFunctionReference<'query'>('networking/inbox:listInbox'),
  },
  meetings: {
    requestMeeting: makeFunctionReference<'mutation'>('networking/meetings:requestMeeting'),
    acceptMeeting: makeFunctionReference<'mutation'>('networking/meetings:acceptMeeting'),
    declineMeeting: makeFunctionReference<'mutation'>('networking/meetings:declineMeeting'),
    getMeeting: makeFunctionReference<'query'>('networking/meetings:getMeeting'),
    listMeetings: makeFunctionReference<'query'>('networking/meetings:listMeetings'),
  },
  conversations: {
    getConversation: makeFunctionReference<'query'>('networking/conversations:getConversation'),
    listConversations: makeFunctionReference<'query'>('networking/conversations:listConversations'),
    listMessages: makeFunctionReference<'query'>('networking/conversations:listMessages'),
    sendMessage: makeFunctionReference<'mutation'>('networking/conversations:sendMessage'),
    closeConversation: makeFunctionReference<'mutation'>('networking/conversations:closeConversation'),
  },
  intros: {
    createIntroCandidate: makeFunctionReference<'mutation'>('networking/intros:createIntroCandidate'),
    approveIntroCandidate: makeFunctionReference<'mutation'>('networking/intros:approveIntroCandidate'),
    deferIntroCandidate: makeFunctionReference<'mutation'>('networking/intros:deferIntroCandidate'),
    dismissIntroCandidate: makeFunctionReference<'mutation'>('networking/intros:dismissIntroCandidate'),
    listIntroCandidates: makeFunctionReference<'query'>('networking/intros:listIntroCandidates'),
  },
} as const;

export const handleNetworkingHttp = httpAction(async (ctx, request) => {
  return await handleNetworkingHttpRequest(ctx, request);
});

export async function handleNetworkingHttpRequest(
  ctx: HttpRuntimeContext,
  request: Request,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: new Headers(CORS_HEADERS),
    });
  }

  try {
    const url = new URL(request.url);
    const route = parseApiRoute(url.pathname);

    if (isLegacyPublicRoute(route)) {
      return jsonError(
        'legacy_route_unsupported',
        'Legacy networking routes are not supported in event mode.',
        410,
      );
    }

    if (request.method === 'POST' && route[0] === 'events' && route[2] === 'register') {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.eventAgents.registerEventAgent, {
        eventId: requirePathId(route[1], 'eventId'),
        agentIdentifier: optionalString(body.agentIdentifier, 'agentIdentifier'),
        requesterKey: publicRequesterKey(),
        publicCard: requireValue(body.publicCard, 'publicCard'),
        avatarConfig: body.avatarConfig,
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'owner-sessions' &&
      route.length === 4
    ) {
      const data = await ctx.runQuery(functions.eventAgents.getOwnerReview, {
        reviewToken: requirePathId(route[3], 'reviewToken'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'events' &&
      route[2] === 'owner-sessions' &&
      route.length === 5
    ) {
      const body = await parseJsonObject(request);
      const reviewToken = requirePathId(route[3], 'reviewToken');
      if (route[4] === 'approve') {
        const data = await ctx.runMutation(functions.eventAgents.approveOwnerReview, {
          reviewToken,
        });
        return jsonSuccess(data);
      }
      if (route[4] === 'reject') {
        const data = await ctx.runMutation(functions.eventAgents.rejectOwnerReview, {
          reviewToken,
          reviewNote: optionalString(body.reviewNote, 'reviewNote'),
        });
        return jsonSuccess(data);
      }
      if (route[4] === 'request-changes') {
        const data = await ctx.runMutation(functions.eventAgents.requestOwnerReviewChanges, {
          reviewToken,
          reviewNote: optionalString(body.reviewNote, 'reviewNote'),
        });
        return jsonSuccess(data);
      }
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'space' &&
      route.length === 3
    ) {
      const data = await ctx.runQuery(functions.eventSpaces.getEventSpaceConfig, {
        eventId: requirePathId(route[1], 'eventId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'approved-cards' &&
      route.length === 3
    ) {
      const data = await ctx.runQuery(functions.eventAgents.listApprovedPublicCards, {
        eventId: requirePathId(route[1], 'eventId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'directory' &&
      route.length === 3
    ) {
      const data = await ctx.runMutation(functions.eventDirectory.searchEventDirectory, {
        eventId: requirePathId(route[1], 'eventId'),
        requesterKey: publicRequesterKey(),
        filters: {
          q: optionalQueryParam(url.searchParams, 'q'),
          role: optionalQueryParam(url.searchParams, 'role'),
          category: optionalQueryParam(url.searchParams, 'category'),
          offers: optionalQueryParamList(url.searchParams, 'offers'),
          wants: optionalQueryParamList(url.searchParams, 'wants'),
          lookingFor: optionalQueryParam(url.searchParams, 'lookingFor'),
          hobbies: optionalQueryParamList(url.searchParams, 'hobbies'),
          interests: optionalQueryParamList(url.searchParams, 'interests'),
          favoriteMedia: optionalQueryParamList(url.searchParams, 'favoriteMedia'),
        },
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'events' &&
      route[2] === 'connection-intents' &&
      route.length === 3
    ) {
      const body = await parseJsonObject(request);
      requireExactBodyKeys(body, ['requesterAgentId', 'targetAgentId']);
      const ownerSessionToken = requireEventOwnerToken(request.headers.get('Authorization'));
      const data = await ctx.runMutation(
        functions.eventConnectionIntents.createEventConnectionIntent,
        {
          eventId: requirePathId(route[1], 'eventId'),
          requesterAgentId: requireString(body.requesterAgentId, 'requesterAgentId'),
          targetAgentId: requireString(body.targetAgentId, 'targetAgentId'),
          requesterOwnerSessionToken: ownerSessionToken,
        },
      );
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'agents' &&
      route[4] === 'inbound-intents' &&
      route.length === 5
    ) {
      const data = await ctx.runQuery(functions.eventConnectionIntents.listEventInboundIntents, {
        eventId: requirePathId(route[1], 'eventId'),
        targetAgentId: requirePathId(route[3], 'targetAgentId'),
        ownerSessionToken: requireEventOwnerToken(request.headers.get('Authorization')),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'events' &&
      route[2] === 'agents' &&
      route[4] === 'recipient-rules' &&
      route.length === 5
    ) {
      const body = await parseJsonObject(request);
      requireExactBodyKeys(body, ['rules']);
      const rules = parseRecipientRules(body.rules);
      const data = await ctx.runMutation(functions.eventRecipientRules.upsertEventRecipientRules, {
        eventId: requirePathId(route[1], 'eventId'),
        eventAgentId: requirePathId(route[3], 'eventAgentId'),
        ownerSessionToken: requireEventOwnerToken(request.headers.get('Authorization')),
        rules,
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'events' &&
      route[2] === 'agents' &&
      route[4] === 'private-contact' &&
      route.length === 5
    ) {
      const body = await parseJsonObject(request);
      requireExactBodyKeys(body, ['contact']);
      const data = await ctx.runMutation(functions.eventContactReveal.upsertEventPrivateContact, {
        eventId: requirePathId(route[1], 'eventId'),
        eventAgentId: requirePathId(route[3], 'eventAgentId'),
        ownerSessionToken: requireEventOwnerToken(request.headers.get('Authorization')),
        contact: parsePrivateContact(body.contact),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'events' &&
      route[2] === 'connection-intents' &&
      route[4] === 'decision' &&
      route.length === 5
    ) {
      const body = await parseJsonObject(request);
      requireExactBodyKeys(body, ['decision']);
      const data = await ctx.runMutation(functions.eventContactReveal.decideEventConnectionIntent, {
        eventId: requirePathId(route[1], 'eventId'),
        intentId: requirePathId(route[3], 'intentId'),
        ownerSessionToken: requireEventOwnerToken(request.headers.get('Authorization')),
        decision: requireDecision(body.decision),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'events' &&
      route[2] === 'contact-reveals' &&
      route.length === 4
    ) {
      const data = await ctx.runMutation(functions.eventContactReveal.getEventContactReveal, {
        eventId: requirePathId(route[1], 'eventId'),
        intentId: requirePathId(route[3], 'intentId'),
        ownerSessionToken: requireEventOwnerToken(request.headers.get('Authorization')),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'admin' &&
      route[1] === 'events' &&
      route[3] === 'registration' &&
      route.length === 5
    ) {
      const body = await parseJsonObject(request);
      const eventId = requirePathId(route[2], 'eventId');
      const organizerToken = requireOrganizerToken(request.headers.get('Authorization'));
      const reason = optionalString(body.reason, 'reason');
      if (route[4] === 'pause') {
        const data = await ctx.runMutation(
          functions.eventOrganizerControls.pauseEventRegistration,
          {
            eventId,
            organizerToken,
            reason,
          },
        );
        return jsonSuccess(data);
      }
      if (route[4] === 'resume') {
        const data = await ctx.runMutation(
          functions.eventOrganizerControls.resumeEventRegistration,
          {
            eventId,
            organizerToken,
            reason,
          },
        );
        return jsonSuccess(data);
      }
    }

    if (
      request.method === 'POST' &&
      route[0] === 'admin' &&
      route[1] === 'events' &&
      route[3] === 'skill-url' &&
      route.length === 4
    ) {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.eventOrganizerControls.rotateEventSkillUrl, {
        eventId: requirePathId(route[2], 'eventId'),
        organizerToken: requireOrganizerToken(request.headers.get('Authorization')),
        skillUrl: requireString(body.skillUrl, 'skillUrl'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'admin' &&
      route[1] === 'events' &&
      route[3] === 'agents' &&
      route.length === 6
    ) {
      const body = await parseJsonObject(request);
      const args = {
        eventId: requirePathId(route[2], 'eventId'),
        eventAgentId: requirePathId(route[4], 'eventAgentId'),
        organizerToken: requireOrganizerToken(request.headers.get('Authorization')),
        reason: optionalString(body.reason, 'reason'),
      };
      if (route[5] === 'revoke') {
        const data = await ctx.runMutation(functions.eventOrganizerControls.revokeEventAgent, args);
        return jsonSuccess(data);
      }
      if (route[5] === 'remove') {
        const data = await ctx.runMutation(functions.eventOrganizerControls.removeEventAgent, args);
        return jsonSuccess(data);
      }
    }

    if (
      request.method === 'GET' &&
      route[0] === 'admin' &&
      route[1] === 'events' &&
      route[3] === 'suspicious-registrations' &&
      route.length === 4
    ) {
      const limitRaw = optionalQueryParam(url.searchParams, 'limit');
      const data = await ctx.runMutation(
        functions.eventOrganizerControls.listSuspiciousRegistrations,
        {
          eventId: requirePathId(route[2], 'eventId'),
          organizerToken: requireOrganizerToken(request.headers.get('Authorization')),
          limit: limitRaw === undefined ? undefined : parseInteger(limitRaw, 'limit'),
        },
      );
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'admin' &&
      route[1] === 'events' &&
      route[3] === 'high-volume-requesters' &&
      route.length === 4
    ) {
      const thresholdRaw = optionalQueryParam(url.searchParams, 'threshold');
      const limitRaw = optionalQueryParam(url.searchParams, 'limit');
      const data = await ctx.runMutation(functions.eventOrganizerControls.listHighVolumeRequesters, {
        eventId: requirePathId(route[2], 'eventId'),
        organizerToken: requireOrganizerToken(request.headers.get('Authorization')),
        threshold: thresholdRaw === undefined ? undefined : parseInteger(thresholdRaw, 'threshold'),
        limit: limitRaw === undefined ? undefined : parseInteger(limitRaw, 'limit'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'POST' && route[0] === 'agents' && route[1] === 'register') {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.agents.registerAgent, {
        slug: requireString(body.slug, 'slug'),
        displayName: requireString(body.displayName, 'displayName'),
        description: optionalString(body.description, 'description'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'POST' && route[0] === 'agents' && route[1] === 'mock-claim') {
      const body = await parseJsonObject(request);
      const owner = parseOwnerMetadata(body.owner);
      const data = await ctx.runMutation(functions.agents.mockClaimAgent, {
        claimToken: requireString(body.claimToken, 'claimToken'),
        verificationCode: requireString(body.verificationCode, 'verificationCode'),
        xHandle: requireString(body.xHandle, 'xHandle'),
        owner,
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'agents' && route[1] === 'claim-status') {
      const data = await ctx.runQuery(functions.agents.getClaimStatus, {
        claimToken: requireQueryParam(url.searchParams, 'claimToken'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'POST' && route[0] === 'cards' && route.length === 1) {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.cards.createCard, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        type: requireString(body.type, 'type'),
        title: requireString(body.title, 'title'),
        summary: requireString(body.summary, 'summary'),
        detailsForMatching: requireString(body.detailsForMatching, 'detailsForMatching'),
        tags: optionalStringArray(body.tags, 'tags'),
        domains: optionalStringArray(body.domains, 'domains'),
        desiredOutcome: requireString(body.desiredOutcome, 'desiredOutcome'),
        status: optionalString(body.status, 'status'),
        agentGeneratedAt: optionalNumber(body.agentGeneratedAt, 'agentGeneratedAt'),
        ownerConfirmedAt: optionalNumber(body.ownerConfirmedAt, 'ownerConfirmedAt'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'cards' && route.length === 1) {
      const data = await ctx.runQuery(functions.cards.listCards, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        status: optionalQueryParam(url.searchParams, 'status'),
        type: optionalQueryParam(url.searchParams, 'type'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'inbox' && route.length === 1) {
      const limitRaw = optionalQueryParam(url.searchParams, 'limit');
      const data = await ctx.runQuery(functions.inbox.listInbox, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        status: optionalQueryParam(url.searchParams, 'status'),
        limit: limitRaw === undefined ? undefined : parseInteger(limitRaw, 'limit'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'recommendations' &&
      route[2] === 'request-meeting' &&
      route.length === 3
    ) {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.meetings.requestMeeting, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        recommendationId: requirePathId(route[1], 'recommendationId'),
        requestMessage: optionalString(body.requestMessage, 'requestMessage'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'meetings' && route.length === 1) {
      const data = await ctx.runQuery(functions.meetings.listMeetings, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        status: optionalQueryParam(url.searchParams, 'status'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'meetings' && route.length === 2) {
      const data = await ctx.runQuery(functions.meetings.getMeeting, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        meetingId: requirePathId(route[1], 'meetingId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'meetings' &&
      route[2] === 'accept' &&
      route.length === 3
    ) {
      const data = await ctx.runMutation(functions.meetings.acceptMeeting, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        meetingId: requirePathId(route[1], 'meetingId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'meetings' &&
      route[2] === 'decline' &&
      route.length === 3
    ) {
      const data = await ctx.runMutation(functions.meetings.declineMeeting, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        meetingId: requirePathId(route[1], 'meetingId'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'conversations' && route.length === 1) {
      const data = await ctx.runQuery(functions.conversations.listConversations, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        status: optionalQueryParam(url.searchParams, 'status'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'conversations' && route.length === 2) {
      const data = await ctx.runQuery(functions.conversations.getConversation, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        conversationId: requirePathId(route[1], 'conversationId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'GET' &&
      route[0] === 'conversations' &&
      route[2] === 'messages' &&
      route.length === 3
    ) {
      const data = await ctx.runQuery(functions.conversations.listMessages, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        conversationId: requirePathId(route[1], 'conversationId'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'conversations' &&
      route[2] === 'messages' &&
      route.length === 3
    ) {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.conversations.sendMessage, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        conversationId: requirePathId(route[1], 'conversationId'),
        clientMessageId: requireString(body.clientMessageId, 'clientMessageId'),
        body: requireString(body.body, 'body'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'conversations' &&
      route[2] === 'close' &&
      route.length === 3
    ) {
      const data = await ctx.runMutation(functions.conversations.closeConversation, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        conversationId: requirePathId(route[1], 'conversationId'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'GET' && route[0] === 'intros' && route.length === 1) {
      const data = await ctx.runQuery(functions.intros.listIntroCandidates, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        status: optionalQueryParam(url.searchParams, 'status'),
      });
      return jsonSuccess(data);
    }

    if (request.method === 'POST' && route[0] === 'intros' && route.length === 1) {
      const body = await parseJsonObject(request);
      const data = await ctx.runMutation(functions.intros.createIntroCandidate, {
        apiKey: requireBearerApiKey(request.headers.get('Authorization')),
        conversationId: requireString(body.conversationId, 'conversationId'),
        summary: requireString(body.summary, 'summary'),
        recommendedNextStep: requireString(body.recommendedNextStep, 'recommendedNextStep'),
        explicitlyQualified: optionalBoolean(body.explicitlyQualified, 'explicitlyQualified'),
      });
      return jsonSuccess(data);
    }

    if (
      request.method === 'POST' &&
      route[0] === 'intros' &&
      route[2] &&
      route.length === 3
    ) {
      const introCandidateId = requirePathId(route[1], 'introCandidateId');
      const apiKey = requireBearerApiKey(request.headers.get('Authorization'));
      if (route[2] === 'approve') {
        const data = await ctx.runMutation(functions.intros.approveIntroCandidate, {
          apiKey,
          introCandidateId,
        });
        return jsonSuccess(data);
      }
      if (route[2] === 'defer') {
        const data = await ctx.runMutation(functions.intros.deferIntroCandidate, {
          apiKey,
          introCandidateId,
        });
        return jsonSuccess(data);
      }
      if (route[2] === 'dismiss') {
        const data = await ctx.runMutation(functions.intros.dismissIntroCandidate, {
          apiKey,
          introCandidateId,
        });
        return jsonSuccess(data);
      }
    }

    throw new RouteError('route_not_found', `No API route for ${request.method} ${url.pathname}`, 404);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export function parseBearerAuthorizationHeader(authorizationHeader: string | null): string {
  if (!authorizationHeader) {
    throw new RouteError(
      'invalid_api_key',
      'Authorization header is required. Expected Bearer town_*.',
      401,
    );
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token || extra || !token.startsWith('town_')) {
    throw new RouteError(
      'invalid_api_key',
      'Authorization header must be in the form: Bearer town_*.',
      401,
    );
  }

  return token;
}

function requireBearerApiKey(authorizationHeader: string | null) {
  return parseBearerAuthorizationHeader(authorizationHeader);
}

function requireEventOwnerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    throw new RouteError(
      'invalid_event_owner_token',
      'Authorization header is required. Expected Bearer event_owner_*.',
      401,
    );
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token || extra || !token.startsWith('event_owner_')) {
    throw new RouteError(
      'invalid_event_owner_token',
      'Authorization header must be in the form: Bearer event_owner_*.',
      401,
    );
  }

  return token;
}

function requireOrganizerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    throw new RouteError(
      'invalid_event_organizer_token',
      'Authorization header is required. Expected Bearer organizer token.',
      401,
    );
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token || extra) {
    throw new RouteError(
      'invalid_event_organizer_token',
      'Authorization header must be in the form: Bearer <organizer-token>.',
      401,
    );
  }

  return token;
}

function parseApiRoute(pathname: string) {
  const prefix = '/api/v1/';
  if (!pathname.startsWith(prefix)) {
    throw new RouteError('route_not_found', `Unsupported path: ${pathname}`, 404);
  }

  const tail = pathname.slice(prefix.length);
  const route = tail.split('/').filter(Boolean);
  if (route.length === 0) {
    throw new RouteError('route_not_found', `Unsupported path: ${pathname}`, 404);
  }

  return route;
}

function isLegacyPublicRoute(route: string[]) {
  if (route[0] === 'agents') {
    return true;
  }
  if (['cards', 'inbox', 'meetings', 'conversations', 'intros', 'recommendations'].includes(route[0])) {
    return true;
  }
  return false;
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RouteError('invalid_json', 'Request body must be valid JSON.', 400);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RouteError('invalid_json', 'Request body must be a JSON object.', 400);
  }

  return body as Record<string, unknown>;
}

function parseOwnerMetadata(value: unknown): OwnerMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteError('invalid_request', 'owner must be an object when provided.', 400);
  }

  const owner = value as Record<string, unknown>;
  return {
    displayName: optionalString(owner.displayName, 'owner.displayName'),
    xProfileUrl: optionalString(owner.xProfileUrl, 'owner.xProfileUrl'),
    verificationMethod: optionalVerificationMethod(owner.verificationMethod),
    websiteUrl: optionalString(owner.websiteUrl, 'owner.websiteUrl'),
  };
}

function parseRecipientRules(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteError('invalid_request', 'rules must be an object.', 400);
  }
  const rules = value as Record<string, unknown>;
  requireExactBodyKeys(rules, [
    'blockedAgentIds',
    'allowedCategories',
    'blockedCategories',
    'requiredKeywords',
    'blockedKeywords',
  ]);
  return {
    blockedAgentIds: optionalStringArray(rules.blockedAgentIds, 'rules.blockedAgentIds'),
    allowedCategories: optionalStringArray(rules.allowedCategories, 'rules.allowedCategories'),
    blockedCategories: optionalStringArray(rules.blockedCategories, 'rules.blockedCategories'),
    requiredKeywords: optionalStringArray(rules.requiredKeywords, 'rules.requiredKeywords'),
    blockedKeywords: optionalStringArray(rules.blockedKeywords, 'rules.blockedKeywords'),
  };
}

function parsePrivateContact(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteError('invalid_request', 'contact must be an object.', 400);
  }
  const contact = value as Record<string, unknown>;
  requireExactBodyKeys(contact, [
    'realName',
    'company',
    'email',
    'phone',
    'linkedin',
    'x',
    'website',
  ]);
  return {
    realName: optionalString(contact.realName, 'contact.realName'),
    company: optionalString(contact.company, 'contact.company'),
    email: optionalString(contact.email, 'contact.email'),
    phone: optionalString(contact.phone, 'contact.phone'),
    linkedin: optionalString(contact.linkedin, 'contact.linkedin'),
    x: optionalString(contact.x, 'contact.x'),
    website: optionalString(contact.website, 'contact.website'),
  };
}

function requireDecision(value: unknown) {
  if (value !== 'approve' && value !== 'decline') {
    throw new RouteError(
      'invalid_request',
      'decision must be either approve or decline.',
      400,
    );
  }
  return value;
}

function requireExactBodyKeys(body: Record<string, unknown>, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new RouteError(
      'invalid_request',
      `Unexpected request field: ${unknownKeys[0]}.`,
      400,
    );
  }
}

function optionalVerificationMethod(value: unknown): 'tweet' | 'oauth' | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'tweet' && value !== 'oauth') {
    throw new RouteError(
      'invalid_request',
      'owner.verificationMethod must be either tweet or oauth when provided.',
      400,
    );
  }
  return value;
}

function requirePathId(value: string | undefined, fieldName: string) {
  if (!value) {
    throw new RouteError('invalid_request', `${fieldName} path parameter is required.`, 400);
  }
  return value;
}

function optionalQueryParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value === null ? undefined : value;
}

function optionalQueryParamList(searchParams: URLSearchParams, key: string) {
  const values = searchParams.getAll(key);
  if (values.length === 0) {
    return undefined;
  }
  const items = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return items.length === 0 ? undefined : items;
}

function requireQueryParam(searchParams: URLSearchParams, key: string) {
  const value = optionalQueryParam(searchParams, key);
  if (value === undefined) {
    throw new RouteError('invalid_request', `${key} query parameter is required.`, 400);
  }
  return value;
}

function parseInteger(value: string, fieldName: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new RouteError('invalid_request', `${fieldName} must be an integer.`, 400);
  }
  return parsed;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== 'string') {
    throw new RouteError('invalid_request', `${fieldName} must be a string.`, 400);
  }
  return value;
}

function requireValue(value: unknown, fieldName: string) {
  if (value === undefined) {
    throw new RouteError('invalid_request', `${fieldName} is required.`, 400);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new RouteError('invalid_request', `${fieldName} must be a string when provided.`, 400);
  }
  return value;
}

function optionalNumber(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RouteError('invalid_request', `${fieldName} must be a finite number when provided.`, 400);
  }
  return value;
}

function optionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new RouteError('invalid_request', `${fieldName} must be a boolean when provided.`, 400);
  }
  return value;
}

function publicRequesterKey() {
  return 'unknown-public-requester';
}

function optionalStringArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new RouteError(
      'invalid_request',
      `${fieldName} must be an array of strings when provided.`,
      400,
    );
  }
  return value;
}

function jsonSuccess(data: unknown) {
  const payload: SuccessEnvelope = {
    success: true,
    data,
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: jsonHeaders(),
  });
}

function jsonErrorResponse(error: unknown) {
  if (error instanceof RouteError) {
    return jsonError(error.code, error.message, error.status);
  }

  if (isNetworkingConvexError(error)) {
    return jsonError(error.data.code, error.data.message, statusForNetworkingError(error.data.code));
  }

  return jsonError('internal_error', 'Unexpected server error.', 500);
}

function jsonError(code: string, message: string, status: number) {
  const payload: ErrorEnvelope = {
    success: false,
    error: {
      code,
      message,
    },
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders(),
  });
}

function jsonHeaders() {
  const headers = new Headers(CORS_HEADERS);
  headers.set('Content-Type', 'application/json');
  return headers;
}

function statusForNetworkingError(code: NetworkingErrorCode) {
  if (code === 'invalid_api_key' || code === 'api_key_revoked') {
    return 401;
  }

  if (code === 'invalid_event_owner_token' || code === 'invalid_event_organizer_token') {
    return 401;
  }

  if (code === 'event_rate_limited') {
    return 429;
  }

  if (
    code === 'pending_claim' ||
    code.endsWith('_access_denied') ||
    code === 'event_agent_not_approved' ||
    code === 'event_connection_intent_not_actionable' ||
    code === 'recommendation_not_actionable'
  ) {
    return 403;
  }

  if (code.endsWith('_not_found')) {
    return 404;
  }

  if (
    code === 'duplicate_agent_slug' ||
    code === 'duplicate_event_agent' ||
    code === 'duplicate_event_connection_intent' ||
    code === 'meeting_already_exists' ||
    code === 'duplicate_client_message_id'
  ) {
    return 409;
  }

  return 400;
}

function isNetworkingConvexError(
  error: unknown,
): error is ConvexError<{ code: NetworkingErrorCode; message: string }> {
  if (!(error instanceof ConvexError)) {
    return false;
  }

  const data = (error as ConvexError<any>).data;
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.code === 'string' &&
    typeof data.message === 'string'
  );
}

class RouteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
