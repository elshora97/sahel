import { adminRaw } from "@/lib/admin/api";
import { assertId } from "@/lib/admin/actions";

/**
 * Streams a payment receipt from the private bucket through the API. Under
 * /dashboard, so the middleware lets only a signed-in admin reach it.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let res: Response;
  try {
    res = await adminRaw(`/payments/${assertId(id)}/proof`);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!res.ok || !res.body) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
