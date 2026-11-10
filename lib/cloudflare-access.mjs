const jwksCache = new Map();

function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}

export async function authenticateReviewRequest(request, env, now = Date.now()) {
  const ownerEmail = typeof env.CHEMATLAS_REVIEW_OWNER_EMAIL === "string" ? env.CHEMATLAS_REVIEW_OWNER_EMAIL.trim().toLowerCase() : "";
  const teamDomain = typeof env.CF_ACCESS_TEAM_DOMAIN === "string" ? env.CF_ACCESS_TEAM_DOMAIN.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  const audience = typeof env.CF_ACCESS_AUD === "string" ? env.CF_ACCESS_AUD.trim() : "";
  if (!ownerEmail || !teamDomain || !audience) return { ok: false, status: 503, error: "Private review access is not configured. Set the owner email and Cloudflare Access team/audience bindings." };

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 401, error: "Cloudflare Access authentication is required." };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 401, error: "The Cloudflare Access token is invalid." };

  try {
    const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported token algorithm.");
    const issuer = `https://${teamDomain}`;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !aud.includes(audience) || typeof claims.sub !== "string" || !claims.sub) throw new Error("Token issuer, audience, or subject is invalid.");
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now || (typeof claims.nbf === "number" && claims.nbf * 1000 > now + 30_000)) throw new Error("Token has expired or is not active.");
    const keys = await loadKeys(teamDomain, now);
    const jwk = keys.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) throw new Error("Access signing key is unavailable.");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodePart(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error("Access token signature is invalid.");
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (email !== ownerEmail) return { ok: false, status: 403, error: "This review workspace is restricted to its configured owner." };
    return { ok: true, user: { id: claims.sub, email, name: typeof claims.name === "string" ? claims.name : email } };
  } catch {
    return { ok: false, status: 401, error: "Cloudflare Access could not verify the review session." };
  }
}

async function loadKeys(teamDomain, now) {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > now) return cached.value;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Cloudflare Access signing keys could not be fetched.");
  const value = await response.json();
  if (!Array.isArray(value.keys)) throw new Error("Cloudflare Access signing-key response is invalid.");
  jwksCache.set(teamDomain, { value, expiresAt: now + 5 * 60_000 });
  return value;
}

export function clearAccessKeyCacheForTests() { jwksCache.clear(); }
