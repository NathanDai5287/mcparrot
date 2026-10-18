import type { Breadcrumb, ErrorEvent, Event, Log, init } from "@sentry/nextjs";

type Options = NonNullable<Parameters<typeof init>[0]>;
type StreamedSpanJSON = Parameters<NonNullable<Options["beforeSendSpan"]>>[0];

const queryString = /\?[^\s#]*/g;
const secretQueryValue = /((?:x-vercel-protection-bypass|token)=)[^&#\s"']*/gi;
const urlKey = /url|target|query|^next\./i;

function scrub(value: unknown) {
  return typeof value === "string" ? value.replace(secretQueryValue, "$1[Filtered]") : value;
}

function stripQuery(value: unknown) {
  return typeof value === "string" ? value.replace(queryString, "") : scrub(value);
}

function scrubAttributes(attributes?: Record<string, unknown>) {
  if (!attributes) return;
  for (const key of Object.keys(attributes)) {
    if (key === "url.query" || key === "http.query") delete attributes[key];
    else attributes[key] = urlKey.test(key) ? stripQuery(attributes[key]) : scrub(attributes[key]);
  }
}

function scrubBreadcrumb(breadcrumb: Breadcrumb) {
  if (breadcrumb.message) breadcrumb.message = stripQuery(breadcrumb.message) as string;
  if (breadcrumb.data) for (const key of ["url", "from", "to"]) if (key in breadcrumb.data) breadcrumb.data[key] = stripQuery(breadcrumb.data[key]);
  scrubAttributes(breadcrumb.data);
  return breadcrumb;
}

function scrubEvent<T extends Event>(event: T) {
  if (event.transaction) event.transaction = stripQuery(event.transaction) as string;
  if (event.message) event.message = scrub(event.message) as string;
  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url) as string;
    delete event.request.query_string;
  }
  for (const exception of event.exception?.values ?? []) if (exception.value) exception.value = scrub(exception.value) as string;
  scrubAttributes(event.contexts?.trace?.data);
  scrubAttributes(event.tags);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = stripQuery(span.description) as string;
    scrubAttributes(span.data);
  }
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  return event;
}

export function scrubDynamicSamplingContext(context: { transaction?: string }) {
  if (context.transaction) context.transaction = stripQuery(context.transaction) as string;
}

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ignoreErrors: [
    /Unsupported protocol version: 2026-07-28/,
    /^The website is signed out\./,
    /^The website blocked the automated browser/,
    /^The website refused the request because its protection code/,
    /^No sign-in is waiting for a code/,
    /^MCParrot only uses pages on /,
    /^The website rejected the saved login/,
    /^Browser Use could not finish signing in/,
    /^MCParrot places orders only when Browser Use Pay with Link is in test mode/,
    /^MCParrot could not confirm that Browser Use Pay with Link/,
    /spending limit, so MCParrot did not place the order/,
    /^The total changed from /,
    /^Ordering is off for this app/,
    /^No order with this ID is waiting/,
    /already has a tool with this name or page/,
  ],
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
  beforeSendSpan: (span: StreamedSpanJSON) => {
    span.name = stripQuery(span.name) as string;
    scrubAttributes(span.attributes);
    return span;
  },
  beforeSend: (event: ErrorEvent) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb: Breadcrumb) => scrubBreadcrumb(breadcrumb),
  beforeSendLog: (log: Log) => {
    log.message = scrub(log.message) as string;
    scrubAttributes(log.attributes);
    return log;
  },
};
