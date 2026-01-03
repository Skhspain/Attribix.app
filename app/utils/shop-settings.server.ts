// app/utils/shop-settings.server.ts
import prisma from "~/db.server";

export type ShopSettingsValues = {
  metaPixelId: string;
  googleAdsId: string;
  googleAdsConversionId: string;
  ga4MeasurementId: string;
  serverEndpoint: string;
  debugMode: boolean;
  enableServerSide: boolean;
};

const DEFAULT_SETTINGS: ShopSettingsValues = {
  metaPixelId: "",
  googleAdsId: "",
  googleAdsConversionId: "",
  ga4MeasurementId: "",
  serverEndpoint: "",
  debugMode: false,
  enableServerSide: true,
};

export async function getShopSettings(
  shopDomain: string,
): Promise<ShopSettingsValues> {
  const existing = await prisma.shopSettings.findUnique({
    where: { shopDomain },
  });

  if (!existing) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    metaPixelId: existing.metaPixelId ?? "",
    googleAdsId: existing.googleAdsId ?? "",
    googleAdsConversionId: existing.googleAdsConversionId ?? "",
    ga4MeasurementId: existing.ga4MeasurementId ?? "",
    serverEndpoint: existing.serverEndpoint ?? "",
    debugMode: existing.debugMode ?? false,
    enableServerSide: existing.enableServerSide ?? true,
  };
}

export async function upsertShopSettings(
  shopDomain: string,
  values: Partial<ShopSettingsValues>,
) {
  return prisma.shopSettings.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      ...DEFAULT_SETTINGS,
      ...values,
    },
    update: {
      ...values,
    },
  });
}
