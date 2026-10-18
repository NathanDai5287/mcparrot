"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const narrowScreen = "(max-width: 700px)";

function watchScreenWidth(onChange: () => void) {
  const query = window.matchMedia(narrowScreen);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isNarrowScreen = () => window.matchMedia(narrowScreen).matches;

export function SetupCard({ title, status, className = "", children }: { title: string; status?: string; className?: string; children: ReactNode }) {
  const narrow = useSyncExternalStore(watchScreenWidth, isNarrowScreen, () => false);
  return <details className={`setup-card ${className}`} open={!narrow}>
    <summary><h2>{title}</h2>{status && <span className="setup-status">{status}</span>}<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg></summary>
    <div className="setup-card-body">{children}</div>
  </details>;
}
