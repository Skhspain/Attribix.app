import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "~/utils/db.server";


export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const rows = await prisma.$queryRaw`
    SELECT e.utmSource as utmSource, p.productName as productName, SUM(p.quantity) as totalSold
    FROM TrackedEvent e
    JOIN TrackedProduct p ON p.eventId = e.id
    GROUP BY e.utmSource, p.productName
  `;
  return json(rows);
};

export default function ProductReport() {
  const data = useLoaderData();
  return (
    <div style={{ padding: 20 }}>
      <h1>Product Attribution Report</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
