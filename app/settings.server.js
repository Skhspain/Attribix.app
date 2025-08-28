// app/settings.server.js
let _settings = {
  pixelId: "",
  ga4Id: "",
  adsId: "",
  enabled: false,
  requireConsent: false,
};

export async function getSettings() {
  return _settings;
}

export async function setSettings(data) {
  _settings = { ..._settings, ...data };
}