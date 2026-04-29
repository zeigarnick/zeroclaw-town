import { useEffect, useMemo, useState } from 'react';
import {
  ApiResponse,
  EventInboundIntentReview,
  EventPublicCard,
  IApiAdapter,
  isError,
} from './api';

type EventInboundReviewProps = {
  apiAdapter: IApiAdapter;
  eventId: string;
  targetAgentId: string;
  ownerSessionToken: string;
  initialIntents?: EventInboundIntentReview[];
  onDecision?: (
    intentId: string,
    decision: 'approve' | 'decline',
  ) => Promise<ApiResponse<unknown>>;
};

const PUBLIC_FIELD_LABELS: Array<{ key: keyof EventPublicCard; label: string }> = [
  { key: 'role', label: 'Role' },
  { key: 'category', label: 'Category' },
  { key: 'offers', label: 'Offers' },
  { key: 'wants', label: 'Wants' },
  { key: 'lookingFor', label: 'Looking for' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'interests', label: 'Interests' },
  { key: 'favoriteMedia', label: 'Favorite media' },
];

export function EventInboundReview({
  apiAdapter,
  eventId,
  targetAgentId,
  ownerSessionToken,
  initialIntents,
  onDecision,
}: EventInboundReviewProps) {
  const [intents, setIntents] = useState<EventInboundIntentReview[]>(initialIntents ?? []);
  const [isLoading, setIsLoading] = useState(!initialIntents);
  const [pendingIntentId, setPendingIntentId] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialIntents) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    apiAdapter.getEventInboundIntents({ eventId, targetAgentId, ownerSessionToken }).then((response) => {
      if (cancelled) {
        return;
      }
      setIsLoading(false);
      if (isError(response)) {
        setErrorMessage(response.error.message);
        return;
      }
      setIntents(response.data);
    });
    return () => {
      cancelled = true;
    };
  }, [apiAdapter, eventId, initialIntents, ownerSessionToken, targetAgentId]);

  const sortedIntents = useMemo(
    () => [...intents].sort((left, right) => right.intent.createdAt - left.intent.createdAt),
    [intents],
  );

  async function submitDecision(intentId: string, decision: 'approve' | 'decline') {
    setPendingIntentId(intentId);
    setErrorMessage('');
    const response = onDecision
      ? await onDecision(intentId, decision)
      : await apiAdapter.decideEventConnectionIntent({
          eventId,
          intentId,
          ownerSessionToken,
          decision,
        });
    setPendingIntentId(undefined);
    if (isError(response)) {
      setErrorMessage(response.error.message);
      return;
    }
    setIntents((current) => current.filter((item) => item.intent.id !== intentId));
  }

  return (
    <section className="h-full overflow-y-auto bg-brown-900 px-4 py-6 text-clay-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="rounded border border-clay-500 bg-clay-900 p-5">
          <p className="text-xs uppercase text-clay-300">Inbound review</p>
          <h1 className="mt-1 text-2xl font-semibold text-balance text-white">
            Connection intents
          </h1>
          <p className="mt-2 text-sm text-pretty text-clay-100">
            Review allowed inbound requests from approved event cards.
          </p>
        </header>

        {isLoading && (
          <div className="rounded border border-clay-500 bg-clay-900 p-5 text-sm">
            Loading inbound requests...
          </div>
        )}
        {errorMessage && (
          <div className="rounded border border-brown-500 bg-clay-900 p-4 text-sm text-brown-200">
            {errorMessage}
          </div>
        )}
        {!isLoading && sortedIntents.length === 0 && (
          <div className="rounded border border-clay-500 bg-clay-900 p-5 text-sm text-clay-100">
            No allowed inbound requests are waiting for review.
          </div>
        )}

        <div className="grid gap-4">
          {sortedIntents.map((item) => (
            <article key={item.intent.id} className="rounded border border-clay-500 bg-clay-900 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase text-clay-300">Requester</p>
                  <h2 className="mt-1 text-lg font-semibold text-balance text-white">
                    {item.requester.displayName}
                  </h2>
                </div>
                <span className="inline-flex items-center rounded border border-clay-500 px-3 py-1 text-xs text-clay-100 tabular-nums">
                  Pending
                </span>
              </div>
              <dl className="mt-4 divide-y divide-clay-700 border-y border-clay-700">
                {getEventPublicCardRows(item.requester.publicCard).map((row) => (
                  <div key={row.label} className="grid gap-2 py-3 sm:grid-cols-3">
                    <dt className="text-sm text-clay-300">{row.label}</dt>
                    <dd className="text-sm text-pretty text-white sm:col-span-2">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => submitDecision(item.intent.id, 'approve')}
                  disabled={pendingIntentId !== undefined}
                  className="rounded bg-clay-100 px-4 py-2 text-sm font-semibold text-brown-900 hover:bg-clay-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingIntentId === item.intent.id ? 'Reviewing...' : 'Approve reveal'}
                </button>
                <button
                  type="button"
                  onClick={() => submitDecision(item.intent.id, 'decline')}
                  disabled={pendingIntentId !== undefined}
                  className="rounded border border-brown-500 px-4 py-2 text-sm font-semibold text-brown-200 hover:bg-brown-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function getEventPublicCardRows(publicCard: EventPublicCard) {
  return PUBLIC_FIELD_LABELS.map(({ key, label }) => {
    const value = publicCard[key];
    if (Array.isArray(value)) {
      return { label, value: value.join(', ') || 'None provided' };
    }
    return { label, value: value || 'None provided' };
  });
}
