import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
import { PrivateRoute } from './components/PrivateRoute'

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
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Private */}
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
            background: '#111827',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            borderRadius: '10px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#111827' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#111827' },
          },
        }}
      />
    </AuthProvider>
  )
}
