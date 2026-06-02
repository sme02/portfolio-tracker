/**
 * Cloudflare Pages Function: /api/prices
 * Uses Finnhub.io — fetches all symbols in parallel.
 */

const FINNHUB_TOKEN = "d8fd0a1r01qn4439cdtgd8fd0a1r01qn4439cdu0";
const CACHE_TTL = 60;

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

  const results = await Promise.allSettled(
          symbols.map((sym) =>
                    fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_TOKEN}`)
                              .then((r) => r.json())
                              .then((data) => ({ sym, price: data.c , prevClose: data.pc}))
                          )
        );

  const prices = {};
      const missed = [];
            const prevClose = {};
      results.forEach((r, i) => {
              if (r.status === "fulfilled" && typeof r.value.price === "number" && r.value.price > 0) {
                        prices[r.value.sym] = r.value.price;
                                          if (typeof r.value.prevClose === "number" && r.value.prevClose > 0) {
                                                              prevClose[r.value.sym] = r.value.prevClose;
                                                                                }
              } else {
                        missed.push(symbols[i]);
              }
      });

  const response = json({ prices, prevClose, updatedAt: new Date().toISOString(), missed }, 200);
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
}

function json(body, status = 200) {
      return new Response(JSON.stringify(body), {
              status,
              headers: { "Content-Type": "application/json" },
      });
}
