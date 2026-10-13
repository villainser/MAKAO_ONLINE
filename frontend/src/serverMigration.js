// Retired endpoints are deployment configuration, never application constants.
export function migrateSavedServer(saved, fallback, retired = '') {
  const normalize = value => (value || '').trim().replace(/\/+$/, '');
  const retiredUrls = retired.split(',').map(normalize).filter(Boolean);
  return saved && !retiredUrls.includes(normalize(saved)) ? saved : fallback;
}
