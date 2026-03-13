// app/models/trackingSettings.server.ts

import crypto from "node:crypto";
import prisma from "~/db.server";

function makeTrackingKey() {
  return `tk_${crypto.randomBytes(24).toString("hex")}`;
}

async function generateUniqueTrackingKey() {
  let key = makeTrackingKey();

  while (true) {
    const existing = await prisma.trackingSettings.findUnique({
      where: { trackingKey: key },
      select: { id: true },
    });

    if (!existing) return key;
    key = makeTrackingKey();
  }
}

export async function getTrackingSettings(shop: string) {
  return prisma.trackingSettings.findUnique({
    where: { shop },
  });
}

export async function getTrackingSettingsByTrackingKey(trackingKey: string) {
  return prisma.trackingSettings.findUnique({
    where: { trackingKey },
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

export const upsertTrackingSettings = updateTrackingSettings;

export async function ensureTrackingKey(shop: string) {
  const existing = await prisma.trackingSettings.findUnique({
    where: { shop },
    select: {
      trackingKey: true,
    },
  });

  if (existing?.trackingKey) {
    return existing.trackingKey;
  }

  const trackingKey = await generateUniqueTrackingKey();

  await prisma.trackingSettings.upsert({
    where: { shop },
    update: {
      trackingKey,
      trackingEnabled: true,
    },
    create: {
      shop,
      trackingKey,
      trackingEnabled: true,
    },
  });

  return trackingKey;
}

export async function rotateTrackingKey(shop: string) {
  const trackingKey = await generateUniqueTrackingKey();

  await prisma.trackingSettings.upsert({
    where: { shop },
    update: {
      trackingKey,
      trackingEnabled: true,
    },
    create: {
      shop,
      trackingKey,
      trackingEnabled: true,
    },
  });

  return trackingKey;
}

export async function touchTrackingHealth(
  shop: string,
  options?: { pixelSeen?: boolean },
) {
  const now = new Date();

  const existing = await prisma.trackingSettings.findUnique({
    where: { shop },
    select: { id: true },
  });

  if (!existing) {
    const trackingKey = await generateUniqueTrackingKey();

    return prisma.trackingSettings.create({
      data: {
        shop,
        trackingKey,
        trackingEnabled: true,
        installedAt: now,
        lastEventAt: now,
        pixelLastSeenAt: options?.pixelSeen ? now : null,
      },
    });
  }

  return prisma.trackingSettings.update({
    where: { shop },
    data: {
      lastEventAt: now,
      ...(options?.pixelSeen ? { pixelLastSeenAt: now } : {}),
    },
  });
}