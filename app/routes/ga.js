import { corsHeaders, handleCorsPreflight } from "../settings.server";

export const loader = async ({ request }) => {
  const pre = handleCorsPreflight(request);
  if (pre) return pre;

  return new Response("", { headers: corsHeaders });
};
