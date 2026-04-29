import { pruneNpcWorldState, townNpcsEnabled } from './townNpcs';

describe('town NPC flag', () => {
  test('defaults to disabled and accepts explicit enabled values', () => {
    expect(townNpcsEnabled(undefined)).toBe(false);
    expect(townNpcsEnabled('')).toBe(false);
    expect(townNpcsEnabled('false')).toBe(false);
    expect(townNpcsEnabled('0')).toBe(false);
    expect(townNpcsEnabled('true')).toBe(true);
    expect(townNpcsEnabled('1')).toBe(true);
    expect(townNpcsEnabled('YES')).toBe(true);
    expect(townNpcsEnabled(' on ')).toBe(true);
    expect(townNpcsEnabled('true', 'true')).toBe(false);
  });

  test('removes unlinked NPC agents while preserving networking avatars and humans', () => {
    const world = {
      _id: 'worlds:1',
      _creationTime: 1,
      nextId: 8,
      agents: [
        { id: 'a:1', playerId: 'p:1' },
        { id: 'a:2', playerId: 'p:2' },
      ],
      players: [
        { id: 'p:1', lastInput: 1, position: { x: 0, y: 0 }, facing: { dx: 1, dy: 0 }, speed: 0 },
        { id: 'p:2', lastInput: 1, position: { x: 1, y: 0 }, facing: { dx: 1, dy: 0 }, speed: 0 },
        {
          id: 'p:3',
          human: 'player_session_id',
          lastInput: 1,
          position: { x: 2, y: 0 },
          facing: { dx: 1, dy: 0 },
          speed: 0,
        },
      ],
      conversations: [
        {
          id: 'c:1',
          created: 1,
          creator: 'p:1',
          participants: [
            { playerId: 'p:1', invited: 1, status: { kind: 'participating', started: 1 } },
            { playerId: 'p:2', invited: 1, status: { kind: 'participating', started: 1 } },
          ],
          numMessages: 0,
        },
        {
          id: 'c:2',
          created: 1,
          creator: 'p:2',
          participants: [
            { playerId: 'p:2', invited: 1, status: { kind: 'participating', started: 1 } },
            { playerId: 'p:3', invited: 1, status: { kind: 'participating', started: 1 } },
          ],
          numMessages: 0,
        },
      ],
      historicalLocations: [
        { playerId: 'p:1', location: new ArrayBuffer(0) },
        { playerId: 'p:2', location: new ArrayBuffer(0) },
      ],
    };

    const result = pruneNpcWorldState(world as any, new Set(['p:2']));

    expect(result.removedAgentIds).toEqual(['a:1']);
    expect(result.removedPlayerIds).toEqual(['p:1']);
    expect(result.removedConversationIds).toEqual(['c:1']);
    expect(result.world.agents.map((agent) => agent.id)).toEqual(['a:2']);
    expect(result.world.players.map((player) => player.id)).toEqual(['p:2', 'p:3']);
    expect(result.world.conversations.map((conversation) => conversation.id)).toEqual(['c:2']);
    expect(result.world.historicalLocations?.map((location) => location.playerId)).toEqual(['p:2']);
  });
});
