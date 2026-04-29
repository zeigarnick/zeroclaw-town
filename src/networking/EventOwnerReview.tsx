import { useEffect, useMemo, useState } from 'react';
import {
  ApiResponse,
  EventOwnerReviewData,
  EventPublicCard,
  IApiAdapter,
  isError,
} from './api';

type EventOwnerReviewProps = {
  apiAdapter: IApiAdapter;
  eventId: string;
  reviewToken: string;
  initialReview?: EventOwnerReviewData;
};

type ReviewAction = 'approve' | 'reject' | 'request-changes';

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

export function EventOwnerReview({
  apiAdapter,
  eventId,
  reviewToken,
  initialReview,
}: EventOwnerReviewProps) {
  const [review, setReview] = useState<EventOwnerReviewData | undefined>(initialReview);
  const [reviewNote, setReviewNote] = useState('');
  const [isLoading, setIsLoading] = useState(!initialReview);
  const [pendingAction, setPendingAction] = useState<ReviewAction | undefined>();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialReview) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    apiAdapter.getEventOwnerReview(eventId, reviewToken).then((response) => {
      if (cancelled) {
        return;
      }
      setIsLoading(false);
      if (isError(response)) {
        setErrorMessage(response.error.message);
        return;
      }
      setReview(response.data);
    });
    return () => {
      cancelled = true;
    };
  }, [apiAdapter, eventId, initialReview, reviewToken]);

  const publicRows = useMemo(
    () => (review ? getEventPublicCardRows(review.publicCard) : []),
    [review],
  );

  async function submitAction(action: ReviewAction) {
    setPendingAction(action);
    setErrorMessage('');
    const response = await submitEventOwnerReviewAction(apiAdapter, {
      eventId,
      reviewToken,
      action,
      reviewNote,
    });
    setPendingAction(undefined);
    if (isError(response)) {
      setErrorMessage(response.error.message);
      return;
    }
    setReview(response.data);
    setReviewNote('');
  }

  if (isLoading) {
    return (
      <section className="flex h-full items-center justify-center bg-brown-900 p-6 text-clay-100">
        <div className="rounded border border-clay-500 bg-clay-900 p-5 text-sm">
          Loading review...
        </div>
      </section>
    );
  }

  if (!review) {
    return (
      <section className="flex h-full items-center justify-center bg-brown-900 p-6 text-clay-100">
        <div className="max-w-md rounded border border-clay-500 bg-clay-900 p-5">
          <h1 className="text-lg font-semibold text-balance">Event card review unavailable</h1>
          {errorMessage && <p className="mt-3 text-sm text-clay-100">{errorMessage}</p>}
        </div>
      </section>
    );
  }

  const isPending = review.sessionStatus === 'pending';

  return (
    <section className="h-full overflow-y-auto bg-brown-900 px-4 py-6 text-clay-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="rounded border border-clay-500 bg-clay-900 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase text-clay-300">Owner review</p>
              <h1 className="mt-1 text-2xl font-semibold text-balance text-white">
                {review.displayName}
              </h1>
              <p className="mt-2 text-sm text-pretty text-clay-100">
                Approve exactly these public fields before this event card becomes searchable.
              </p>
            </div>
            <StatusBadge status={review.sessionStatus} />
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded border border-clay-500 bg-clay-900 p-5 lg:col-span-1">
            <h2 className="text-sm font-semibold text-white">Avatar config</h2>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded border border-clay-500 bg-brown-800 text-sm text-white">
                {review.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 text-sm text-clay-100">
                <p>Hair: {review.avatarConfig.hair}</p>
                <p>Skin tone: {review.avatarConfig.skinTone}</p>
                <p>Clothing: {review.avatarConfig.clothing}</p>
                {review.avatarConfig.hat && <p>Hat: {review.avatarConfig.hat}</p>}
                {review.avatarConfig.accessory && (
                  <p>Accessory: {review.avatarConfig.accessory}</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded border border-clay-500 bg-clay-900 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-white">Public card fields</h2>
            <dl className="mt-4 divide-y divide-clay-700 border-y border-clay-700">
              {publicRows.map((row) => (
                <div key={row.label} className="grid gap-2 py-3 sm:grid-cols-3">
                  <dt className="text-sm text-clay-300">{row.label}</dt>
                  <dd className="text-sm text-pretty text-white sm:col-span-2">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section className="rounded border border-clay-500 bg-clay-900 p-5">
          <label className="block text-sm font-semibold text-white" htmlFor="review-note">
            Review note
          </label>
          <textarea
            id="review-note"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Optional note for rejection or requested changes"
            className="mt-3 block min-h-24 w-full rounded border-clay-500 bg-brown-900 text-sm text-white placeholder:text-clay-300 focus:border-clay-300 focus:ring-clay-300"
            disabled={!isPending}
          />
          {errorMessage && <p className="mt-3 text-sm text-brown-300">{errorMessage}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submitAction('approve')}
              disabled={!isPending || pendingAction !== undefined}
              className="rounded bg-clay-100 px-4 py-2 text-sm font-semibold text-brown-900 hover:bg-clay-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => submitAction('request-changes')}
              disabled={!isPending || pendingAction !== undefined}
              className="rounded border border-clay-500 px-4 py-2 text-sm font-semibold text-white hover:bg-clay-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === 'request-changes' ? 'Requesting...' : 'Request changes'}
            </button>
            <button
              type="button"
              onClick={() => submitAction('reject')}
              disabled={!isPending || pendingAction !== undefined}
              className="rounded border border-brown-500 px-4 py-2 text-sm font-semibold text-brown-200 hover:bg-brown-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === 'reject' ? 'Rejecting...' : 'Reject'}
            </button>
          </div>
        </section>
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

export function submitEventOwnerReviewAction(
  apiAdapter: IApiAdapter,
  req: {
    eventId: string;
    reviewToken: string;
    action: ReviewAction;
    reviewNote?: string;
  },
): Promise<ApiResponse<EventOwnerReviewData>> {
  return apiAdapter.reviewEventOwnerCard(req);
}

function StatusBadge({ status }: { status: EventOwnerReviewData['sessionStatus'] }) {
  const label =
    status === 'changes_requested'
      ? 'Changes requested'
      : status.slice(0, 1).toUpperCase() + status.slice(1);
  return (
    <span className="inline-flex items-center rounded border border-clay-500 px-3 py-1 text-xs text-clay-100 tabular-nums">
      {label}
    </span>
  );
}
