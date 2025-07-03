export function normalizeCampaign(campaign) {
  if (!campaign || campaign.trim() === "") {
    return "Direct / Unknown";
  }
  return campaign;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function groupEventsByDate(events) {
  const byDate = {};
  for (const ev of events) {
    const key = new Date(ev.createdAt).toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + (ev.value ?? 0);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([date, value]) => ({ date, value }));
}