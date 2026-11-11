# interview/pro

AI mock interviews with scored reports. Answer by typing or speaking, then get four skill scores, STAR coverage,
delivery stats (filler words, answer length, numbers used) and a stronger version of each answer. A dashboard tracks
progress and the next interview can lean on your weak spots.

## Run it

```bash
npm install
cp .env.example .env     # add GEMINI_API_KEY (and DEEPGRAM_API_KEY for voice)
npm run dev              # http://localhost:5000
```

No keys? Set `AI_PROVIDER=mock` in `.env` for a deterministic offline demo.

| Command | What it does |
|---|---|
| `npm run dev` | Express + Vite dev server |
| `npm run build` / `npm start` | Production build and server (serves `dist/public`) |
| `npm run check` | Type check |
| `npm test` | Unit and API tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, mock AI, throwaway DB) |

## How it works

```
React (wouter, react-query, motion)         Express + Socket.IO + SQLite
  pages: Landing, Auth, Dashboard,    REST    auth.ts      scrypt + httpOnly session cookie
  Setup, Room, Report, History      <------>  routes.ts    /api/auth /api/me /api/stats /api/interviews /api/extract
  useInterviewSocket (one socket)   socket    services/InterviewOrchestrator.ts   live loop, persisted, resumable
                                    <------>  services/ai/  Gemini or Mock behind one interface
                                              services/FeedbackGenerator.ts  scores + report
                                              services/speechStats.ts        deterministic delivery stats
                                              db.ts        schema + repositories (better-sqlite3)
```

Per answer: evaluate (rubric, STAR, improved answer) -> detect pattern -> follow-up or new question. Every message and
answer is saved, so a refresh resumes the interview. Skill scores are plain averages of the stored evaluations (see
`scoreAnswers`); the model only writes the wording. If the model is down the report says so instead of inventing scores.

## Design

Graphite and safety orange, Instrument Sans with DM Mono for numbers. Motion uses `motion` and the motion-primitives
`AnimatedNumber`, and respects reduced motion.

## Limits

- One server process: live sessions are in memory (the database lets them resume). Scale-out needs shared session state.
- The rate limiter is in memory.
- Voice mode needs a Deepgram key and a microphone; it is not covered by automated tests.
- Netlify can host the client only. Run the server elsewhere and set `VITE_SOCKET_URL` and `CLIENT_ORIGIN`.
