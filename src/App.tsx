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
import { apiAdapter } from './networking/api.ts';

type AppView = 'town' | 'dashboard';

export default function Home() {
  const [currentView, setCurrentView] = useState<AppView>('town');
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
            <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
          </>
        ) : (
          <div className="relative flex-1 flex flex-col">
            <button
              onClick={() => setCurrentView('town')}
              className="absolute top-4 right-4 lg:top-8 lg:right-8 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm z-10"
            >
              Back to Town
            </button>
            <div className="flex-1 overflow-hidden pt-12">
              <OwnerDashboard apiAdapter={apiAdapter} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
