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
  test('renders pseudonymous match alert copy and aggregate count', () => {
    const markup = renderToStaticMarkup(<EventMatchAlerts activity={activityFixture()} />);

    expect(markup).toContain('Matches');
    expect(markup).toContain('7');
    expect(markup).toContain('Cedar Scout');
    expect(markup).toContain('matched with');
    expect(markup).toContain('Orbit Builder');
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
