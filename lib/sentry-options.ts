export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
};
