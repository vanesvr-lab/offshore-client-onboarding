import { setupServer } from "msw/node";
import { supabaseHandlers } from "./handlers/supabase";
import { anthropicHandlers } from "./handlers/anthropic";
import { resendHandlers } from "./handlers/resend";

export const server = setupServer(
  ...supabaseHandlers,
  ...anthropicHandlers,
  ...resendHandlers,
);
