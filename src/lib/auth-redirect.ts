const KEY = "relay-after-login";

/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}
export function rememberNextPath(path: string) {
  const safe = safeNextPath(path);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
  } catch {
    /* optional */
  }
}
export function takeNextPath(): string {
  try {
    const value = safeNextPath(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return value ?? "/rooms";
  } catch {
    return "/rooms";
  }
}
