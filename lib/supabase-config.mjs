export function validateSupabaseConfig(url, key, prefix) {
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Use the Supabase project origin with HTTPS (HTTP is allowed only on loopback).");
  }
  if (typeof key !== "string" || !key.startsWith("sb_publishable_") || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("Only a Supabase publishable key is accepted by the Pages build.");
  }
  if (!/^shared\/releases\/[a-zA-Z0-9_-]+$/.test(prefix)) {
    throw new Error("Content prefix must be shared/releases/<release-id>.");
  }
  return { url: parsed.origin, key, prefix };
}

export function protectedObjectPath(path, prefix) {
  // Catalog URLs are logical identifiers, never arbitrary authenticated URLs.
  const relative = path.replace(/^\//, "");
  if (!/^(?:student-questions\.json|student-page-audit\.json|classification-method\.md|worksheet-(?:content|sources)\.json|worksheet-fragments\.pdf|stimuli\.json|source\/bank-0[1-8]\.pdf)$/.test(relative)) {
    throw new Error("Unknown protected content path.");
  }
  return `${prefix}/${relative}`;
}
