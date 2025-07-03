import { json } from '@remix-run/node';
import db from '../../db.server';

export async function action({ request }) {
  const event = await request.json();

  await db.trackedEvent.create({
    data: {
      ...event,
      timestamp: new Date(),
    },
  });

  return json({ status: 'ok' });
}