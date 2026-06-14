# FitTrack

A local fitness and meal tracking web app built for 2 household users. Runs entirely on your own machine — no cloud, no subscriptions, no data leaving your home network.

![FitTrack Screenshot](docs/screenshot.png)

## Features

### Fitness Tracking
- **Workout logging** — Start a workout from a saved routine or ad-hoc; log sets, reps, weight, or timed duration per exercise
- **Personal Bests** — Automatically tracked per exercise; viewable in the Workout → PRs tab
- **Workout history** — Full log of past sessions with calorie burn estimates (MET-based)

### Exercise Library
- **110 pre-loaded exercises** across strength, cardio, warmup, and cooldown categories (squat rack, barbell, dumbbell, kettlebell, cable, bodyweight)
- **Muscle activation maps** — Anatomical front+back SVG body diagrams (108 muscle regions, Apache 2.0 data from [vulovix/body-muscles](https://github.com/vulovix/body-muscles)) showing primary (red) and secondary (orange) muscles per exercise
- **Routine builder** — Create workout routines with ordered exercises, sets/reps/weight/rest config, and an aggregate muscle coverage heatmap

### Nutrition Tracking
- **Food library** — Full nutrition label support: calories, protein, carbs, fat, fiber, sugar, saturated fat, cholesterol, sodium, potassium
- **Meal logging** — Log meals by type (breakfast, lunch, dinner, snack, pre/post-workout) with flexible portion scaling
- **Multi-image support** — Add multiple photos per food or meal (product image + nutrition label, etc.)
- **Daily dashboard** — Calorie ring, macro breakdown, 7-day history chart, sodium warning (>2300mg), micronutrient callouts

### User Management
- **2 user profiles** — Independent dashboards, logs, and routines per user; switch with one tap
- **Calorie & macro targets** — Set per user in Settings; tracks protein, carbs, fat, fiber, sodium

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | TanStack Query v5 (server), Zustand (client) |
| Routing | React Router v6 (BrowserRouter + MemoryRouter for split-screen) |
| Backend | Node.js, Express (CommonJS) |
| Database | SQLite via `better-sqlite3` |
| Process mgmt | pm2 |
| Images | multer + uuid, stored in `data/uploads/` |
| Charts | Recharts |
| Icons | Lucide React |
| Muscle SVG | [vulovix/body-muscles](https://github.com/vulovix/body-muscles) (Apache 2.0) |

---

## Getting Started

### Prerequisites

- Node.js 20 LTS (via [nvm](https://github.com/nvm-sh/nvm) recommended)
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/fitness-tracker.git
cd fitness-tracker

# Run the setup script (installs dependencies for both client and server)
./setup.sh

# Start everything (server on :3001, client dev server on :5173)
./start.sh
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### Manual Setup

```bash
# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..

# Start the backend (uses pm2 for persistence)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npx pm2 start ecosystem.config.js

# Start the client dev server
cd client && npm run dev
```

### Production Build

```bash
cd client && npm run build
# Built files go to client/dist/
# The Express server can serve them from there if you update server/index.js to serve the dist folder
```

---

## Project Structure

```
fitness-tracker/
├── client/                    # React frontend
│   ├── src/
│   │   ├── api/               # Fetch client helpers
│   │   ├── components/
│   │   │   ├── MuscleMap/     # Anatomical SVG data (108 muscle regions)
│   │   │   └── ui/            # Shared UI components (Button, Modal, MuscleMap, etc.)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx  # Daily calorie/macro overview + weekly chart
│   │   │   ├── FoodLog.tsx    # Meal logging per day
│   │   │   ├── Library/       # Food, Exercise, Routine library tabs
│   │   │   ├── Workout/       # Start workout, history, personal bests
│   │   │   ├── Profile.tsx    # User targets (calories, macros, units)
│   │   │   └── Settings.tsx   # App-wide settings
│   │   ├── store/             # Zustand stores (active user, etc.)
│   │   └── types.ts           # Shared TypeScript types
│   └── vite.config.ts         # Proxy /api and /uploads → :3001
│
├── server/
│   ├── db/
│   │   └── index.js           # SQLite schema, migrations, exercise seed data
│   ├── routes/
│   │   ├── dashboard.js       # Daily summary, weekly chart
│   │   ├── exercises.js       # Exercise CRUD
│   │   ├── foods.js           # Food CRUD
│   │   ├── images.js          # Multi-image upload/delete per entity
│   │   ├── meals.js           # Meal logging + macro computation
│   │   ├── routines.js        # Routine + routine_exercise CRUD
│   │   ├── users.js           # User profiles
│   │   └── workouts.js        # Workout sessions + personal bests
│   └── index.js               # Express app entry point
│
├── data/                      # SQLite database + uploaded images (gitignored)
├── ecosystem.config.js        # pm2 process config
├── setup.sh                   # Dependency installation script
└── start.sh                   # Start script
```

---

## Database Schema

The SQLite database is auto-created at `data/fitness.db` on first run. Key tables:

- `users` + `user_profiles` — 2 users with calorie/macro targets, unit preferences
- `foods` — Food library with full nutrition label fields
- `meals` + `meal_items` — Daily meal logs with computed macros
- `exercises` — Exercise library with muscle data (JSON arrays), category, MET value
- `routines` + `routine_exercises` — Saved workout routines with ordered exercises
- `workout_sessions` + `workout_sets` — Logged workouts with per-set data
- `personal_bests` — Auto-maintained best lifts per exercise per user
- `images` — Multi-image support for foods, meals, exercises (entity_type + entity_id pattern)

Migrations use try/catch around `ALTER TABLE` statements for idempotent schema upgrades.

---

## Muscle Activation Maps

Each exercise has `primary_muscles` and `secondary_muscles` arrays. The MuscleMap component renders anatomical front and back body SVGs with:

- **Primary muscles** highlighted in red (intensity-shaded for routines: 1 exercise = bright red, 2 = darker, 3+ = darkest)
- **Secondary muscles** in orange
- **Routine aggregate view** shows cumulative muscle coverage across all exercises in a routine

Supported muscle keys: `chest`, `shoulders`, `rear_delts`, `biceps`, `triceps`, `forearms`, `core`, `hip_flexor`, `quads`, `hamstrings`, `glutes`, `calves`, `upper_back`, `lats`, `lower_back`, `rotator_cuff`

---

## Notes

- The `data/` directory (database + uploaded images) is gitignored. Each install starts fresh.
- The exercise library is seeded on first run (110 exercises). User-added exercises are never overwritten on restart.
- Images are stored locally in `data/uploads/` and served at `/uploads/` by Express.
- Both users share the same exercise/food library; workouts, meals, and routines are per-user.
