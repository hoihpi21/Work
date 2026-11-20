# Books & Friends

A social reading app where members create a **reading session** for a book, join sessions to track **reading progress by chapter**, and chat in a **flat discussion thread** with **multi-emoji reactions**.

Full product and technical specification: [`web/books-and-friends-spec.md`](web/books-and-friends-spec.md).

---

## Features (v2.0)

- **Authentication & Profiles:** Email + password sign-up, login, logout, password reset, editable display name (2–40 chars), square-cropped profile avatar upload/removal, and self-service account deletion (comments remain as `"Deleted user"`).
- **Public & Private Reading Sessions:** Create public or invite-only private sessions with book title, author, and 1–200 chapters (auto-numbered or custom-named). Join private sessions via invite link (`/invite/:code` or `booksandfriends://invite/:code`) or invite code entry on Home.
- **Search & Filters:** Search sessions by book title or author across **Discover** and **Mine**, with filter chips (`All`, `In progress`, `Finished`, `Private`).
- **Progress Tracking & Spoiler Protection:** Join or leave sessions, mark completed chapters (`0…N`), view everyone's progress bar, tag comments with a chapter number, and automatically hide spoilers ahead of your current reading progress with one-tap reveal.
- **Realtime Discussion, Quote-Replies & Reactions:** Chronological thread per session with quote-replies, edit/delete own comments, live updates via Supabase Realtime, and multiple emoji reactions per member per comment.
- **Host Controls:** Edit book title, author, visibility, and chapter names; regenerate private invite links; remove participants; moderate comments; or delete a session.
- **In-App Notifications & Mute:** Realtime notification bell (Web) and Notifications screen (Mobile) for comments, replies, and reactions, plus per-session mute/unmute.
- **Dual-Language Support (Web & Mobile):** English (`en`) and Burmese (`my` / မြန်မာ) with externalized locale files and persistent language switching on both Web and Mobile.
- **Files & Links (PDF, DOC/DOCX, XML, URL):** Upload reading materials (up to 25 MB) into a private Supabase Storage bucket (`session-files`) or attach external URLs per session, with signed-URL downloads, inline PDF/XML preview on Web, and native document picking on Mobile.
- **Mobile Extras:** Deep linking (`booksandfriends://session/:id`, `booksandfriends://invite/:code`, `booksandfriends://reset`), native share sheet, native document picker, and native photo picker/cropper.

---

## Architecture & Tech Stack

```text
Web (React 19 + Vite) ─────────┐
                               ├──► Supabase (Auth · Postgres + RLS · Realtime · Storage)
Mobile (React Native + Expo) ──┘
```

Clients talk directly to Supabase using `@supabase/supabase-js` with the **publishable key** under Row Level Security (RLS). Atomic multi-table writes and account deletion are handled by Postgres `SECURITY DEFINER` RPCs—no custom backend server or Edge Functions are required.

| Layer | Stack |
|---|---|
| **Web** (`web/`) | React 19, Vite 8, React Router 7, `@supabase/supabase-js`, `emoji-picker-react`, custom JSON-based i18n (`en` / `my`) |
| **Mobile** (`mobile/`) | React Native 0.88, Expo SDK 58, TypeScript, React Navigation 7 (native stack), `AsyncStorage`, `expo-image-picker`, `expo-image-manipulator`, `expo-linking` |
| **Backend** (`web/supabase/`) | Supabase Auth, Postgres + RLS, Realtime (`supabase_realtime` publication), Storage (`avatars` bucket) |

---

## Repository Structure

```text
.
├── README.md
├── web/
│   ├── books-and-friends-spec.md     # Project specification (v1.0) + implemented Supabase notes
│   ├── index.html                    # HTML shell + Google Fonts (Fraunces, Inter, Noto Sans Myanmar)
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example                  # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
│   ├── public/favicon.svg
│   ├── supabase/
│   │   ├── README.md                 # One-time Supabase setup checklist
│   │   ├── seed.sql                  # Idempotent dev seed (3 sample sessions, comments, reactions)
│   │   └── migrations/
│   │       ├── 0001_init.sql                         # Tables, triggers, create_session RPC, RLS, realtime
│   │       ├── 0002_avatars_and_account_deletion.sql # avatars bucket/policies, delete_my_account RPC
│   │       └── 0003_grants.sql                       # Table/sequence/function grants for authenticated role
│   └── src/
│       ├── main.jsx                  # Entry point (BrowserRouter → I18nProvider → AuthProvider → App)
│       ├── App.jsx                   # Route guards (Protected, PublicOnly) and route definitions
│       ├── supabase.js               # Supabase client initialization
│       ├── auth.jsx                  # AuthContext: session, user, profile, refreshProfile, signOut
│       ├── i18n.jsx                  # I18nContext: lang state, localStorage persistence, t(key, vars)
│       ├── utils.js                  # colorFor(), resizeImage() (256px WebP), timeAgo(iso, t)
│       ├── styles.css                # Warm paper-themed responsive stylesheet + Burmese typography
│       ├── locales/
│       │   ├── en.json               # English translation strings
│       │   └── my.json               # Burmese (မြန်မာ) translation strings
│       ├── components/
│       │   ├── Layout.jsx            # Sticky topbar, nav links, LanguageSwitcher, avatar, logout
│       │   ├── LanguageSwitcher.jsx  # EN / မြန်မာ toggle button group
│       │   ├── Avatar.jsx            # Profile photo or deterministic-color initial fallback
│       │   ├── ProgressBar.jsx       # Accessible progressbar with chapter count and percentage
│       │   └── Comment.jsx           # Comment item, inline edit/delete, grouped reactions, emoji picker
│       └── pages/
│           ├── Login.jsx             # /login
│           ├── Register.jsx          # /register
│           ├── ForgotPassword.jsx    # /forgot
│           ├── ResetPassword.jsx     # /reset
│           ├── Home.jsx              # / (Discover & Mine tabs, paginated session cards)
│           ├── CreateSession.jsx     # /new (calls create_session RPC)
│           ├── SessionDetail.jsx     # /s/:id (hero, chapter chips, readers, realtime thread)
│           └── Profile.jsx           # /profile (display name, avatar upload/remove, language, delete account)
└── mobile/
    ├── App.tsx                       # NavigationContainer, deep-link config, auth URL handler, stack navigator
    ├── app.json                      # Expo config (scheme: booksandfriends, image-picker permission)
    ├── index.ts                      # Expo root registration
    ├── package.json
    ├── tsconfig.json
    ├── .env.example                  # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    └── src/
        ├── supabase.ts               # Supabase client with AsyncStorage persistence & URL polyfill
        ├── auth.tsx                  # Typed AuthProvider & useAuth() hook
        ├── theme.ts                  # Shared color & radius tokens matching the web palette
        ├── utils.ts                  # colorFor(), timeAgo(), resizeAvatar() (256px WebP/JPEG)
        ├── components/
        │   ├── ui.tsx                # Reusable Button, Field, Card, ErrorText, Notice, Loading primitives
        │   ├── Avatar.tsx            # Image avatar or initial fallback
        │   ├── ProgressBar.tsx       # Accessible progressbar (accessibilityRole="progressbar")
        │   ├── EmojiSheet.tsx        # Bottom-sheet modal emoji picker for reactions
        │   └── Comment.tsx           # Comment row, inline edit, delete Alert, tap/long-press reactions
        └── screens/
            ├── AuthScreens.tsx       # LoginScreen, RegisterScreen, ForgotScreen, ResetScreen
            ├── HomeScreen.tsx        # Discover/Mine tabs, FlatList pagination, floating "+ New session" button
            ├── CreateSessionScreen.tsx # Create session form with optional named chapters
            ├── SessionScreen.tsx     # Session detail, share sheet, chapter chips, readers, realtime comments
            └── ProfileScreen.tsx     # Profile edit, native photo picker/cropper upload, logout, delete account
```

---

## Source Code Walkthrough

### 1. Backend & Database (`web/supabase/`)

Run the SQL migrations manually in the Supabase SQL Editor in numerical order:

1. **`0001_init.sql`** — Creates the 6 core tables (`profiles`, `sessions`, `chapters`, `participants`, `comments`, `reactions`), triggers (`handle_new_user`, `check_progress`, `touch_comment`), the `create_session(p_title, p_author, p_chapters)` RPC, RLS policies for `authenticated` users, and adds `comments`, `participants`, and `reactions` to `supabase_realtime`.
2. **`0002_avatars_and_account_deletion.sql`** — Makes `comments.author_id` nullable (`ON DELETE SET NULL`), creates the public `avatars` storage bucket (2 MB max, `image/jpeg`, `image/png`, `image/webp`) with per-user folder RLS policies, and defines the `delete_my_account()` RPC.
3. **`0003_grants.sql`** — Explicitly grants table, sequence, and function privileges to `authenticated` (required on newer Supabase projects that do not auto-grant privileges).
4. **`seed.sql`** *(optional, dev only)* — Populates sample sessions, progress, comments, and reactions for existing auth users.

**Key Postgres details to keep in mind when modifying queries:**
- **Explicit FK hints:** Tables with multiple relationships to `profiles` use explicit PostgREST FK hints in client `.select()` calls: `sessions_host_id_fkey`, `participants_user_id_fkey`, `comments_author_id_fkey`, and `reactions_user_id_fkey`.
- **Sessions & chapters are immutable:** Direct `INSERT`/`UPDATE`/`DELETE` on `sessions` and `chapters` is disallowed by RLS; sessions are created exclusively through `supabase.rpc('create_session', ...)`.
- **RLS is authenticated-only:** Anonymous users have no read or write access to tables.

### 2. Web App (`web/src/`)

- **Routing & Auth (`App.jsx`, `auth.jsx`):** `AuthProvider` subscribes to `supabase.auth.onAuthStateChange` and loads the user's `profiles` row. `Protected` wraps authenticated routes (`/`, `/new`, `/s/:id`, `/profile`) inside `Layout`, while `PublicOnly` wraps `/login`, `/register`, and `/forgot`. `/reset` is accessible directly for password-recovery links.
- **Realtime Session Detail (`pages/SessionDetail.jsx`):** Loads session metadata, chapters, participants, and the latest comments (paginated via `limit`, reversed for chronological display). Subscribes to `postgres_changes` on `comments`, `participants`, and `reactions` and refetches with a 250 ms debounce. Progress updates apply optimistically before writing to `participants`.
- **Avatar Upload (`pages/Profile.jsx`, `utils.js`):** Center-crops the chosen image to a 256×256 WebP in an offscreen `<canvas>`, deletes previous files in `<user_id>/`, uploads to `<user_id>/avatar-<timestamp>.webp` in the `avatars` bucket, and saves the public URL to `profiles.avatar_url`.
- **Internationalization (`i18n.jsx`, `locales/en.json`, `locales/my.json`):** `I18nProvider` loads the saved language from `localStorage` (`bf_lang`) or falls back to browser locale / English, updates `<html lang>` and `document.title`, and provides `t(key, vars)` with `{placeholder}` interpolation and English fallback. `LanguageSwitcher` appears in the navbar, on the profile page, and on auth pages. `styles.css` loads `Noto Sans Myanmar` and increases line-height under `html[lang='my']` for Burmese script clarity.

### 3. Mobile App (`mobile/`)

- **Supabase & Persistence (`src/supabase.ts`):** Uses `react-native-url-polyfill/auto` and `@react-native-async-storage/async-storage` so auth sessions persist across app restarts (`detectSessionInUrl: false`).
- **Navigation & Deep Linking (`App.tsx`):** Uses `@react-navigation/native-stack` with linking prefixes `[Linking.createURL('/'), 'booksandfriends://']` mapping `session/:id` → `Session` and `reset` → `Reset`. Incoming password-recovery URLs are parsed for either PKCE `code` (`exchangeCodeForSession`) or implicit `#access_token` (`setSession`).
- **Avatar Upload (`src/screens/ProfileScreen.tsx`, `src/utils.ts`):** Uses `expo-image-picker` with native 1:1 square cropping (`allowsEditing: true, aspect: [1, 1]`), resizes to 256×256 via `expo-image-manipulator` (WebP on Android, JPEG on iOS where WebP encoding isn't supported), and uploads the `ArrayBuffer` to `<user_id>/avatar-<timestamp>.<ext>`.
- **Reactions & Sharing (`src/components/Comment.tsx`, `src/screens/SessionScreen.tsx`):** Tapping a reaction pill toggles it; long-pressing shows an `Alert` listing who reacted. The **Share** button uses React Native's `Share` API with a `booksandfriends://session/:id` deep link.

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A Supabase project (see [`web/supabase/README.md`](web/supabase/README.md) for SQL migrations and Auth settings)
- For mobile: Expo Go app on iOS/Android, or an Android emulator / iOS simulator

### 1. Configure Supabase

1. Run `web/supabase/migrations/0001_init.sql`, `0002_avatars_and_account_deletion.sql`, and `0003_grants.sql` in order in the Supabase SQL Editor.
2. In **Authentication → Providers → Email**, enable Email sign-in (optionally disable "Confirm email" during local development).
3. In **Authentication → URL Configuration**, set Site URL to `http://localhost:5173` and add redirect URLs for mobile password resets (`booksandfriends://reset`, plus your Expo Go `exp://…` URL during dev).

### 2. Run the Web App

```bash
cd web
cp .env.example .env
# Edit .env with your Supabase URL and publishable key (sb_publishable_...)
npm install
npm run dev
```

Other web scripts:
- `npm run build` — production Vite build to `web/dist/`
- `npm run preview` — preview the production build locally

### 3. Run the Mobile App

```bash
cd mobile
cp .env.example .env
# Edit .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm install
npm start
```

Other mobile scripts:
- `npm run android` / `npm run ios` / `npm run web` — launch directly on a target platform
- `npx tsc --noEmit` — TypeScript type check

---

## Notes & Gotchas

- **Never use the Supabase secret / service-role key** in `web/` or `mobile/`; both apps only use the publishable key.
- **Re-run `0003_grants.sql`** whenever new tables or functions are added in future migrations.
- **New schema changes** should be added as new numbered migration files (`0004_…sql`) rather than editing already-applied migrations.
