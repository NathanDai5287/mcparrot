import * as Sentry from "@sentry/nextjs";
import { scrubDynamicSamplingContext, sentryOptions } from "./lib/sentry-options";

Sentry.init({
  ...sentryOptions,
  integrations: [Sentry.replayIntegration({ maskAttributes: ["title", "placeholder", "aria-label", "href", "src"] })],
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1,
});
Sentry.getClient()?.on("createDsc", scrubDynamicSamplingContext);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
