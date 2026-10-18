import * as Sentry from "@sentry/nextjs";
import { scrubDynamicSamplingContext, sentryOptions } from "./lib/sentry-options";

Sentry.init({ ...sentryOptions, tracePropagationTargets: [] });
Sentry.getClient()?.on("createDsc", scrubDynamicSamplingContext);
