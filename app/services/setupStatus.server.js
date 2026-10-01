// Setup status, computed once so the Setup guide and Overview always agree.
// Each step is "done" only when it's verifiably working, with a reason when
// it isn't — connecting an account isn't the same as data arriving.
import db from "~/db.server";
import { formatDateTime } from "~/utils/formatDate";

export async function getSetupStatus(shop) {
  const DAY = 24 * 3600e3;
  const [meta, google, tracking, lastTrackedOrder, lastSentOrder] = await Promise.all([
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.purchase.findFirst({ where: { shop, visitorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    db.purchase.findFirst({ where: { shop, capiSentAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
  ]);
  const { isWidgetsEmbedLive } = await import("~/services/themeEditor.server");
  const widgetsLive = await Promise.race([isWidgetsEmbedLive(shop), new Promise((r) => setTimeout(() => r(null), 2500))]).catch(() => null);

  const recent = (d, days) => !!d && Date.now() - new Date(d).getTime() < days * DAY;
  const metaTokenOk = !!(meta?.accessToken && meta.accessToken !== "__PENDING__");
  const googleTokenOk = !!(google?.accessToken && google.accessToken !== "__PENDING__");

  const steps = {
    meta: !metaTokenOk
      ? { done: false, detail: "Not connected." }
      : !meta.adAccountId
        ? { done: false, detail: "Connected, but no ad account chosen yet." }
        : recent(meta.lastSyncedAt, 2)
          ? { done: true, detail: `Spend last synced ${formatDateTime(meta.lastSyncedAt)}.` }
          : { done: false, detail: meta.lastSyncedAt ? `Last sync ${formatDateTime(meta.lastSyncedAt)} — more than 2 days ago.` : "Connected, but spend hasn't synced yet." },
    google: !googleTokenOk
      ? { done: false, detail: "Not connected." }
      : !google.adCustomerId
        ? { done: false, detail: "Connected, but no ad account chosen yet." }
        : google.lastSyncError
          ? { done: false, detail: `Connected, but spend isn't syncing: ${google.lastSyncError}` }
          : recent(google.lastSyncedAt, 2)
            ? { done: true, detail: `Spend last synced ${formatDateTime(google.lastSyncedAt)}.` }
            : { done: false, detail: "Connected, but spend hasn't synced yet." },
    tracking: !tracking?.trackingEnabled
      ? { done: false, detail: "Tracking is switched off in Tracking & Attribution settings." }
      : recent(tracking?.pixelLastSeenAt, 2)
        ? { done: true, detail: `Last storefront event ${formatDateTime(tracking.pixelLastSeenAt)}.` }
        : { done: false, detail: tracking?.pixelLastSeenAt ? `No storefront events since ${formatDateTime(tracking.pixelLastSeenAt)}.` : "No storefront events received yet." },
    conversions: recent(lastTrackedOrder?.createdAt, 30)
      ? { done: true, detail: `Last order with a tracked visit: ${formatDateTime(lastTrackedOrder.createdAt)}.${lastSentOrder ? ` Last purchase sent to ad platforms: ${formatDateTime(lastSentOrder.createdAt)}.` : ""}` }
      : { done: false, detail: "No order with a tracked visit in the last 30 days yet." },
    widgets: widgetsLive === null
      ? { done: false, detail: "Couldn't check your storefront right now.", unknown: true }
      : widgetsLive
        ? { done: true, detail: "The Attribix Widgets app embed is on in your live theme." }
        : { done: false, detail: "The Attribix Widgets app embed isn't on in your live theme, so reviews and newsletter forms won't show." },
  };

  steps.meta.connected = metaTokenOk;
  steps.google.connected = googleTokenOk;
  const list = Object.values(steps).filter((st) => !st.unknown);
  return { steps, done: list.filter((st) => st.done).length, total: list.length };
}
