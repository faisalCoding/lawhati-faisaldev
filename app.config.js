// app.json holds the configuration. This adds the web version's base path when exporting it.
//
// There is no Firebase here by design: notifications are sent by this project's own sync server,
// signed with its own VAPID keys, and received by a Service Worker (public/sw.js).
module.exports = ({ config }) => {
  if (process.env.WEB_BASE_URL) {
    return { ...config, experiments: { ...config.experiments, baseUrl: process.env.WEB_BASE_URL } };
  }

  return config;
};
