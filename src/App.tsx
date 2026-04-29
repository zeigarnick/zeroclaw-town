import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import MusicButton from './components/buttons/MusicButton.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { OwnerDashboard } from './networking/OwnerDashboard.tsx';
import { EventOwnerReview } from './networking/EventOwnerReview.tsx';
import { EventQrOverlay } from './networking/EventQrOverlay.tsx';
import { apiAdapter } from './networking/api.ts';

type AppView = 'town' | 'dashboard' | 'eventReview';

type InitialRoute = {
  claimToken: string;
  eventReview?: {
    eventId: string;
    reviewToken: string;
  };
};

function getInitialRoute(): InitialRoute {
  const pathMatch = window.location.pathname.match(/^\/claim\/([^/?#]+)/);
  if (pathMatch) {
    return { claimToken: decodeURIComponent(pathMatch[1]) };
  }
  const eventReviewMatch = window.location.pathname.match(/^\/event-review\/([^/?#]+)\/([^/?#]+)/);
  if (eventReviewMatch) {
    return {
      claimToken: '',
      eventReview: {
        eventId: decodeURIComponent(eventReviewMatch[1]),
        reviewToken: decodeURIComponent(eventReviewMatch[2]),
      },
    };
  }
  return { claimToken: new URLSearchParams(window.location.search).get('claimToken') ?? '' };
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
    initialRoute.eventReview ? 'eventReview' : initialRoute.claimToken ? 'dashboard' : 'town',
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

            <button
              onClick={() => setCurrentView('dashboard')}
              className="absolute right-4 top-4 z-10 rounded bg-clay-700 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-clay-500 pointer-events-auto"
            >
              Dashboard
            </button>
            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 pointer-events-none">
              <FreezeButton />
              <MusicButton />
              <InteractButton />
            </div>
            <EventQrOverlay
              eventId={eventQrConfig.eventId}
              skillUrl={eventQrConfig.skillUrl}
            />
            <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
          </>
        ) : currentView === 'dashboard' ? (
          <div className="relative flex h-full min-h-0 flex-col">
            <button
              onClick={() => setCurrentView('town')}
              className="absolute top-4 right-4 lg:top-8 lg:right-8 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm z-10"
            >
              Back to Town
            </button>
            <div className="min-h-0 flex-1 overflow-hidden pt-12">
              <OwnerDashboard
                apiAdapter={apiAdapter}
                initialClaimToken={initialRoute.claimToken}
              />
            </div>
          </div>
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
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
