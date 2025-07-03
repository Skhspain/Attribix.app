// app/routes/app/seed-test-data.jsx
import { json } from "@remix-run/node";
import prisma from "../../db.server";

export const loader = async () => {
  const testData = await prisma.trackedEvent.create({
    data: {
      eventName: "Purchase",
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "summer-sale",
      shop: "attribix-com.myshopify.com",
      orderId: "order_123",
      value: 99.99,
      currency: "USD",
      email: "test@example.com",
      createdAt: new Date(),
      products: {
        create: [
          {
            productId: "prod_123",
            productName: "Test Product",
            quantity: 1,
          },
        ],
      },
    },
  });

  return json({ seeded: true, testData });
};