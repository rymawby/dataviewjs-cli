async function usesAppAfterAwait() {
  await Promise.resolve();
  return app.plugins.plugins.dataview.api.page("Projects/Alpha").file.name;
}

module.exports = usesAppAfterAwait;
