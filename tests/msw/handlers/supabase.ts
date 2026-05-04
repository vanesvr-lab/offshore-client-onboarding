import { http, HttpResponse } from "msw";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test.supabase.co";

/**
 * Per-table-per-method response store. Tests call
 *   mockSupabase({ tableName: { select: data, insert: data, update: data } })
 * to override responses; default is 200 with an empty array.
 *
 * Each value can be either a literal response or a function:
 *   `(req: Request) => unknown`. Use a function when the response should
 *   depend on the request body / URL (e.g. lookups by id).
 */
type Method = "select" | "insert" | "update" | "delete" | "upsert";
type ResponseFactory = (req: Request) => unknown | Promise<unknown>;
type TableMock = Partial<Record<Method, unknown | ResponseFactory>>;

const tableMocks = new Map<string, TableMock>();

export function mockSupabase(mocks: Record<string, TableMock>) {
  for (const [table, mock] of Object.entries(mocks)) {
    tableMocks.set(table, mock);
  }
}

export function resetSupabaseMocks() {
  tableMocks.clear();
}

function tableFromUrl(url: string): string {
  const match = url.match(/\/rest\/v1\/([^/?]+)/);
  return match?.[1] ?? "";
}

async function resolve(value: unknown | ResponseFactory, req: Request): Promise<unknown> {
  if (typeof value === "function") return await (value as ResponseFactory)(req);
  return value;
}

/**
 * PostgREST "single object" mode. When the supabase-js client calls `.single()`
 * or `.maybeSingle()`, it sets `Accept: application/vnd.pgrst.object+json`.
 * Return the first item of an array (or the value itself if not an array)
 * so tests can always supply array data and have it work for both shapes.
 */
function shapeForAccept(body: unknown, request: Request): unknown {
  const accept = request.headers.get("Accept") ?? "";
  if (accept.includes("application/vnd.pgrst.object+json")) {
    if (Array.isArray(body)) return body[0] ?? null;
    return body;
  }
  return body;
}

export const supabaseHandlers = [
  // REST: GET (select)
  http.get(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const raw = mock?.select !== undefined ? await resolve(mock.select, request) : [];
    return HttpResponse.json(shapeForAccept(raw, request));
  }),

  // REST: POST (insert / upsert)
  http.post(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const prefer = request.headers.get("Prefer") ?? "";
    const isUpsert = prefer.includes("resolution=merge-duplicates");
    const key: Method = isUpsert ? "upsert" : "insert";

    let raw: unknown;
    if (mock?.[key] !== undefined) {
      raw = await resolve(mock[key], request);
    } else {
      // Default: echo back the inserted record so .select().single() works.
      const body = await request.clone().json().catch(() => ({}));
      raw = body;
    }
    return HttpResponse.json(shapeForAccept(raw, request));
  }),

  // REST: PATCH (update)
  http.patch(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    let raw: unknown;
    if (mock?.update !== undefined) {
      raw = await resolve(mock.update, request);
    } else {
      const body = await request.clone().json().catch(() => ({}));
      raw = body;
    }
    return HttpResponse.json(shapeForAccept(raw, request));
  }),

  // REST: DELETE
  http.delete(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const raw = mock?.delete !== undefined ? await resolve(mock.delete, request) : {};
    return HttpResponse.json(shapeForAccept(raw, request));
  }),

  // Storage object upload (Supabase JS uses POST + multipart for file uploads)
  http.post(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({ Key: "documents/mock", Id: "mock" });
  }),
  http.put(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({ Key: "documents/mock", Id: "mock" });
  }),
  http.delete(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({});
  }),

  // Auth catch-all
  http.all(`${SUPABASE_URL}/auth/v1/*`, async () => {
    return HttpResponse.json({});
  }),

  // Catch-all for any other Supabase URL
  http.all(`${SUPABASE_URL}/*`, async ({ request }) => {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[msw:supabase] unmatched call to ${request.url} (table: ${tableFromUrl(request.url)})`);
    }
    return HttpResponse.json({});
  }),
];
