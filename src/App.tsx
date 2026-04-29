import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import MusicButton from './components/buttons/MusicButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { EventInboundReview } from './networking/EventInboundReview.tsx';
import { EventOwnerReview } from './networking/EventOwnerReview.tsx';
import { EventQrOverlay } from './networking/EventQrOverlay.tsx';
import { apiAdapter } from './networking/api.ts';
import { AppView, parseInitialRoute } from './networking/eventRoutes.ts';

function getInitialRoute() {
  return parseInitialRoute(window.location.pathname, window.location.search);
}

function getEventQrConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
  const eventId = env.VITE_OPENNETWORK_EVENT_ID ?? 'main-event';
  const configuredSkillUrl = env.VITE_OPENNETWORK_EVENT_SKILL_URL;
  const skillUrl =
    configuredSkillUrl ??
    new URL('/skill.md', window.location.origin || 'http://localhost:5173').toString();
  return { eventId, skillUrl };
}

export default function Home() {
  const initialRoute = getInitialRoute();
  const eventQrConfig = getEventQrConfig();
  const [currentView, setCurrentView] = useState<AppView>(
    initialRoute.eventReview
      ? 'eventReview'
      : initialRoute.inboundReview
        ? 'inboundReview'
        : 'town',
  );
  return (
    <main className="relative overflow-hidden bg-black font-body" style={{ height: '100dvh' }}>
      {/*<div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        <Authenticated>
          <UserButton afterSignOutUrl="/ai-town" />
        </Authenticated>

        <Unauthenticated>
          <LoginButton />
        </Unauthenticated>
      </div> */}

      <div className="relative isolate h-full w-full overflow-hidden">
        {currentView === 'town' ? (
          <>
            <Game />

            <div className="absolute left-4 top-4 z-30 pointer-events-none sm:left-5 sm:top-5">
              <FreezeButton eventId={eventQrConfig.eventId} />
            </div>
            <div className="absolute right-4 top-4 z-20 pointer-events-none sm:right-5 sm:top-5">
              <MusicButton />
            </div>
            <EventQrOverlay
              eventId={eventQrConfig.eventId}
              skillUrl={eventQrConfig.skillUrl}
              apiAdapter={apiAdapter}
            />
            <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
          </>
        ) : (
          <div className="relative flex h-full min-h-0 flex-col">
            <button
              onClick={() => setCurrentView('town')}
              className="absolute top-4 right-4 lg:top-8 lg:right-8 bg-clay-700 hover:bg-clay-500 text-white px-4 py-2 rounded font-bold text-sm z-10"
            >
              Back to Town
            </button>
            <div className="min-h-0 flex-1 overflow-hidden pt-12">
              {initialRoute.eventReview && (
                <EventOwnerReview
                  apiAdapter={apiAdapter}
                  eventId={initialRoute.eventReview.eventId}
                  reviewToken={initialRoute.eventReview.reviewToken}
                />
              )}
              {initialRoute.inboundReview && (
                <EventInboundReview
                  apiAdapter={apiAdapter}
                  eventId={initialRoute.inboundReview.eventId}
                  targetAgentId={initialRoute.inboundReview.targetAgentId}
                  ownerSessionToken={initialRoute.inboundReview.ownerSessionToken}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
