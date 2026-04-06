// All server-side queries now use createAdminClient() directly.
// This re-export exists for backwards compatibility during migration.
export { createAdminClient as createClient } from "./admin";
