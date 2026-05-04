import { http, HttpResponse } from "msw";

/**
 * Default no-op Anthropic handler — returns a minimal Messages API response
 * shape so route handlers that call `anthropic.messages.create()` don't crash.
 * Override per-test with `server.use(http.post("https://api.anthropic.com/v1/messages", …))`.
 */
export const anthropicHandlers = [
  http.post("https://api.anthropic.com/v1/messages", async () => {
    return HttpResponse.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-6",
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  }),
  http.all("https://api.anthropic.com/*", async ({ request }) => {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[msw:anthropic] unmatched call to ${request.url}`);
    }
    return HttpResponse.json({});
  }),
];
