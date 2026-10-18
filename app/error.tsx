"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main id="main-content">
      <h1>Something went wrong</h1>
      <p className="field-help">MCParrot could not show this page. Your saved apps and tasks are unchanged.</p>
      <div className="form-actions"><button className="button primary" onClick={() => retry()}>Try again</button></div>
    </main>
  );
}
