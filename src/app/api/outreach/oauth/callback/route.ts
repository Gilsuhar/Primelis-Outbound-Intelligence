export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export {
  callbackPage as GET,
  finishConnection as POST,
} from "@/server/integrations/outreach-oauth-http";
