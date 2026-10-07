# Rest Dinkers

A mobile-first pickleball rotation and scoring MVP built with Next.js and TypeScript.

## Local development

```bash
npm install
npm run dev
```

The current vertical slice stores the active session in browser local storage. Firebase client and Admin initialization boundaries are included; copy `env.example` to `.env.local` and add project credentials before enabling shared authentication and Firestore persistence.

## Scoring defaults

The Double Serve mode starts at `0 - 0 - 1`, keeps Team A and Team B in fixed display positions, awards points only to the serving team, and uses a straight race to 11.
