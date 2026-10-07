# Rest Dinkers

A mobile-first pickleball rotation and scoring MVP built with Next.js and TypeScript.

## Local development

```bash
npm install
npm run dev
```

The app keeps a local browser copy and, when Firebase is configured, adds email/password and Google login with automatic Firestore persistence. Active sessions resume across devices, while ended sessions remain archived with their matches and player statistics.

## Firebase setup

1. Create a Firebase web app and copy the four `NEXT_PUBLIC_FIREBASE_*` values from `env.example` into `.env.local` and Vercel.
2. Enable Email/Password and Google under Firebase Authentication → Sign-in method.
3. Create a Firestore database and publish the included `firestore.rules`.
4. Add `pickled-pink.vercel.app` under Firebase Authentication → Settings → Authorized domains.

## Scoring defaults

The Double Serve mode starts at `0 - 0 - 1`, keeps Team A and Team B in fixed display positions, awards points only to the serving team, and uses a straight race to 11.
