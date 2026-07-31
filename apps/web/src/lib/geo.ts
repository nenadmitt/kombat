const COUNTRY_CODE = /^[A-Z]{2}$/;
/** Cloudflare returns these for unresolvable clients and Tor exits. */
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE.test(code) && !NOT_A_COUNTRY.has(code) ? code : null;
}

/** First hop of X-Forwarded-For. Spoofable when the app is not behind a proxy
 *  that rewrites it, which is acceptable: this only labels a row in an admin list. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

function isPrivate(ip: string): boolean {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

/**
 * ISO 3166-1 alpha-2 for the request, or null when it cannot be determined.
 * Never throws and never blocks a signup: the CDN header is free when present,
 * and the lookup fallback is time-boxed.
 */
export async function resolveCountry(headers: Headers): Promise<string | null> {
  const fromCdn =
    normalize(headers.get("cf-ipcountry")) ??
    normalize(headers.get("x-vercel-ip-country"));
  if (fromCdn) return fromCdn;

  const ip = clientIp(headers);
  if (!ip || isPrivate(ip)) return null;

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      { signal: AbortSignal.timeout(2000), cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      status?: string;
      countryCode?: string;
    };
    return body.status === "success" ? normalize(body.countryCode) : null;
  } catch {
    return null;
  }
}
