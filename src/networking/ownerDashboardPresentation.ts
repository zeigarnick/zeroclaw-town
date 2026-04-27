import { Card, Conversation, InboxEvent, IntroCandidate, Meeting } from './api';

export type DashboardTab =
  | 'overview'
  | 'cards'
  | 'matches'
  | 'conversations'
  | 'intros'
  | 'developer';

export type NextAction = {
  id: string;
  title: string;
  body: string;
  tab: DashboardTab;
  priority: string;
};

export type TabDefinition = {
  id: DashboardTab;
  label: string;
};

export const OWNER_DASHBOARD_TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cards', label: 'Cards' },
  { id: 'matches', label: 'Matches' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'intros', label: 'Intros' },
  { id: 'developer', label: 'Developer' },
];

export function getDefaultOwnerDashboardTab(): DashboardTab {
  return 'overview';
}

export function formatEventType(type: string) {
  if (!type) {
    return 'Activity';
  }
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatStatusLabel(status: string) {
  if (!status) {
    return 'Unknown';
  }
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildOwnerNextActions({
  cards,
  inboxEvents,
  meetings,
  conversations,
  intros,
}: {
  cards: Card[];
  inboxEvents: InboxEvent[];
  meetings: Meeting[];
  conversations: Conversation[];
  intros: IntroCandidate[];
}): NextAction[] {
  const actions: NextAction[] = [];
  const pendingIntros = intros.filter((intro) => intro.status === 'pending' || intro.status === 'ready');
  const pendingMeetings = meetings.filter((meeting) => meeting.status === 'pending');
  const recommendations = inboxEvents.filter(
    (event) => event.type === 'match_recommendation' && event.recommendationId,
  );
  const openConversations = conversations.filter((conversation) => conversation.status !== 'closed');

  if (pendingIntros.length > 0) {
    actions.push({
      id: 'pending-intros',
      title: `${pendingIntros.length} intro ${pendingIntros.length === 1 ? 'candidate needs' : 'candidates need'} review`,
      body: 'Approve, defer, or dismiss the human handoff recommendations from agent conversations.',
      tab: 'intros',
      priority: 'Review',
    });
  }

  if (pendingMeetings.length > 0) {
    actions.push({
      id: 'pending-meetings',
      title: `${pendingMeetings.length} meeting ${pendingMeetings.length === 1 ? 'request is' : 'requests are'} waiting`,
      body: 'Decide whether the agent should accept the pending meeting request.',
      tab: 'matches',
      priority: 'Decision',
    });
  }

  if (recommendations.length > 0) {
    actions.push({
      id: 'recommendations',
      title: `${recommendations.length} match ${recommendations.length === 1 ? 'recommendation is' : 'recommendations are'} available`,
      body: 'Review the suggested fit and request a meeting when the match looks useful.',
      tab: 'matches',
      priority: 'Match',
    });
  }

  if (openConversations.length > 0) {
    actions.push({
      id: 'open-conversations',
      title: `${openConversations.length} open ${openConversations.length === 1 ? 'conversation' : 'conversations'}`,
      body: 'Review the transcript, send a follow-up, or close the conversation when it is qualified.',
      tab: 'conversations',
      priority: 'Follow up',
    });
  }

  if (cards.length === 0) {
    actions.push({
      id: 'create-card',
      title: 'Create the first match card',
      body: 'Publish one clear need, offer, or exchange so the agent can enter matching.',
      tab: 'cards',
      priority: 'Setup',
    });
  }

  return actions;
}
