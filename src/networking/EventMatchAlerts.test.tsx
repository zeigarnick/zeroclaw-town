import { renderToStaticMarkup } from 'react-dom/server';
import { EventMatchAlerts } from './EventMatchAlerts';
import type { NetworkingTownProjection } from '../../convex/networking/townProjection';

function activityFixture(): NonNullable<NetworkingTownProjection['eventActivity']> {
  return {
    matchCount: 7,
    updatedAt: 1710000000000,
    recent: [
      {
        type: 'match_created',
        requesterDisplayName: 'Cedar Scout',
        targetDisplayName: 'Orbit Builder',
        payload: {
          matchKind: 'recipient_approved',
        },
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
    ],
  };
}

describe('EventMatchAlerts', () => {
  test('renders compact aggregate count without old alert-card copy', () => {
    const markup = renderToStaticMarkup(<EventMatchAlerts activity={activityFixture()} />);

    expect(markup).toContain('Matches');
    expect(markup).toContain('7');
    expect(markup).not.toContain('Cedar Scout');
    expect(markup).not.toContain('matched with');
    expect(markup).not.toContain('Orbit Builder');
    expect(markup).not.toContain('aria-live');
  });

  test('omits private contact and source identifiers from unexpected activity data', () => {
    const activity = activityFixture() as NonNullable<NetworkingTownProjection['eventActivity']> & {
      sourceIntentId?: string;
      requesterContact?: {
        email: string;
      };
      recent: Array<
        NonNullable<NetworkingTownProjection['eventActivity']>['recent'][number] & {
          sourceIntentId?: string;
          email?: string;
        }
      >;
    };
    activity.sourceIntentId = 'eventConnectionIntents:1';
    activity.requesterContact = { email: 'person@example.com' };
    activity.recent[0].sourceIntentId = 'eventConnectionIntents:1';
    activity.recent[0].email = 'person@example.com';

    const markup = renderToStaticMarkup(<EventMatchAlerts activity={activity} />);

    expect(markup).not.toContain('eventConnectionIntents');
    expect(markup).not.toContain('person@example.com');
    expect(markup).not.toContain('Contact');
    expect(markup).not.toContain('Reveal');
  });
});
