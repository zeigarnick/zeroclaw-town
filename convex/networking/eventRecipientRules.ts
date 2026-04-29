import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation } from '../_generated/server';
import { networkingError } from './auth';
import { normalizeEventId } from './eventAgents';
import { EventPublicCard } from './eventCards';
import { MAX_EVENT_PUBLIC_LIST_ITEMS, MAX_EVENT_PUBLIC_TEXT_LENGTH } from './validators';

export type EventRecipientRuleSet = {
  blockedAgentIds: Id<'eventAgents'>[];
  allowedCategories: string[];
  blockedCategories: string[];
  requiredKeywords: string[];
  blockedKeywords: string[];
};

export type EventRecipientRuleEvaluation = {
  allowed: boolean;
  reasons: string[];
  evaluatedAt: number;
};

type UpsertEventRecipientRulesArgs = {
  eventId: string;
  eventAgentId: Id<'eventAgents'>;
  rules: Partial<EventRecipientRuleSet>;
};

export const upsertEventRecipientRules = mutation({
  args: {
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    rules: v.object({
      blockedAgentIds: v.optional(v.array(v.id('eventAgents'))),
      allowedCategories: v.optional(v.array(v.string())),
      blockedCategories: v.optional(v.array(v.string())),
      requiredKeywords: v.optional(v.array(v.string())),
      blockedKeywords: v.optional(v.array(v.string())),
    }),
  },
  handler: (ctx, args) => upsertEventRecipientRulesHandler(ctx, args),
});

export async function upsertEventRecipientRulesHandler(
  ctx: MutationCtx,
  args: UpsertEventRecipientRulesArgs,
) {
  const eventId = normalizeEventId(args.eventId);
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

  const rules = normalizeRecipientRules(args.rules);
  const now = Date.now();
  const existing = await ctx.db
    .query('eventRecipientRules')
    .withIndex('by_event_agent', (q) => q.eq('eventAgentId', args.eventAgentId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      eventId,
      rules,
      approvedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw networkingError('event_agent_not_found', 'Recipient rules could not be loaded.');
    }
    return updated;
  }

  const ruleId = await ctx.db.insert('eventRecipientRules', {
    eventId,
    eventAgentId: args.eventAgentId,
    rules,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(ruleId);
  if (!created) {
    throw networkingError('event_agent_not_found', 'Recipient rules could not be loaded.');
  }
  return created;
}

export async function evaluateRecipientRules(
  ctx: QueryCtx | MutationCtx,
  args: {
    eventId: string;
    requesterAgent: Doc<'eventAgents'>;
    requesterCard: Doc<'eventNetworkingCards'>;
    recipientAgent: Doc<'eventAgents'>;
  },
): Promise<EventRecipientRuleEvaluation> {
  const now = Date.now();
  const rulesRow = await ctx.db
    .query('eventRecipientRules')
    .withIndex('by_event_agent', (q) => q.eq('eventAgentId', args.recipientAgent._id))
    .first();
  if (!rulesRow || rulesRow.eventId !== args.eventId) {
    return {
      allowed: true,
      reasons: ['no_recipient_rules_configured'],
      evaluatedAt: now,
    };
  }

  const rules = rulesRow.rules;
  const reasons: string[] = [];
  if (rules.blockedAgentIds.includes(args.requesterAgent._id)) {
    reasons.push('requester_blocked_by_recipient_rule');
  }
  if (categoryMatches(args.requesterCard.publicCard.category, rules.blockedCategories)) {
    reasons.push('requester_category_blocked_by_recipient_rule');
  }
  if (
    rules.allowedCategories.length > 0 &&
    !categoryMatches(args.requesterCard.publicCard.category, rules.allowedCategories)
  ) {
    reasons.push('requester_category_not_allowed_by_recipient_rule');
  }
  if (containsAnyPublicKeyword(args.requesterCard.publicCard, rules.blockedKeywords)) {
    reasons.push('requester_public_card_blocked_by_recipient_keyword_rule');
  }
  if (!containsAllPublicKeywords(args.requesterCard.publicCard, rules.requiredKeywords)) {
    reasons.push('requester_public_card_missing_required_recipient_keyword_rule');
  }

  return {
    allowed: reasons.length === 0,
    reasons: reasons.length === 0 ? ['recipient_rules_allowed'] : reasons,
    evaluatedAt: now,
  };
}

function normalizeRecipientRules(rules: Partial<EventRecipientRuleSet>): EventRecipientRuleSet {
  return {
    blockedAgentIds: Array.from(new Set(rules.blockedAgentIds ?? [])),
    allowedCategories: normalizeTextList(rules.allowedCategories, 'allowedCategories'),
    blockedCategories: normalizeTextList(rules.blockedCategories, 'blockedCategories'),
    requiredKeywords: normalizeTextList(rules.requiredKeywords, 'requiredKeywords'),
    blockedKeywords: normalizeTextList(rules.blockedKeywords, 'blockedKeywords'),
  };
}

function normalizeTextList(value: string[] | undefined, fieldName: string) {
  const normalized = (value ?? []).map((item) => item.trim()).filter(Boolean);
  if (normalized.length > MAX_EVENT_PUBLIC_LIST_ITEMS) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} can include at most ${MAX_EVENT_PUBLIC_LIST_ITEMS} items.`,
    );
  }
  for (const item of normalized) {
    if (item.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
      throw networkingError(
        'invalid_public_field',
        `${fieldName} items must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
      );
    }
  }
  return Array.from(new Set(normalized));
}

function categoryMatches(category: string | undefined, filters: string[]) {
  if (!category) {
    return false;
  }
  const normalizedCategory = normalizeSearchText([category]);
  return filters.some((filter) => normalizedCategory.includes(normalizeSearchText([filter])));
}

function containsAnyPublicKeyword(publicCard: EventPublicCard, keywords: string[]) {
  if (keywords.length === 0) {
    return false;
  }
  const haystack = publicCardSearchText(publicCard);
  return keywords.some((keyword) => haystack.includes(normalizeSearchText([keyword])));
}

function containsAllPublicKeywords(publicCard: EventPublicCard, keywords: string[]) {
  if (keywords.length === 0) {
    return true;
  }
  const haystack = publicCardSearchText(publicCard);
  return keywords.every((keyword) => haystack.includes(normalizeSearchText([keyword])));
}

function publicCardSearchText(publicCard: EventPublicCard) {
  return normalizeSearchText([
    publicCard.role,
    publicCard.category,
    publicCard.lookingFor,
    ...publicCard.offers,
    ...publicCard.wants,
    ...publicCard.hobbies,
    ...publicCard.interests,
    ...publicCard.favoriteMedia,
  ]);
}

function normalizeSearchText(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
