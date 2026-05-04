import { http, HttpResponse } from "msw";

/**
 * Default success handler for Resend's emails endpoint. Tests can spy on calls
 * by overriding via `server.use(...)` and capturing the request.
 */
export const resendHandlers = [
  http.post("https://api.resend.com/emails", async () => {
    return HttpResponse.json({ id: "email_test_id" });
  }),
  http.all("https://api.resend.com/*", async ({ request }) => {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[msw:resend] unmatched call to ${request.url}`);
    }
    return HttpResponse.json({});
  }),
];
