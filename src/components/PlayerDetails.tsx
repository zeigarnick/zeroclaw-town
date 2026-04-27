import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import closeImg from '../../assets/close.svg';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import type {
  NetworkingTownAgent,
  NetworkingTownProjection,
  NetworkingTownStatus,
} from '../../convex/networking/townProjection';
import type { TownConversationThread } from '../../convex/networking/conversations';
import { usePlayerSessionToken } from '../hooks/playerSession';

const NETWORKING_STATUS_META: Record<NetworkingTownStatus, { label: string; className: string }> = {
  matched: {
    label: 'Matched',
    className: 'bg-brown-500 text-brown-100 border-brown-300',
  },
  pending_meeting: {
    label: 'Pending meeting',
    className: 'bg-clay-700 text-white border-clay-500',
  },
  talking: {
    label: 'Talking',
    className: 'bg-brown-700 text-brown-100 border-brown-500',
  },
  intro_ready: {
    label: 'Intro ready',
    className: 'bg-yellow-300 text-brown-900 border-yellow-100',
  },
};

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  networkingProjection,
  setSelectedElement,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  networkingProjection?: NetworkingTownProjection;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  const sessionToken = usePlayerSessionToken();
  const humanTokenIdentifier = useQuery(api.world.userStatus, {
    worldId,
    sessionToken: sessionToken ?? undefined,
  });

  const players = [...game.world.players.values()];
  const humanPlayer = players.find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  // Always select the other player if we're in a conversation with them.
  if (humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    playerId = otherPlayerIds[0];
  }

  const player = playerId && game.world.players.get(playerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    playerId ? { worldId, playerId } : 'skip',
  );

  const playerDescription = playerId && game.playerDescriptions.get(playerId);
  const networkingAgent = playerId ? networkingProjection?.agentsByPlayerId[playerId] : undefined;
  const networkingConversations = useQuery(
    api.networking.conversations.listTownConversations,
    networkingAgent ? { agentId: networkingAgent.agentId } : 'skip',
  ) as TownConversationThread[] | undefined;

  const startConversation = useSendInput(worldId, engineId, 'startConversation');
  const acceptInvite = useSendInput(worldId, engineId, 'acceptInvite');
  const rejectInvite = useSendInput(worldId, engineId, 'rejectInvite');
  const leaveConversation = useSendInput(worldId, engineId, 'leaveConversation');

  if (!playerId) {
    return (
      <div className="h-full text-xl flex text-center items-center p-4">
        Click on an agent on the map to see chat history.
      </div>
    );
  }
  if (!player) {
    return null;
  }
  const isMe = humanPlayer && player.id === humanPlayer.id;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(playerId)?.status;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerConversation.participants.get(playerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !playerId) {
      return;
    }
    console.log(`Starting conversation`);
    await toastOnError(startConversation({ playerId: humanPlayer.id, invitee: playerId }));
  };
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !playerId) {
      return;
    }
    await toastOnError(
      acceptInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) {
      return;
    }
    await toastOnError(
      rejectInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) {
      return;
    }
    await toastOnError(
      leaveConversation({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  // const pendingSuffix = (inputName: string) =>
  //   [...inflightInputs.values()].find((i) => i.name === inputName) ? ' opacity-50' : '';

  const pendingSuffix = (s: string) => '';
  return (
    <>
      <div className="flex gap-4">
        <div className="box w-3/4 sm:w-full mr-auto">
          <h2 className="bg-brown-700 p-2 font-display text-2xl sm:text-4xl tracking-wider shadow-solid text-center">
            {playerDescription?.name}
          </h2>
        </div>
        <a
          className="button text-white shadow-solid text-2xl cursor-pointer pointer-events-auto"
          onClick={() => setSelectedElement(undefined)}
        >
          <h2 className="h-full bg-clay-700">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </h2>
        </a>
      </div>
      {networkingAgent && <NetworkingAgentPanel agent={networkingAgent} />}
      {networkingAgent && (
        <NetworkingConversationPanel
          agent={networkingAgent}
          conversations={networkingConversations}
        />
      )}
      {canInvite && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('startConversation')
          }
          onClick={onStartConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>Start conversation</span>
          </div>
        </a>
      )}
      {waitingForAccept && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>Waiting for accept...</span>
          </div>
        </a>
      )}
      {waitingForNearby && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>Walking over...</span>
          </div>
        </a>
      )}
      {inConversationWithMe && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('leaveConversation')
          }
          onClick={onLeaveConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>Leave conversation</span>
          </div>
        </a>
      )}
      {haveInvite && (
        <>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('acceptInvite')
            }
            onClick={onAcceptInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>Accept</span>
            </div>
          </a>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('rejectInvite')
            }
            onClick={onRejectInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>Reject</span>
            </div>
          </a>
        </>
      )}
      {!playerConversation && player.activity && player.activity.until > Date.now() && (
        <div className="box flex-grow mt-6">
          <h2 className="bg-brown-700 text-base sm:text-lg text-center">
            {player.activity.description}
          </h2>
        </div>
      )}
      <div className="desc my-6">
        <p className="leading-tight -m-4 bg-brown-700 text-base sm:text-sm">
          {!isMe && playerDescription?.description}
          {isMe && <i>This is you!</i>}
          {!isMe && inConversationWithMe && (
            <>
              <br />
              <br />(<i>Conversing with you!</i>)
            </>
          )}
        </p>
      </div>
      {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
        <Messages
          worldId={worldId}
          engineId={engineId}
          inConversationWithMe={inConversationWithMe ?? false}
          conversation={{ kind: 'active', doc: playerConversation }}
          humanPlayer={humanPlayer}
          scrollViewRef={scrollViewRef}
        />
      )}
      {!playerConversation && previousConversation && (
        <>
          <div className="box flex-grow">
            <h2 className="bg-brown-700 text-lg text-center">Previous conversation</h2>
          </div>
          <Messages
            worldId={worldId}
            engineId={engineId}
            inConversationWithMe={false}
            conversation={{ kind: 'archived', doc: previousConversation }}
            humanPlayer={humanPlayer}
            scrollViewRef={scrollViewRef}
          />
        </>
      )}
    </>
  );
}

function NetworkingConversationPanel({
  agent,
  conversations,
}: {
  agent: NetworkingTownAgent;
  conversations?: TownConversationThread[];
}) {
  return (
    <div className="box mt-6">
      <div className="bg-brown-700 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-xl tracking-wider shadow-solid">Agent conversations</h3>
          <span className="border border-brown-500 bg-brown-800 px-2 py-1 text-xs tabular-nums text-brown-100">
            {conversations ? conversations.length : '...'}
          </span>
        </div>
        {!conversations && (
          <p className="mt-3 text-sm leading-tight text-pretty text-brown-200">
            Loading conversations...
          </p>
        )}
        {conversations?.length === 0 && (
          <p className="mt-3 text-sm leading-tight text-pretty text-brown-200">
            No networking conversations yet.
          </p>
        )}
        {conversations && conversations.length > 0 && (
          <div className="mt-4 space-y-4">
            {conversations.map((conversation) => (
              <NetworkingConversationThreadView
                key={conversation.conversationId}
                agent={agent}
                conversation={conversation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NetworkingConversationThreadView({
  agent,
  conversation,
}: {
  agent: NetworkingTownAgent;
  conversation: TownConversationThread;
}) {
  const isOpen = conversation.status === 'open';
  return (
    <section className="border border-brown-500 bg-brown-800 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm leading-tight text-pretty">
            {agent.displayName} with {conversation.otherAgent.displayName}
          </p>
          <p className="mt-1 text-xs text-brown-300">
            Updated {new Date(conversation.updatedAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`border px-2 py-1 text-xs tabular-nums ${
            isOpen
              ? 'border-yellow-100 bg-yellow-300 text-brown-900'
              : 'border-brown-500 bg-brown-700 text-brown-100'
          }`}
        >
          {isOpen ? 'Live' : 'Closed'}
        </span>
      </div>
      {conversation.messages.length === 0 ? (
        <p className="mt-3 text-sm leading-tight text-pretty text-brown-200">
          The agents have not exchanged messages yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {conversation.messages.map((message) => {
            const isSelectedAgent = message.authorAgentId === agent.agentId;
            return (
              <div
                key={message.messageId}
                className={`border p-2 ${
                  isSelectedAgent
                    ? 'border-yellow-200 bg-yellow-100 text-brown-900'
                    : 'border-brown-500 bg-brown-700 text-brown-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span>{message.authorDisplayName}</span>
                  <time dateTime={new Date(message.createdAt).toISOString()}>
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </time>
                </div>
                <p className="mt-2 text-sm leading-tight text-pretty">{message.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NetworkingAgentPanel({ agent }: { agent: NetworkingTownAgent }) {
  const activeStatuses = (
    ['matched', 'pending_meeting', 'talking', 'intro_ready'] as NetworkingTownStatus[]
  ).filter((status) => agent.counts[status] > 0);

  return (
    <div className="box mt-6">
      <div className="bg-brown-700 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl tracking-wider shadow-solid">Networking</h3>
          {activeStatuses.length > 0 ? (
            activeStatuses.map((status) => (
              <span
                key={status}
                className={`inline-flex items-center border px-2 py-1 text-xs tabular-nums ${NETWORKING_STATUS_META[status].className}`}
              >
                {NETWORKING_STATUS_META[status].label}
                {agent.counts[status] > 1 ? ` ${agent.counts[status]}` : ''}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center border border-brown-500 bg-brown-800 px-2 py-1 text-xs text-brown-200">
              No active status
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-tight text-pretty text-brown-100">
          {agent.description ?? 'Claimed networking agent.'}
        </p>
        {agent.cards.length > 0 && (
          <div className="mt-4 space-y-2">
            {agent.cards.map((card) => (
              <div key={card.id} className="border border-brown-500 bg-brown-800 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm leading-tight text-pretty">{card.title}</p>
                  <span className="shrink-0 border border-brown-500 px-2 py-0.5 text-xs text-brown-200">
                    {card.type}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-tight text-pretty text-brown-200">
                  {card.summary}
                </p>
              </div>
            ))}
          </div>
        )}
        <NetworkingRelationshipList label="Matches" relationships={agent.matchedAgents} />
        <NetworkingRelationshipList
          label="Pending meetings"
          relationships={agent.pendingMeetingAgents}
        />
        <NetworkingRelationshipList label="Talking with" relationships={agent.talkingAgents} />
        <NetworkingRelationshipList label="Intro ready" relationships={agent.introReadyAgents} />
      </div>
    </div>
  );
}

function NetworkingRelationshipList({
  label,
  relationships,
}: {
  label: string;
  relationships: NetworkingTownAgent['matchedAgents'];
}) {
  if (relationships.length === 0) {
    return null;
  }
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-brown-300">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {relationships.map((relationship) => (
          <span
            key={relationship.agentId}
            className="border border-brown-500 bg-brown-800 px-2 py-1 text-xs text-brown-100"
          >
            {relationship.displayName}
          </span>
        ))}
      </div>
    </div>
  );
}
