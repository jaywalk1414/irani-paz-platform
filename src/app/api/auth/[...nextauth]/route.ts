import { handlers } from "../../../../../auth";
import { authConfig } from "../../../../../auth.config";

console.log("[AUTH API ROUTE]", {
  hasSecret: Boolean(process.env.AUTH_SECRET),
  trustHost: authConfig.trustHost,
});

export const { GET, POST } = handlers;