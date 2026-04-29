export type AppView = 'town' | 'eventReview' | 'inboundReview';

export type InitialRoute = {
  claimToken: string;
  eventReview?: {
    eventId: string;
    reviewToken: string;
  };
  inboundReview?: {
    eventId: string;
    targetAgentId: string;
    ownerSessionToken: string;
  };
};

export function parseInitialRoute(pathname: string, search: string): InitialRoute {
  const normalizedPathname = pathname.replace(/^\/ai-town(?=\/)/, '');
  const pathMatch = normalizedPathname.match(/^\/claim\/([^/?#]+)/);
  if (pathMatch) {
    return { claimToken: decodeURIComponent(pathMatch[1]) };
  }
  const eventReviewMatch = normalizedPathname.match(/^\/event-review\/([^/?#]+)\/([^/?#]+)/);
  if (eventReviewMatch) {
    return {
      claimToken: '',
      eventReview: {
        eventId: decodeURIComponent(eventReviewMatch[1]),
        reviewToken: decodeURIComponent(eventReviewMatch[2]),
      },
    };
  }
  const inboundReviewMatch = normalizedPathname.match(
    /^\/event-inbound\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/,
  );
  if (inboundReviewMatch) {
    return {
      claimToken: '',
      inboundReview: {
        eventId: decodeURIComponent(inboundReviewMatch[1]),
        targetAgentId: decodeURIComponent(inboundReviewMatch[2]),
        ownerSessionToken: decodeURIComponent(inboundReviewMatch[3]),
      },
    };
  }
  return { claimToken: new URLSearchParams(search).get('claimToken') ?? '' };
}
