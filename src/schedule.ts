/**
 * schedule.ts: the injected timer. Booth debounces with it and the photo desk
 * arms its time limit with it, so tests drive both without sleeping.
 */

/** Runs `fn` after `ms` and returns a function that cancels it. */
export type Schedule = (fn: () => void, ms: number) => () => void;

export const setTimer: Schedule = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};
