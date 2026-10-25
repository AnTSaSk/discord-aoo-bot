const injectedVersion = process.env.APP_VERSION;

export const runningVersion: string | undefined =
  injectedVersion === undefined || injectedVersion === '' ? undefined : injectedVersion;
