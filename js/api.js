/**
 * Browser fetches for WHALE INTELLIGENCE.
 * DexScreener: token markets. GeckoTerminal: pool trades.
 * Public Solana RPC: per-wallet history. No API keys.
 */
(function (root) {
  var WI = root.WI;
  var DEX = "https://api.dexscreener.com";
  var GECKO = "https://api.geckoterminal.com/api/v2";
  var RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com"
  ];
  var stickyRpc = null;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
    var ctrl = new AbortController();
    setTimeout(function () { ctrl.abort(); }, ms);
    return ctrl.signal;
  }

  async function getJson(url, ms) {
    var res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: timeoutSignal(ms || 15000)
    });
    if (res.status === 429) {
      var limited = new Error("Rate limited (429)");
      limited.code = 429;
      throw limited;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function rpc(method, params) {
    var urls = stickyRpc ? [stickyRpc].concat(RPCS.filter(function (url) { return url !== stickyRpc; })) : RPCS.slice();
    var last = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
          signal: timeoutSignal(15000)
        });
        if (!res.ok) { last = new Error("HTTP " + res.status); continue; }
        var json = await res.json();
        if (json.error) { last = new Error(json.error.message || "RPC error"); continue; }
        stickyRpc = urls[i];
        return json.result;
      } catch (err) {
        last = err;
      }
    }
    throw last || new Error("All Solana RPCs failed");
  }

  async function loadMints(mints) {
    var unique = [];
    var seen = new Set();
    (mints || []).forEach(function (mint) {
      if (!mint || seen.has(mint) || WI.EXCLUDE_MINTS[mint]) return;
      seen.add(mint);
      unique.push(mint);
    });
    var pairs = [];
    for (var i = 0; i < unique.length; i += 30) {
      var chunk = unique.slice(i, i + 30);
      var data = await getJson(DEX + "/tokens/v1/solana/" + chunk.join(","));
      if (Array.isArray(data)) pairs = pairs.concat(data);
    }
    return Array.from(WI.bestPairsByMint(pairs).values());
  }

  async function loadSolanaCoins() {
    var notes = [];
    var boosts = [];
    var latest = [];
    var profiles = [];
    try {
      var lists = await Promise.all([
        getJson(DEX + "/token-boosts/top/v1"),
        getJson(DEX + "/token-boosts/latest/v1"),
        getJson(DEX + "/token-profiles/latest/v1")
      ]);
      boosts = lists[0] || [];
      latest = lists[1] || [];
      profiles = lists[2] || [];
    } catch (err) {
      notes.push("DexScreener list failed: " + err.message);
      return { coins: [], notes: notes, ok: false };
    }
    var mints = [];
    var seen = new Set();
    boosts.concat(latest, profiles).forEach(function (row) {
      if (!row || row.chainId !== "solana" || !row.tokenAddress) return;
      if (WI.EXCLUDE_MINTS[row.tokenAddress] || seen.has(row.tokenAddress)) return;
      seen.add(row.tokenAddress);
      mints.push(row.tokenAddress);
    });
    var coins = [];
    try {
      coins = await loadMints(mints.slice(0, 60));
    } catch (err) {
      notes.push("DexScreener token batch failed: " + err.message);
      return { coins: [], notes: notes, ok: false };
    }
    return { coins: coins, notes: notes, ok: coins.length > 0 };
  }

  async function loadPoolTrades(coin) {
    var url = GECKO + "/networks/solana/pools/" + encodeURIComponent(coin.pairAddress) + "/trades?trade_volume_in_usd_greater_than=500";
    var data;
    try {
      data = await getJson(url);
    } catch (err) {
      if (err.code === 429) {
        await delay(1200);
        data = await getJson(url);
      } else {
        throw err;
      }
    }
    var trades = [];
    ((data && data.data) || []).forEach(function (row) {
      var attr = row.attributes || {};
      var side = WI.tradeSide(coin.mint, attr.from_token_address, attr.to_token_address, attr.kind);
      var usd = Number(attr.volume_in_usd);
      var time = Date.parse(attr.block_timestamp);
      if (!side || !isFinite(usd) || !WI.isAddr(attr.tx_from_address)) return;
      trades.push({
        id: (attr.tx_hash || row.id) + ":" + side + ":" + coin.mint,
        time: isFinite(time) ? time : 0,
        wallet: attr.tx_from_address,
        mint: coin.mint,
        symbol: coin.symbol,
        name: coin.name,
        marketCap: coin.marketCap,
        liquidity: coin.liquidity,
        priceUsd: coin.priceUsd,
        side: side,
        usd: usd,
        usdEstimated: false,
        signature: attr.tx_hash || "",
        source: "geckoterminal",
        demo: false,
        pairUrl: coin.pairUrl,
        dex: coin.dex
      });
    });
    return trades;
  }

  async function loadLive(opts) {
    var options = opts || {};
    var minMcap = Number(options.minMcap);
    if (!isFinite(minMcap)) minMcap = 0;
    var market = await loadSolanaCoins();
    var notes = market.notes.slice();
    var eligible = market.coins.filter(function (coin) {
      return coin.pairAddress && WI.passesMcap(coin.marketCap, minMcap);
    }).sort(function (a, b) {
      return (b.volume24 || 0) - (a.volume24 || 0);
    }).slice(0, 6);

    var trades = [];
    var scanned = [];
    var failed = 0;
    for (var i = 0; i < eligible.length; i++) {
      var coin = eligible[i];
      if (options.onProgress) options.onProgress(i + 1, eligible.length, coin.symbol);
      try {
        var rows = await loadPoolTrades(coin);
        trades = trades.concat(rows);
        scanned.push({ symbol: coin.symbol, mint: coin.mint, trades: rows.length });
      } catch (err) {
        failed += 1;
        notes.push("GeckoTerminal trades for " + coin.symbol + " failed: " + err.message);
      }
      if (i < eligible.length - 1) await delay(250);
    }

    return {
      coins: market.coins,
      trades: WI.dedupeTrades(trades),
      scanned: scanned,
      notes: notes,
      marketOk: market.ok,
      tradesOk: eligible.length === 0 ? market.ok : failed < eligible.length,
      partial: failed > 0,
      scannedFloor: minMcap
    };
  }

  async function loadWalletHistory(address) {
    var sigs = await rpc("getSignaturesForAddress", [address, { limit: 8 }]);
    var list = Array.isArray(sigs) ? sigs : [];
    var events = [];
    var fetched = 0;
    var lastError = null;
    for (var i = 0; i < list.length; i++) {
      var sig = list[i];
      if (!sig || !sig.signature || sig.err) continue;
      try {
        var tx = await rpc("getTransaction", [sig.signature, {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0
        }]);
        fetched += 1;
        if (tx) events = events.concat(WI.parseRpcSwaps(address, tx, sig.signature));
      } catch (err) {
        lastError = err;
      }
      if (i < list.length - 1) await delay(80);
    }
    if (!fetched && list.length && lastError) throw lastError;

    var mints = [];
    var seen = new Set();
    events.forEach(function (event) {
      if (!seen.has(event.mint)) { seen.add(event.mint); mints.push(event.mint); }
    });
    var meta = new Map();
    var enrichError = null;
    if (mints.length) {
      try {
        var coins = await loadMints(mints);
        coins.forEach(function (coin) { meta.set(coin.mint, coin); });
      } catch (err) {
        enrichError = err.message;
      }
    }

    var trades = events.map(function (event) {
      var coin = meta.get(event.mint);
      var price = coin && coin.priceUsd != null ? coin.priceUsd : null;
      var usd = price != null ? event.tokenAmount * price : null;
      return {
        id: event.signature + ":" + event.side + ":" + event.mint,
        time: event.time,
        wallet: address,
        mint: event.mint,
        symbol: coin ? coin.symbol : event.mint.slice(0, 4),
        name: coin ? coin.name : "Unknown token",
        marketCap: coin ? coin.marketCap : null,
        liquidity: coin ? coin.liquidity : null,
        priceUsd: price,
        side: event.side,
        usd: usd,
        usdEstimated: true,
        tokenAmount: event.tokenAmount,
        signature: event.signature,
        source: "solana-rpc",
        demo: false,
        pairUrl: coin ? coin.pairUrl : "",
        dex: coin ? coin.dex : ""
      };
    });

    return {
      trades: trades,
      signatures: list.length,
      fetched: fetched,
      enrichError: enrichError
    };
  }

  root.WIApi = {
    loadLive: loadLive,
    loadWalletHistory: loadWalletHistory,
    loadMints: loadMints
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
