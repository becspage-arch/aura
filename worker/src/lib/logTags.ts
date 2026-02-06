export function logTag(tag: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(tag);
    return;
  }
  // Keep it grep-friendly and stable.
  console.log(`${tag} ${JSON.stringify(payload)}`);
}
