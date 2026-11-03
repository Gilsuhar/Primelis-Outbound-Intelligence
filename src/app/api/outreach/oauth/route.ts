export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export {
  connectionPage as GET,
  startConnection as POST,
} from "@/server/integrations/outreach-oauth-http";
