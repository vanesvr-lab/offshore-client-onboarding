import { http, HttpResponse } from "msw";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test.supabase.co";

/**
 * Per-table response store. Tests call `mockSupabase({ tableName: { select, insert, update } })`
 * to inject responses; default is 200 with an empty array.
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

export const supabaseHandlers = [
  // REST: GET (select)
  http.get(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const body = mock?.select !== undefined ? await resolve(mock.select, request) : [];
    return HttpResponse.json(body);
  }),
  // REST: POST (insert / upsert)
  http.post(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const prefer = request.headers.get("Prefer") ?? "";
    const isUpsert = prefer.includes("resolution=merge-duplicates");
    const key: Method = isUpsert ? "upsert" : "insert";
    const body =
      mock?.[key] !== undefined
        ? await resolve(mock[key], request)
        : await request.clone().json().catch(() => ({}));
    return HttpResponse.json(body);
  }),
  // REST: PATCH (update)
  http.patch(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const body =
      mock?.update !== undefined
        ? await resolve(mock.update, request)
        : await request.clone().json().catch(() => ({}));
    return HttpResponse.json(body);
  }),
  // REST: DELETE
  http.delete(`${SUPABASE_URL}/rest/v1/:table`, async ({ request, params }) => {
    const table = String(params.table);
    const mock = tableMocks.get(table);
    const body = mock?.delete !== undefined ? await resolve(mock.delete, request) : {};
    return HttpResponse.json(body);
  }),
  // Storage object upload
  http.post(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({ Key: "documents/mock", Id: "mock" });
  }),
  http.put(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({ Key: "documents/mock", Id: "mock" });
  }),
  http.delete(`${SUPABASE_URL}/storage/v1/object/documents/*`, async () => {
    return HttpResponse.json({});
  }),
  // Auth catch-all (we don't exercise auth in unit/integration tests)
  http.all(`${SUPABASE_URL}/auth/v1/*`, async () => {
    return HttpResponse.json({});
  }),
  // Catch-all for any other Supabase REST that wasn't mocked — return 200 + empty body
  http.all(`${SUPABASE_URL}/*`, async ({ request }) => {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[msw:supabase] unmatched call to ${request.url} (table: ${tableFromUrl(request.url)})`);
    }
    return HttpResponse.json({});
  }),
];
