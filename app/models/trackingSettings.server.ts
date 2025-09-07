// app/models/trackingSettings.server.ts

import prisma from "~/utils/db.server";

export async function getTrackingSettings(shop: string) {
  return prisma.trackingSettings.findUnique({
    where: { shop },
  });
}

export async function updateTrackingSettings(shop: string, data: any) {
  return prisma.trackingSettings.upsert({
    where: { shop },
    update: data,
    create: {
      shop,
      ...data,
    },
  });
}
