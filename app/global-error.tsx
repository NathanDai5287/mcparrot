"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: 48 }}>
        <h1>Something went wrong</h1>
        <p>MCParrot could not load. Your saved apps and tools are unchanged.</p>
        <button onClick={() => retry()}>Try again</button>
      </body>
    </html>
  );
}
