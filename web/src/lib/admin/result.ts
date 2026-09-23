/** The ?done=&name= handshake between a Server Action's redirect and the result modal. */

export const resultKinds = ["created", "saved", "deleted"] as const;
export type ResultKind = (typeof resultKinds)[number];
export interface ActionResult {
  kind: ResultKind;
  name: string;
}

export function withResult(path: string, kind: ResultKind, name: string): string {
  const query = new URLSearchParams({ done: kind, name }).toString();
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export function readResult(params: URLSearchParams): ActionResult | null {
  const kind = params.get("done");
  if (!kind || !(resultKinds as readonly string[]).includes(kind)) return null;
  return { kind: kind as ResultKind, name: params.get("name") ?? "" };
}

/** The query string with the handshake removed ("" or "?a=b"). */
export function withoutResult(params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete("done");
  rest.delete("name");
  const query = rest.toString();
  return query ? `?${query}` : "";
}
