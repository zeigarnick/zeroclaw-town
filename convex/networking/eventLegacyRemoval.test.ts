import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleNetworkingHttpRequest } from './http';

async function readJson(response: Response) {
  return (await response.json()) as any;
}

describe('event legacy removal', () => {
  test('legacy public HTTP routes are unsupported and do not reach handlers', async () => {
    const calls: string[] = [];
    const ctx = {
      runMutation: async () => {
        calls.push('mutation');
        throw new Error('unexpected mutation');
      },
      runQuery: async () => {
        calls.push('query');
        throw new Error('unexpected query');
      },
    };
    const requests = [
      new Request('https://town.example/api/v1/agents/register', { method: 'POST' }),
      new Request('https://town.example/api/v1/agents/mock-claim', { method: 'POST' }),
      new Request('https://town.example/api/v1/cards', { method: 'GET' }),
      new Request('https://town.example/api/v1/inbox', { method: 'GET' }),
      new Request('https://town.example/api/v1/recommendations/recommendations:1/request-meeting', {
        method: 'POST',
      }),
      new Request('https://town.example/api/v1/meetings', { method: 'GET' }),
      new Request('https://town.example/api/v1/conversations', { method: 'GET' }),
      new Request('https://town.example/api/v1/intros', { method: 'GET' }),
    ];

    for (const request of requests) {
      const response = await handleNetworkingHttpRequest(ctx, request);
      expect(response.status).toBe(410);
      expect(await readJson(response)).toEqual({
        success: false,
        error: {
          code: 'legacy_route_unsupported',
          message: 'Legacy networking routes are not supported in event mode.',
        },
      });
    }
    expect(calls).toEqual([]);
  });

  test('event HTTP routes remain reachable after legacy removal', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return {
            eventId: args.eventId,
            displayName: 'Cedar Scout 123',
            approvalStatus: 'pending_owner_review',
          };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/events/demo-event/register', {
        method: 'POST',
        body: JSON.stringify({
          publicCard: {
            role: 'Founder',
            offers: ['GTM help'],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        publicCard: {
          role: 'Founder',
          offers: ['GTM help'],
        },
      },
    });
  });

  test('primary app entry no longer imports or opens the legacy dashboard', () => {
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(appSource).not.toContain('OwnerDashboard');
    expect(appSource).not.toContain("currentView === 'dashboard'");
    expect(appSource).not.toContain('>Dashboard<');
  });

  test('retained legacy gates have removal triggers in the tech debt tracker', () => {
    const tracker = readFileSync(
      join(process.cwd(), 'docs/exec-plans/tech-debt-tracker.md'),
      'utf8',
    );
    expect(tracker).toContain('TD-EW4-001');
    expect(tracker).toContain('OPENNETWORK_ENABLE_LEGACY_DEMO_SEED');
    expect(tracker).toContain('Delete the legacy demo seed path');
    expect(tracker).toContain('TD-EW4-002');
    expect(tracker).toContain('AGORA_ENABLE_TOWN_NPCS');
    expect(tracker).toContain('OPENNETWORK_EVENT_MODE');
    expect(tracker).toContain('Remove or move inherited NPC/vector matching');
  });
});
