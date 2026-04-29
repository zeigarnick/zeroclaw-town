import { renderToStaticMarkup } from 'react-dom/server';
import { EventPublicCardPanel } from './EventPublicCardPanel';
import type { NetworkingTownAgent } from '../../convex/networking/townProjection';

function agentFixture(): Pick<NetworkingTownAgent, 'displayName' | 'avatarConfig' | 'publicCard'> {
  return {
    displayName: 'Cedar Scout 123',
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
      accessory: 'glasses',
    },
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
  };
}

describe('EventPublicCardPanel', () => {
  test('renders only display-safe public-card fields and a close action', () => {
    const agent = agentFixture() as ReturnType<typeof agentFixture> & {
      eventAgentId?: string;
      ownerSessionToken?: string;
      email?: string;
      publicCard: NonNullable<NetworkingTownAgent['publicCard']> & { linkedin?: string };
    };
    agent.eventAgentId = 'eventAgents:private-raw-id';
    agent.ownerSessionToken = 'event_owner_private';
    agent.email = 'person@example.com';
    agent.publicCard.linkedin = 'https://linkedin.com/in/private';

    const markup = renderToStaticMarkup(
      <EventPublicCardPanel agent={agent} onClose={() => undefined} />,
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
