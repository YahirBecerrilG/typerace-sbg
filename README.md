# 🏎️ TypeRacing — Realtime Competitive Typing Tournament Platform

TypeRacing is a modern, real-time multiplayer typing tournament web application built with **React**, **Vite**, **Tailwind CSS**, and **Supabase (Auth, PostgreSQL, Realtime & RPCs)**.

Multiple players can join from different devices using a unique room code, prepare in a live interactive lobby, and compete in elimination tournament brackets with real-time keystroke tracking, live opponent progress bars, dynamic WPM/accuracy calculation, and automated tournament progression.

---

## 🚀 Features

- **Real Multiplayer Sync:** Supabase Realtime Channels (`broadcast`, `presence`, and `postgres_changes`) synchronize players with sub-100ms latency.
- **Single Elimination Tournament Engine:** Supports 2, 4, 8, and 16-player brackets with automated round progression and match pairing.
- **Precision Typing Engine:**
  - Real-time keystroke validation (correct, error, untyped cursor).
  - Live Word Per Minute (WPM) and Accuracy (%) calculations.
  - Anti-cheat sanity checks via PostgreSQL RPC `submit_match_result`.
- **Cyberpunk / Arcade Visual Design:** Neon glow effects, dynamic car avatars, interactive progress tracks, and bracket visualizations using Framer Motion.
- **Audio Feedback:** Synthesized sound effects (Web Audio API) for key clicks, error buzzes, countdown beeps, and victory fanfares.
- **Player Stats & Profile:** Match history, best WPM, tournaments won, and average accuracy tracking.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite (JavaScript / JSX)
- **Styling & Animations:** Tailwind CSS v4, Lucide Icons, Framer Motion, Canvas Confetti
- **Backend & Database:** Supabase
  - **Auth:** Email / Password authentication with profile triggers
  - **Database:** PostgreSQL with Row Level Security (RLS)
  - **Realtime:** Broadcast channels for typing progress & countdowns, Presence for lobby status
  - **Business Logic:** PostgreSQL stored procedures (RPCs) for atomic match results and round progression

---

## 📂 Project Structure

```
typerace/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── Bracket.jsx          # Interactive tournament bracket visualization
│   │   ├── Countdown.jsx        # Synchronized 3-2-1-GO countdown overlay
│   │   ├── Navbar.jsx           # Global navigation with user status & quick links
│   │   ├── PrivateRoute.jsx     # Route guard for authenticated users
│   │   ├── RaceTrack.jsx        # Live race visualization with animated cars
│   │   ├── StatsCard.jsx        # WPM, accuracy, rank & time metrics cards
│   │   └── TypingText.jsx       # Character-by-character styled typing area
│   ├── hooks/
│   │   ├── useAuth.jsx          # Supabase auth context & session provider
│   │   ├── useRace.js           # Realtime typing engine, WPM & state tracking
│   │   ├── useRealtime.js       # Supabase Realtime channels helper
│   │   └── useTournamentRealtime.js # Tournament bracket & match listener
│   ├── pages/
│   │   ├── CreateTournament.jsx # Tournament creation (size, difficulty, title)
│   │   ├── Dashboard.jsx        # User stats, recent tournaments & quick actions
│   │   ├── Home.jsx             # High-impact landing page
│   │   ├── JoinTournament.jsx   # Code input & public tournament directory
│   │   ├── Lobby.jsx            # Real-time room waiting room with readiness toggle
│   │   ├── Login.jsx            # User sign in
│   │   ├── Race.jsx             # Active 1v1 match arena
│   │   ├── Register.jsx         # User registration with avatar selection
│   │   ├── Results.jsx          # Champion announcement & tournament recap
│   │   └── Tournament.jsx       # Bracket hub & match queue
│   ├── services/
│   │   └── supabase.js          # Supabase client initialization
│   ├── utils/
│   │   ├── sound.js             # Web Audio API sound effects generator
│   │   └── typing.js            # WPM & accuracy calculation utilities
│   ├── App.jsx                  # Main routing configuration
│   ├── index.css                # Global theme, neon tokens & animations
│   └── main.jsx                 # React root
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql      # Schema, RLS, functions & RPCs
│       └── 002_seed_phrases.sql # 34+ curated typing challenge phrases
└── package.json
```

---

## ⚡ Supabase Setup (Required)

Follow these steps to configure your Supabase backend:

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Under **Project Settings > API**, copy the:
   - **Project URL**
   - **Project API anon/public key**

### 2. Configure Environment Variables
Create or edit `.env` in the root of `typerace`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Database Migrations
Go to your Supabase project's **SQL Editor** and execute the following SQL scripts in order:

1. **`supabase/migrations/001_initial.sql`**
   - Creates `profiles`, `tournaments`, `tournament_participants`, `matches`, `match_players`, and `phrases` tables.
   - Sets up Row Level Security (RLS) policies.
   - Sets up PostgreSQL triggers to auto-create user profiles upon signup.
   - Creates the `start_tournament`, `submit_match_result`, and `advance_tournament_round` atomic RPC functions.
   - Enables Realtime publication for relevant tables.

2. **`supabase/migrations/002_seed_phrases.sql`**
   - Inserts categorized phrases (easy, medium, hard) into the `phrases` table.

### 4. Enable Supabase Realtime
Verify that the `supabase_realtime` publication includes:
- `tournaments`
- `tournament_participants`
- `matches`
- `match_players`

*(This is executed automatically in `001_initial.sql`, but you can verify it in **Database > Publications**).*

---

## 💻 Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the Vite development server:**
   ```bash
   npm run dev
   ```

3. **Open the application:**
   Navigate to `http://localhost:5173` in your browser.

4. **Testing Multiplayer Locally:**
   - Open an incognito browser window or a second browser (e.g. Chrome + Firefox).
   - Sign up with two different accounts.
   - Have Player 1 click **Create Tournament** and share the 6-digit code.
   - Have Player 2 click **Join Tournament** and enter the code.
   - Both players click **Ready** and the host starts the tournament!

---

## 🌐 Deployment to Vercel

1. Push this repository to GitHub or GitLab.
2. Go to [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your `typerace` repository.
4. In the **Environment Variables** section, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. Vercel will build and deploy the production bundle with client-side SPA routing support.

---

## 📜 License
MIT License. Created for competitive typing enthusiasts!
