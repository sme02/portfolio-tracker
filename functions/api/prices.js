/**
 * Cloudflare Pages Function: /api/prices
 *
 * Query params:
 *   symbols=AIQ,VOO,FBTC,...   (comma-separated ticker list)
 *
 * Returns:
 *   { prices: { AIQ: 64.85, VOO: 689.28, ... }, updatedAt: <iso string> }
 *
 * Caches responses at the edge for 60 seconds so rapid refreshes
 * don't hammer Yahoo Finance.
 */

const CACHE_TTL = 60; // seconds

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const symbolsParam = url.searchParams.get("symbols") || "";
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  if (!symbols.length) {
        return json({ error: "No symbols provided" }, 400);
  }

  // Yahoo Finance v8 on query2 — more reliable from server/edge environments.
  // Adding corsDomain + Referer makes it appear as a same-origin request from
  // finance.yahoo.com, which avoids the bot-detection blocks on query1/v7.
  const yahooUrl =
        `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&fields=regularMarketPrice,symbol&corsDomain=finance.yahoo.com`;

  let yahooRes;
    try {
          yahooRes = await fetch(yahooUrl, {
                  headers: {
                            "User-Agent":
                              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                            "Accept": "application/json",
                            "Referer": "https://finance.yahoo.com/",
                            "Origin": "https://finance.yahoo.com",
                  },
                  // Cloudflare edge cache: reuse the upstream response for CACHE_TTL seconds
                  cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
          });
    } catch (err) {
          return json({ error: `Upstream fetch failed: ${err.message}` }, 502);
    }

  if (!yahooRes.ok) {
        return json({ error: `Yahoo returned HTTP ${yahooRes.status}` }, 502);
  }

  let data;
    try {
          data = await yahooRes.json();
    } catch {
          return json({ error: "Failed to parse Yahoo response" }, 502);
    }

  const results = data?.quoteResponse?.result;
    if (!Array.isArray(results)) {
          return json({ error: "Unexpected Yahoo response shape" }, 502);
    }

  const prices = {};
    for (const quote of results) {
          const sym = quote.symbol;
          const price = quote.regularMarketPrice;
          if (sym && typeof price === "number" && isFinite(price)) {
                  prices[sym] = price;
          }
    }

  const missed = symbols.filter((s) => prices[s] == null);

  const response = json(
    { prices, updatedAt: new Date().toISOString(), missed },
        200
      );

  // Tell the browser to cache for CACHE_TTL seconds too
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    // Allow the browser app (same origin on Pages) to read this
  response.headers.set("Access-Control-Allow-Origin", "*");

  return response;
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
    });
}
