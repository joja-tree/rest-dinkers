"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell loading">
      <h1>Something went out of bounds.</h1>
      <button className="button primary" onClick={reset}>Try again</button>
    </main>
  );
}
