# CineRecap MM — Movie Recap & Review (Web + Mobile)

A standalone Web and Mobile studio that lets you paste any YouTube or supported video URL, automatically detect its spoken language, transcribe it, translate or rewrite it into a **Burmese (မြန်မာဘာသာ)** movie recap/review script, choose from **10+ Burmese voice-over personas** (male, female, young lady, young man, old man, grandmother, cinematic trailer, suspense, anime, documentary), **replace the original video's voice**, and **download the final dubbed MP4 video** (plus MP3 voice-over & SRT subtitles).

---

## Project Structure

```text
movie-recap/
├── backend/   # Python FastAPI + yt-dlp + FFmpeg (imageio-ffmpeg) + Edge TTS + Gemini/OpenAI
├── web/       # React 19 + Vite + TypeScript studio UI
└── mobile/    # React Native + Expo + TypeScript app
```

---

## 1. Run the Backend (`movie-recap/backend`)

```powershell
cd movie-recap\backend
copy .env.example .env
# Optionally add GEMINI_API_KEY or OPENAI_API_KEY in .env
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

- **Zero manual FFmpeg setup needed:** `imageio-ffmpeg` bundles FFmpeg automatically (or uses system `ffmpeg` if on PATH).
- **Works out of the box:** Videos with captions + free Burmese translation + 10 Edge TTS Burmese voice personas work even before adding an API key. Adding `GEMINI_API_KEY` or `OPENAI_API_KEY` unlocks full audio ASR (for videos without captions) and AI Movie Recap / Review storytelling rewrites.

---

## 2. Run the Web Studio (`movie-recap/web`)

```powershell
cd movie-recap\web
npm install
npm run dev
```

Open `http://localhost:5174` in your browser.

---

## 3. Run the Mobile App (`movie-recap/mobile`)

```powershell
cd movie-recap\mobile
copy .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend LAN IP (or http://10.0.2.2:8000 for Android emulator)
npm install
npm start
```
