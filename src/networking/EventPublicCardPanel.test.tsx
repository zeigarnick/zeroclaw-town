import { renderToStaticMarkup } from 'react-dom/server';
import { EventPublicCardPanel } from './EventPublicCardPanel';
import type { EventTownMarker } from './eventTownMarkers';

function markerFixture(): EventTownMarker {
  return {
    key: 'demo-event:public-marker-42',
    displayName: 'Cedar Scout 123',
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
      accessory: 'glasses',
    },
    avatarSummary: 'Hair: curly | Skin tone: tone-3 | Clothing: jacket | Accessory: glasses',
    publicCard: {
      role: 'Founder',
      category: 'Climate',
      offers: ['GTM help'],
      wants: ['seed feedback'],
      lookingFor: 'Climate operators',
      hobbies: ['cycling'],
      interests: ['energy'],
      favoriteMedia: ['The Expanse'],
    },
    x: 10,
    y: 20,
    fill: 0x8f563b,
    accent: 0x3a4466,
  };
}

describe('EventPublicCardPanel', () => {
  test('renders only display-safe public-card fields and a close action', () => {
    const marker = markerFixture() as EventTownMarker & {
      eventAgentId?: string;
      ownerSessionToken?: string;
      email?: string;
      publicCard: EventTownMarker['publicCard'] & { linkedin?: string };
    };
    marker.eventAgentId = 'eventAgents:private-raw-id';
    marker.ownerSessionToken = 'event_owner_private';
    marker.email = 'person@example.com';
    marker.publicCard.linkedin = 'https://linkedin.com/in/private';

    const markup = renderToStaticMarkup(
      <EventPublicCardPanel marker={marker} onClose={() => undefined} />,
    );

    expect(markup).toContain('Cedar Scout 123');
    expect(markup).toContain('Founder');
    expect(markup).toContain('Climate');
    expect(markup).toContain('GTM help');
    expect(markup).toContain('seed feedback');
    expect(markup).toContain('Climate operators');
    expect(markup).toContain('cycling');
    expect(markup).toContain('energy');
    expect(markup).toContain('The Expanse');
    expect(markup).toContain('Close');
    expect(markup).not.toContain('eventAgents:private-raw-id');
    expect(markup).not.toContain('event_owner_private');
    expect(markup).not.toContain('person@example.com');
    expect(markup).not.toContain('linkedin');
    expect(markup).not.toContain('Connect');
    expect(markup).not.toContain('Chat');
    expect(markup).not.toContain('Reveal');
  });
});
