import { authenticate } from '~/shopify.server';
export const action = async ({ request }: { request: Request }) => {
  await authenticate.webhook(request);
  return new Response('OK');
};
