import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

Sentry.init({
  ...sentryOptions,
  integrations: [Sentry.replayIntegration()],
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
