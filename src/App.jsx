import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
import { PrivateRoute, PublicOnlyRoute } from './components/PrivateRoute'

import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CreateTournament from './pages/CreateTournament'
import JoinTournament from './pages/JoinTournament'
import Practice from './pages/Practice'
import Lobby from './pages/Lobby'
import Tournament from './pages/Tournament'
import Race from './pages/Race'
import Results from './pages/Results'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public — reachable without a session */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

          {/* Private — require a real Supabase session.
              Every route below renders nothing until useAuth has resolved the
              session, and bounces to /login (remembering the target URL) when
              there is none. Resource-level permissions (is this match mine? is
              this tournament mine?) are enforced by RLS/RPC, not here. */}
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/create-tournament" element={<PrivateRoute><CreateTournament /></PrivateRoute>} />
          <Route path="/join-tournament" element={<PrivateRoute><JoinTournament /></PrivateRoute>} />
          <Route path="/lobby/:tournamentId" element={<PrivateRoute><Lobby /></PrivateRoute>} />
          <Route path="/tournament/:tournamentId/practice" element={<PrivateRoute><Practice /></PrivateRoute>} />
          <Route path="/tournament/:tournamentId" element={<PrivateRoute><Tournament /></PrivateRoute>} />
          <Route path="/race/:matchId/:raceId" element={<PrivateRoute><Race /></PrivateRoute>} />
          <Route path="/results/:tournamentId" element={<PrivateRoute><Results /></PrivateRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(16, 21, 36, 0.94)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(177,183,192,0.14)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
          },
          success: {
            iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-card)' },
          },
          error: {
            iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg-card)' },
          },
        }}
      />
    </AuthProvider>
  )
}
