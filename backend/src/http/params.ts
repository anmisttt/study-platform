export function readParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function readQueryParam(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}
