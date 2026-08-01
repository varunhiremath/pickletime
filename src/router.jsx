import { createBrowserRouter, Navigate } from 'react-router-dom';
import RootBoot from './components/layout/RootBoot.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import LoadingPage from './pages/LoadingPage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import MatchesPage from './pages/MatchesPage.jsx';
import ScorePage from './pages/ScorePage.jsx';
import CourtsidePage from './pages/CourtsidePage.jsx';
import StandingsPage from './pages/StandingsPage.jsx';
import ClubPage from './pages/ClubPage.jsx';
import PlayerPage from './pages/PlayerPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export const router = createBrowserRouter(
  [
    {
      // Loads the store and hosts dialogs for everything below it.
      element: <RootBoot />,
      children: [
        { path: '/', element: <LoadingPage /> },
        // Join sits outside AppLayout — a friend who hasn't claimed a code yet
        // has no club, so the tabs would have nothing to show.
        { path: '/join', element: <JoinPage /> },
        // Courtside is full-bleed: it sits outside AppLayout on purpose, so no
        // bottom nav competes with the scoreboard.
        { path: '/score/courtside', element: <CourtsidePage /> },
        {
          element: <AppLayout />,
          children: [
            { path: '/today', element: <TodayPage /> },
            { path: '/matches', element: <MatchesPage /> },
            { path: '/score', element: <ScorePage /> },
            { path: '/standings', element: <StandingsPage /> },
            { path: '/club', element: <ClubPage /> },
            { path: '/players/:id', element: <PlayerPage /> },
            { path: '/settings', element: <SettingsPage /> },
          ],
        },
        { path: '*', element: <Navigate to="/today" replace /> },
      ],
    },
  ],
  // Mirrors Vite's base so one build serves both GitHub Pages ('/pickletime/')
  // and the Capacitor WebView ('/'). createBrowserRouter wants a leading slash
  // and no trailing one; '/' alone is fine.
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' }
);
