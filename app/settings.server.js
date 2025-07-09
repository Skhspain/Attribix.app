// app/settings.server.js

let _settings = {
  pixelId: "",
  enabled: false,
};

export async function getSettings() {
  return _settings;
}

export async function setSettings({ pixelId, enabled }) {
  _settings = { pixelId, enabled };
}
