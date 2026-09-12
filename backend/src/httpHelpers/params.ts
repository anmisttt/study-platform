export function readParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}
