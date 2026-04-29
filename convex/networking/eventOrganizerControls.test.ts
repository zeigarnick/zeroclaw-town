import { ConvexError } from 'convex/values';
import { decideOwnerReviewHandler, listApprovedPublicCardsHandler, registerEventAgentHandler } from './eventAgents';
import { getEventSpaceConfigHandler } from './eventSpaces';
import {
  listHighVolumeRequestersHandler,
  listSuspiciousRegistrationsHandler,
  pauseEventRegistrationHandler,
  resumeEventRegistrationHandler,
  revokeEventAgentHandler,
  rotateEventSkillUrlHandler,
} from './eventOrganizerControls';

type TableName =
  | 'eventSpaces'
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventOwnerSessions'
  | 'eventOrganizerAuditEvents'
  | 'worlds'
  | 'worldStatus'
  | 'maps'
  | 'engines';
type Row = Record<string, any> & { _id: string };

const ORGANIZER_TOKEN = 'organizer-secret';

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventSpaces: [],
    eventAgents: [],
    eventNetworkingCards: [],
    eventOwnerSessions: [],
    eventOrganizerAuditEvents: [],
    worlds: [],
    worldStatus: [],
    maps: [],
    engines: [],
  };
  const counters: Record<TableName, number> = {
    eventSpaces: 0,
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventOwnerSessions: 0,
    eventOrganizerAuditEvents: 0,
    worlds: 0,
    worldStatus: 0,
    maps: 0,
    engines: 0,
  };

  const db = {
    insert: async (tableName: TableName, document: Record<string, any>) => {
      counters[tableName] += 1;
      const row = { _id: `${tableName}:${counters[tableName]}`, ...document };
      tables[tableName].push(row);
      return row._id;
    },
    patch: async (id: string, patch: Record<string, any>) => {
      const row = findById(tables, id);
      if (!row) {
        throw new Error(`Missing row ${id}`);
      }
      Object.assign(row, patch);
    },
    get: async (id: string) => findById(tables, id) ?? null,
    query: (tableName: TableName) => ({
      withIndex: (_indexName: string, buildQuery: (q: any) => any) => {
        const filters: Array<{ field: string; value: any }> = [];
        const q = {
          eq: (field: string, value: any) => {
            filters.push({ field, value });
            return q;
          },
        };
        buildQuery(q);
        const rows = tables[tableName].filter((row) =>
          filters.every(({ field, value }) => valuesEqual(row[field], value)),
        );
        return {
          first: async () => rows[0] ?? null,
          collect: async () => rows,
        };
      },
    }),
  };

  const scheduler = {
    runAfter: async () => undefined,
  };

  return { ctx: { db, scheduler }, tables };
}

function findById(tables: Record<TableName, Row[]>, id: string) {
  return Object.values(tables)
    .flat()
    .find((row) => row._id === id);
}

function valuesEqual(left: any, right: any) {
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    return buffersEqual(left, right);
  }
  return left === right;
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function publicCard() {
  return {
    role: 'Founder',
    category: 'Climate',
    offers: ['GTM help'],
    wants: ['seed investor feedback'],
    lookingFor: 'Climate operators',
    hobbies: ['cycling'],
    interests: ['energy'],
    favoriteMedia: ['The Expanse'],
  };
}

async function registerApprovedAgent(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  agentIdentifier: string,
) {
  const registration = await registerEventAgentHandler(ctx as any, {
    eventId: 'demo-event',
    agentIdentifier,
    publicCard: publicCard(),
  });
  await decideOwnerReviewHandler(
    ctx as any,
    { reviewToken: registration.ownerSessionToken },
    'approved',
  );
  return registration;
}

describe('event organizer controls', () => {
  const originalToken = process.env.OPENNETWORK_ORGANIZER_TOKEN;

  beforeEach(() => {
    process.env.OPENNETWORK_ORGANIZER_TOKEN = ORGANIZER_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.OPENNETWORK_ORGANIZER_TOKEN;
    } else {
      process.env.OPENNETWORK_ORGANIZER_TOKEN = originalToken;
    }
  });

  test('pauses and resumes event registration with audit rows', async () => {
    const { ctx, tables } = createMockCtx();

    const paused = await pauseEventRegistrationHandler(ctx as any, {
      eventId: ' Demo Event ',
      organizerToken: ORGANIZER_TOKEN,
      reason: 'leaked QR',
    });
    expect(paused).toMatchObject({
      eventId: 'demo-event',
      worldTemplateId: 'clawport-terminal',
      worldId: tables.worlds[0]._id,
      registrationStatus: 'paused',
      registrationPausedAt: expect.any(Number),
    });
    expect(tables.worldStatus).toEqual([
      expect.objectContaining({
        worldId: tables.worlds[0]._id,
        isDefault: false,
      }),
    ]);

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'demo-event',
        agentIdentifier: 'blocked',
        publicCard: publicCard(),
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_registration_paused' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    const resumed = await resumeEventRegistrationHandler(ctx as any, {
      eventId: 'demo-event',
      organizerToken: ORGANIZER_TOKEN,
      reason: 'rotated link',
    });
    expect(resumed.registrationStatus).toBe('open');

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'demo-event',
        agentIdentifier: 'allowed',
        publicCard: publicCard(),
      }),
    ).resolves.toMatchObject({ agentIdentifier: 'allowed' });

    expect(tables.eventOrganizerAuditEvents.map((event) => event.type)).toEqual([
      'registration_paused',
      'registration_resumed',
      'event_agent_registered',
    ]);
  });

  test('rotates the event skill URL behind organizer capability auth', async () => {
    const { ctx } = createMockCtx();

    await expect(
      rotateEventSkillUrlHandler(ctx as any, {
        eventId: 'demo-event',
        organizerToken: 'wrong-token',
        skillUrl: 'https://event.example/skill.md',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_organizer_token' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    const updated = await rotateEventSkillUrlHandler(ctx as any, {
      eventId: 'demo-event',
      organizerToken: ORGANIZER_TOKEN,
      skillUrl: 'https://event.example/skill.md',
    });

    expect(updated).toMatchObject({
      eventId: 'demo-event',
      skillUrl: 'https://event.example/skill.md',
      skillUrlRotatedAt: expect.any(Number),
    });
    await expect(getEventSpaceConfigHandler(ctx as any, { eventId: 'demo-event' })).resolves.toMatchObject({
      eventId: 'demo-event',
      skillUrl: 'https://event.example/skill.md',
      skillUrlRotatedAt: updated.skillUrlRotatedAt,
    });
  });

  test('revokes approved agents from public cards and owner review lookup', async () => {
    const { ctx, tables } = createMockCtx();
    const registration = await registerApprovedAgent(ctx, 'abusive-agent');

    await expect(
      listApprovedPublicCardsHandler(ctx as any, { eventId: 'demo-event' }),
    ).resolves.toHaveLength(1);

    const revoked = await revokeEventAgentHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: registration.eventAgentId as any,
      organizerToken: ORGANIZER_TOKEN,
      reason: 'spam reports',
    });

    expect(revoked).toMatchObject({
      approvalStatus: 'revoked',
      activeCardId: undefined,
      revokedReason: 'spam reports',
    });
    expect(tables.eventNetworkingCards[0]).toMatchObject({
      status: 'revoked',
      revokedReason: 'spam reports',
    });
    expect(tables.eventOwnerSessions[0].status).toBe('revoked');

    await expect(
      listApprovedPublicCardsHandler(ctx as any, { eventId: 'demo-event' }),
    ).resolves.toEqual([]);
    await expect(
      decideOwnerReviewHandler(ctx as any, { reviewToken: registration.ownerSessionToken }, 'approved'),
    ).rejects.toMatchObject({
      data: { code: 'event_agent_not_found' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('lists suspicious registrations and high-volume audit requesters', async () => {
    const { ctx, tables } = createMockCtx();
    await registerEventAgentHandler(ctx as any, {
      eventId: 'demo-event',
      agentIdentifier: 'pending-one',
      requesterKey: 'cf-ip:203.0.113.50',
      publicCard: publicCard(),
    });
    await registerEventAgentHandler(ctx as any, {
      eventId: 'demo-event',
      agentIdentifier: 'pending-two',
      requesterKey: 'cf-ip:203.0.113.50',
      publicCard: publicCard(),
    });
    const approved = await registerApprovedAgent(ctx, 'approved-one');
    await revokeEventAgentHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: approved.eventAgentId as any,
      organizerToken: ORGANIZER_TOKEN,
    });
    const suspicious = await listSuspiciousRegistrationsHandler(ctx as any, {
      eventId: 'demo-event',
      organizerToken: ORGANIZER_TOKEN,
    });
    expect(suspicious.map((row) => row.reason).sort()).toEqual([
      'pending_owner_review',
      'pending_owner_review',
      'revoked',
    ]);
    expect(
      tables.eventOrganizerAuditEvents
        .filter((event) => event.actorKind === 'public_requester')
        .map((event) => ({
          actorKey: event.actorKey,
          agentIdentifier: event.metadata?.agentIdentifier,
        })),
    ).toEqual([
      { actorKey: 'cf-ip:203.0.113.50', agentIdentifier: 'pending-one' },
      { actorKey: 'cf-ip:203.0.113.50', agentIdentifier: 'pending-two' },
      { actorKey: 'unknown-public-requester', agentIdentifier: 'approved-one' },
    ]);

    const highVolume = await listHighVolumeRequestersHandler(ctx as any, {
      eventId: 'demo-event',
      organizerToken: ORGANIZER_TOKEN,
      threshold: 2,
    });
    expect(highVolume).toEqual([
      expect.objectContaining({
        actorKey: 'cf-ip:203.0.113.50',
        count: 2,
        types: ['event_agent_registered'],
      }),
    ]);
  });
});
