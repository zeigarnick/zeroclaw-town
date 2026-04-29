import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, mutation } from '../_generated/server';
import { networkingError } from './auth';
import { createMatchActivityForApprovedIntent } from './eventActivity';
import { toEventConnectionIntentView } from './eventConnectionIntents';
import { authenticateApprovedEventOwnerSession, normalizeEventId } from './eventAgents';
import { enforceEventRateLimit } from './eventRateLimits';
import { MAX_EVENT_PUBLIC_TEXT_LENGTH } from './validators';

export type EventPrivateContact = {
  realName?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  x?: string;
  website?: string;
};

export type EventContactRevealView = {
  id: Id<'eventContactReveals'>;
  eventId: string;
  intentId: Id<'eventConnectionIntents'>;
  requesterAgentId: Id<'eventAgents'>;
  targetAgentId: Id<'eventAgents'>;
  requesterContact: EventPrivateContact;
  targetContact: EventPrivateContact;
  createdAt: number;
  updatedAt: number;
};

type UpsertEventPrivateContactArgs = {
  eventId: string;
  eventAgentId: Id<'eventAgents'>;
  ownerSessionToken: string;
  contact: EventPrivateContact;
};

type DecideEventConnectionIntentArgs = {
  eventId: string;
  intentId: Id<'eventConnectionIntents'>;
  ownerSessionToken: string;
  decision: 'approve' | 'decline';
};

type GetEventContactRevealArgs = {
  eventId: string;
  intentId: Id<'eventConnectionIntents'>;
  ownerSessionToken: string;
};

export const upsertEventPrivateContact = mutation({
  args: {
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    ownerSessionToken: v.string(),
    contact: v.object({
      realName: v.optional(v.string()),
      company: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      x: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
  },
  handler: (ctx, args) => upsertEventPrivateContactHandler(ctx, args),
});

export const decideEventConnectionIntent = mutation({
  args: {
    eventId: v.string(),
    intentId: v.id('eventConnectionIntents'),
    ownerSessionToken: v.string(),
    decision: v.union(v.literal('approve'), v.literal('decline')),
  },
  handler: (ctx, args) => decideEventConnectionIntentHandler(ctx, args),
});

export const getEventContactReveal = mutation({
  args: {
    eventId: v.string(),
    intentId: v.id('eventConnectionIntents'),
    ownerSessionToken: v.string(),
  },
  handler: (ctx, args) => getEventContactRevealHandler(ctx, args),
});

export async function upsertEventPrivateContactHandler(
  ctx: MutationCtx,
  args: UpsertEventPrivateContactArgs,
) {
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventContactReveal', [eventId, args.eventAgentId]);
  const agent = await ctx.db.get(args.eventAgentId);
  if (!agent || agent.eventId !== eventId) {
    throw networkingError(
      'event_agent_not_found',
      'eventAgentId must reference an event agent in this event.',
    );
  }
  if (agent.approvalStatus !== 'approved') {
    throw networkingError(
      'event_agent_not_approved',
      'eventAgentId must reference an approved event agent.',
    );
  }
  await authenticateApprovedEventOwnerSession(ctx, {
    eventId,
    eventAgentId: agent._id,
    ownerSessionToken: args.ownerSessionToken,
  });

  const contact = normalizePrivateContact(args.contact);
  const now = Date.now();
  const existing = await ctx.db
    .query('eventPrivateContacts')
    .withIndex('by_event_agent', (q) => q.eq('eventAgentId', args.eventAgentId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      eventId,
      contact,
      approvedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw networkingError('event_agent_not_found', 'Private contact could not be loaded.');
    }
    return updated;
  }

  const contactId = await ctx.db.insert('eventPrivateContacts', {
    eventId,
    eventAgentId: args.eventAgentId,
    contact,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(contactId);
  if (!created) {
    throw networkingError('event_agent_not_found', 'Private contact could not be loaded.');
  }
  return created;
}

export async function decideEventConnectionIntentHandler(
  ctx: MutationCtx,
  args: DecideEventConnectionIntentArgs,
) {
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventContactReveal', [eventId, args.intentId, args.decision]);
  const recipientAuth = await authenticateApprovedEventOwnerSession(ctx, {
    eventId,
    ownerSessionToken: args.ownerSessionToken,
  });
  const intent = await getActionableIntent(ctx, eventId, args.intentId, recipientAuth.agent._id);
  const now = Date.now();

  if (args.decision === 'decline') {
    await ctx.db.patch(intent._id, {
      status: 'recipient_declined',
      decidedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(intent._id);
    if (!updated) {
      throw networkingError(
        'event_connection_intent_not_found',
        'The connection intent could not be loaded.',
      );
    }
    return {
      intent: toEventConnectionIntentView(updated),
      reveal: null,
    };
  }

  const reveal = await createContactReveal(ctx, intent, now);
  await ctx.db.patch(intent._id, {
    status: 'recipient_approved',
    decidedAt: now,
    updatedAt: now,
  });
  const updated = await ctx.db.get(intent._id);
  if (!updated) {
    throw networkingError(
      'event_connection_intent_not_found',
      'The connection intent could not be loaded.',
    );
  }
  await createMatchActivityForApprovedIntent(ctx, updated, now);
  return {
    intent: toEventConnectionIntentView(updated),
    reveal,
  };
}

export async function getEventContactRevealHandler(
  ctx: MutationCtx,
  args: GetEventContactRevealArgs,
): Promise<EventContactRevealView> {
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventContactReveal', [eventId, args.intentId]);
  const viewerAuth = await authenticateApprovedEventOwnerSession(ctx, {
    eventId,
    ownerSessionToken: args.ownerSessionToken,
  });
  const reveal = await ctx.db
    .query('eventContactReveals')
    .withIndex('by_intent', (q) => q.eq('intentId', args.intentId))
    .first();
  if (!reveal || reveal.eventId !== eventId) {
    throw networkingError(
      'event_contact_reveal_not_found',
      'The contact reveal could not be loaded.',
    );
  }
  if (
    viewerAuth.agent._id !== reveal.requesterAgentId &&
    viewerAuth.agent._id !== reveal.targetAgentId
  ) {
    throw networkingError(
      'event_connection_intent_access_denied',
      'Only participants can view this contact reveal.',
    );
  }
  return toEventContactRevealView(reveal);
}

async function getActionableIntent(
  ctx: MutationCtx,
  eventId: string,
  intentId: Id<'eventConnectionIntents'>,
  recipientAgentId: Id<'eventAgents'>,
) {
  const intent = await ctx.db.get(intentId);
  if (!intent || intent.eventId !== eventId) {
    throw networkingError(
      'event_connection_intent_not_found',
      'The connection intent could not be loaded.',
    );
  }
  if (intent.targetAgentId !== recipientAgentId) {
    throw networkingError(
      'event_connection_intent_access_denied',
      'Only the recipient event agent can decide this connection intent.',
    );
  }
  if (intent.status !== 'pending_recipient_review') {
    throw networkingError(
      'event_connection_intent_not_actionable',
      'Only pending inbound connection intents can be decided.',
    );
  }
  return intent;
}

async function createContactReveal(
  ctx: MutationCtx,
  intent: Doc<'eventConnectionIntents'>,
  now: number,
): Promise<EventContactRevealView> {
  const [requesterContact, targetContact] = await Promise.all([
    getPrivateContact(ctx, intent.eventId, intent.requesterAgentId),
    getPrivateContact(ctx, intent.eventId, intent.targetAgentId),
  ]);
  const revealId = await ctx.db.insert('eventContactReveals', {
    eventId: intent.eventId,
    intentId: intent._id,
    requesterAgentId: intent.requesterAgentId,
    targetAgentId: intent.targetAgentId,
    requesterContact,
    targetContact,
    createdAt: now,
    updatedAt: now,
  });
  const reveal = await ctx.db.get(revealId);
  if (!reveal) {
    throw networkingError(
      'event_contact_reveal_not_found',
      'The contact reveal could not be loaded.',
    );
  }
  return toEventContactRevealView(reveal);
}

async function getPrivateContact(
  ctx: MutationCtx,
  eventId: string,
  eventAgentId: Id<'eventAgents'>,
): Promise<EventPrivateContact> {
  const row = await ctx.db
    .query('eventPrivateContacts')
    .withIndex('by_event_agent', (q) => q.eq('eventAgentId', eventAgentId))
    .first();
  if (!row || row.eventId !== eventId) {
    return {};
  }
  return row.contact;
}

function toEventContactRevealView(reveal: Doc<'eventContactReveals'>): EventContactRevealView {
  return {
    id: reveal._id,
    eventId: reveal.eventId,
    intentId: reveal.intentId,
    requesterAgentId: reveal.requesterAgentId,
    targetAgentId: reveal.targetAgentId,
    requesterContact: reveal.requesterContact,
    targetContact: reveal.targetContact,
    createdAt: reveal.createdAt,
    updatedAt: reveal.updatedAt,
  };
}

function normalizePrivateContact(contact: EventPrivateContact): EventPrivateContact {
  const normalized: EventPrivateContact = {};
  setContactField(normalized, 'realName', normalizeContactText(contact.realName, 'realName'));
  setContactField(normalized, 'company', normalizeContactText(contact.company, 'company'));
  setContactField(normalized, 'email', normalizeContactText(contact.email, 'email'));
  setContactField(normalized, 'phone', normalizeContactText(contact.phone, 'phone'));
  setContactField(normalized, 'linkedin', normalizeContactText(contact.linkedin, 'linkedin'));
  setContactField(normalized, 'x', normalizeContactText(contact.x, 'x'));
  setContactField(normalized, 'website', normalizeContactText(contact.website, 'website'));
  return normalized;
}

function setContactField(
  contact: EventPrivateContact,
  fieldName: keyof EventPrivateContact,
  value: string | undefined,
) {
  if (value !== undefined) {
    contact[fieldName] = value;
  }
}

function normalizeContactText(value: string | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}
