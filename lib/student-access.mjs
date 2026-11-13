// Independent, fail-closed defense in depth for the student Worker.
// Cloudflare Access must also protect the Worker at the edge. This is NOT an
// alternative to an owner-maintained email allowlist in Zero Trust.
const jwksCache = new Map();

function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
}

function configuredTeamDomain(value) {
  if (typeof value !== "string") return "";
  const domain = value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*\.cloudflareaccess\.com$/.test(domain)) return "";
  return domain;
}

export function isRestrictedStudentPath(pathname) {
  try {
    const normalized = decodeURIComponent(pathname).replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
    return /^\/(?:api\/)?admin(?:\/|$)/.test(normalized);
  } catch {
    return true;
  }
}

export async function authenticateStudentRequest(request, env, now = Date.now()) {
  const teamDomain = configuredTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = typeof env.CHEMATLAS_STUDENT_ACCESS_AUD === "string"
    ? env.CHEMATLAS_STUDENT_ACCESS_AUD.trim() : "";
  if (!teamDomain || !audience) {
    return { ok: false, status: 503, error: "Private student access is not configured." };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 403, error: "Cloudflare Access is required." };
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return { ok: false, status: 403, error: "Invalid Access session." };
  }

  try {
    const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid signing algorithm.");
    if (claims.iss !== `https://${teamDomain}` || typeof claims.sub !== "string" || !claims.sub) {
      throw new Error("Invalid Access token issuer or subject.");
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) throw new Error("Invalid Access token audience.");
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now
      || (typeof claims.nbf === "number" && claims.nbf * 1000 > now + 30_000)) {
      throw new Error("Inactive Access session.");
    }
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Missing verified email.");

    const keys = await loadKeys(teamDomain, now);
    const jwk = keys.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) throw new Error("Unknown Access signing key.");
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decodePart(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error("Invalid Access token signature.");
    return { ok: true, user: { id: claims.sub, email } };
  } catch {
    return { ok: false, status: 403, error: "Cloudflare Access could not verify this session." };
  }
}

async function loadKeys(teamDomain, now) {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > now) return cached.value;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to fetch Access signing keys.");
  const value = await response.json();
  if (!Array.isArray(value.keys)) throw new Error("Invalid Access signing keys.");
  jwksCache.set(teamDomain, { value, expiresAt: now + 5 * 60_000 });
  return value;
}

export function clearStudentAccessKeyCacheForTests() { jwksCache.clear(); }
