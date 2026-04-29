import { Agent } from './agent';
import { agentInputs } from './agentInputs';
import { Player } from './player';

function player(id: string, x: number, y: number) {
  return new Player({
    id,
    lastInput: 1,
    position: { x, y },
    facing: { dx: 0, dy: 1 },
    speed: 0,
  });
}

function emptyCollisionMap(width: number, height: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
}

describe('event agent behavior', () => {
  test('event agents wander without starting legacy conversations', () => {
    const attendee = player('p:1', 2, 2);
    const other = player('p:2', 5, 5);
    const scheduled: Array<{ name: string; args: any }> = [];
    const agent = new Agent({
      id: 'a:1',
      playerId: 'p:1',
      eventAgentId: 'eventAgents:1' as any,
    });
    const game = {
      worldId: 'worlds:1',
      world: {
        players: new Map([
          [attendee.id, attendee],
          [other.id, other],
        ]),
        conversations: new Map(),
        playerConversation: () => undefined,
      },
      worldMap: {
        serialize: () => ({ width: 10, height: 10 }),
      },
      allocId: () => 'o:1',
      scheduleOperation: (name: string, args: any) => scheduled.push({ name, args }),
    };

    agent.tick(game as any, 1000);

    expect(scheduled).toEqual([
      expect.objectContaining({
        name: 'agentDoSomething',
        args: expect.objectContaining({
          otherFreePlayers: [],
        }),
      }),
    ]);
  });

  test('matched event players receive real pathfinding destinations and a match hold', () => {
    const requester = player('p:1', 2, 2);
    const target = player('p:2', 7, 2);
    const game = {
      world: {
        players: new Map([
          [requester.id, requester],
          [target.id, target],
        ]),
        conversations: new Map(),
      },
      worldMap: {
        width: 12,
        height: 8,
        objectTiles: [emptyCollisionMap(12, 8)],
      },
    };

    agentInputs.moveEventMatchPair.handler(game as any, 2000, {
      requesterPlayerId: 'p:1',
      targetPlayerId: 'p:2',
    });

    expect(requester.pathfinding?.state.kind).toBe('needsPath');
    expect(target.pathfinding?.state.kind).toBe('needsPath');
    expect(requester.pathfinding?.destination).toEqual(expect.objectContaining({ x: 6, y: 2 }));
    expect(target.pathfinding?.destination).toEqual(expect.objectContaining({ x: 3, y: 2 }));
    expect(requester.activity).toMatchObject({ description: 'Matched', until: 12000 });
    expect(target.activity).toMatchObject({ description: 'Matched', until: 12000 });
  });

  test('matched event players do not pathfind to the same meeting tile', () => {
    const requester = player('p:1', 2, 2);
    const target = player('p:2', 4, 2);
    const game = {
      world: {
        players: new Map([
          [requester.id, requester],
          [target.id, target],
        ]),
        conversations: new Map(),
      },
      worldMap: {
        width: 8,
        height: 8,
        objectTiles: [emptyCollisionMap(8, 8)],
      },
    };

    agentInputs.moveEventMatchPair.handler(game as any, 2000, {
      requesterPlayerId: 'p:1',
      targetPlayerId: 'p:2',
    });

    expect(requester.pathfinding?.destination).toBeDefined();
    expect(target.pathfinding?.destination).toBeDefined();
    expect(requester.pathfinding?.destination).not.toEqual(target.pathfinding?.destination);
  });

  test('revoked event avatars are removed from the town world', () => {
    const attendee = player('p:1', 2, 2);
    const agent = new Agent({
      id: 'a:1',
      playerId: 'p:1',
      eventAgentId: 'eventAgents:1' as any,
    });
    const game = {
      world: {
        players: new Map([[attendee.id, attendee]]),
        agents: new Map([[agent.id, agent]]),
        conversations: new Map(),
      },
      agentDescriptions: new Map([[agent.id, {}]]),
      playerDescriptions: new Map([[attendee.id, {}]]),
      descriptionsModified: false,
    };

    agentInputs.removeEventAgentAvatar.handler(game as any, 2000, {
      eventAgentId: 'eventAgents:1' as any,
      playerId: 'p:1',
    });

    expect(game.world.players.has(attendee.id)).toBe(false);
    expect(game.world.agents.has(agent.id)).toBe(false);
    expect(game.agentDescriptions.has(agent.id)).toBe(false);
    expect(game.playerDescriptions.has(attendee.id)).toBe(false);
    expect(game.descriptionsModified).toBe(true);
  });
});
