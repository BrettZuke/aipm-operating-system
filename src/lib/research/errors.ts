// A Research failure whose message is written for the person using the dashboard: it says what to
// do, and never names a provider, a key or a stack trace. Server actions show it as it is; every
// other error is logged on the server and replaced with one short sentence.

export class ResearchUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchUserError";
  }
}

/** A key the student has not set yet. The message names the key and where to get one. */
export class MissingKeyError extends ResearchUserError {
  constructor(readonly key: string, message: string) {
    super(message);
    this.name = "MissingKeyError";
  }
}
