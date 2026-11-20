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

  async function getJsonRetry(url, attempts) {
    var tries = attempts || 2;
    var last;
    for (var attempt = 0; attempt < tries; attempt++) {
      try {
        return await getJson(url, 8000);
      } catch (err) {
        last = err;
        var message = String(err && err.message || "");
        var retry = err.code === 429 || err.name === "TypeError" || err.name === "AbortError" || /failed to fetch|network/i.test(message);
        if (!retry || attempt === tries - 1) throw err;
        await delay(1200 * (attempt + 1));
      }
    }
    throw last;
  }

  function tokenFromInclude(pool, byId, relName) {
    var rel = pool.relationships && pool.relationships[relName] && pool.relationships[relName].data;
    if (!rel || !byId.has(rel.id)) return null;
    var attrs = byId.get(rel.id).attributes || {};
    if (!attrs.address) return null;
    return { mint: attrs.address, symbol: attrs.symbol || "", name: attrs.name || "" };
  }

  function poolsFromGecko(payload) {
    var byId = new Map();
    (payload.included || []).forEach(function (item) {
      if (item && item.id) byId.set(item.id, item);
    });
    var coins = [];
    (payload.data || []).forEach(function (pool) {
      if (!pool || !pool.attributes || !pool.attributes.address) return;
      var base = tokenFromInclude(pool, byId, "base_token");
      var quote = tokenFromInclude(pool, byId, "quote_token");
      var meme = WI.memeSide(base, quote);
      if (!meme) return;
      var vol = pool.attributes.volume_usd;
      var h24 = vol && typeof vol === "object" ? Number(vol.h24) : Number(vol);
      coins.push({
        mint: meme.mint,
        symbol: meme.symbol || "",
        name: meme.name || "",
        priceUsd: null,
        marketCap: null,
        liquidity: null,
        volume24: isFinite(h24) ? h24 : 0,
        dex: "",
        pairAddress: pool.attributes.address,
        pairUrl: "",
        chain: "solana",
        demo: false,
        source: "geckoterminal"
      });
    });
    return coins;
  }

  function upsertCoin(map, coin) {
    if (!coin || !coin.mint || WI.isNonMeme({ mint: coin.mint, symbol: coin.symbol })) return;
    var prev = map.get(coin.mint);
    if (!prev) {
      map.set(coin.mint, Object.assign({ geckoPair: coin.source === "geckoterminal" && !!coin.pairAddress }, coin));
      return;
    }
    if (coin.pairAddress && coin.source === "geckoterminal" && (!prev.geckoPair || (coin.volume24 || 0) >= (prev.volume24 || 0))) {
      prev.pairAddress = coin.pairAddress;
      prev.geckoPair = true;
    } else if (coin.pairAddress && !prev.pairAddress) {
      prev.pairAddress = coin.pairAddress;
    }
    if (coin.marketCap != null) prev.marketCap = coin.marketCap;
    if (coin.liquidity != null) prev.liquidity = coin.liquidity;
    if (coin.priceUsd != null) prev.priceUsd = coin.priceUsd;
    if (coin.pairUrl) prev.pairUrl = coin.pairUrl;
    if (coin.volume24 && !prev.volume24) prev.volume24 = coin.volume24;
    if (WI.cleanLabel(coin.symbol)) prev.symbol = WI.cleanLabel(coin.symbol);
    if (WI.cleanLabel(coin.name)) prev.name = WI.cleanLabel(coin.name);
    if (coin.dex) prev.dex = coin.dex;
  }

  async function geckoTokenNames(mints) {
    var map = new Map();
    var notes = [];
    for (var i = 0; i < mints.length; i += 10) {
      var chunk = mints.slice(i, i + 10);
      try {
        var data = await getJsonRetry(GECKO + "/networks/solana/tokens/multi/" + chunk.join(","));
        (data.data || []).forEach(function (row) {
          var attrs = row.attributes || {};
          if (!attrs.address) return;
          map.set(attrs.address, { mint: attrs.address, symbol: attrs.symbol || "", name: attrs.name || "" });
        });
      } catch (err) {
        notes.push("GeckoTerminal token names failed: " + err.message);
      }
      if (i + 10 < mints.length) await delay(300);
    }
    return { map: map, notes: notes };
  }

  function applyNames(records, map) {
    (records || []).forEach(function (row) {
      var meta = map.get(row.mint);
      if (!meta) return;
      if (!WI.cleanLabel(row.symbol) && WI.cleanLabel(meta.symbol)) row.symbol = WI.cleanLabel(meta.symbol);
      if (!WI.cleanLabel(row.name) && WI.cleanLabel(meta.name)) row.name = WI.cleanLabel(meta.name);
    });
  }

  async function loadPoolTrades(coin, floor) {
    var minUsd = Math.max(500, Number(floor) || 0);
    var url = GECKO + "/networks/solana/pools/" + encodeURIComponent(coin.pairAddress) + "/trades?trade_volume_in_usd_greater_than=" + minUsd;
    var data = await getJsonRetry(url, 1);
    var trades = [];
    ((data && data.data) || []).forEach(function (row) {
      var attr = row.attributes || {};
      var side = WI.tradeSide(coin.mint, attr.from_token_address, attr.to_token_address);
      var usd = Number(attr.volume_in_usd);
      var time = Date.parse(attr.block_timestamp);
      if (!side || !isFinite(usd) || !WI.isAddr(attr.tx_from_address)) return;
      trades.push({
        id: (attr.tx_hash || row.id) + ":" + side + ":" + coin.mint,
        time: isFinite(time) ? time : 0,
        wallet: attr.tx_from_address,
        mint: coin.mint,
        symbol: WI.cleanLabel(coin.symbol),
        name: WI.cleanLabel(coin.name),
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
    var notes = [];
    var lists = [
      "/networks/solana/dexes/pumpswap/pools?include=base_token,quote_token&sort=h24_volume_usd_desc&page=1"
    ];
    var byMint = new Map();
    var geckoOk = false;
    for (var g = 0; g < lists.length; g++) {
      try {
        var payload = await getJsonRetry(GECKO + lists[g], 1);
        poolsFromGecko(payload).forEach(function (coin) { upsertCoin(byMint, coin); });
        geckoOk = true;
      } catch (err) {
        notes.push("GeckoTerminal pool list failed: " + err.message);
      }
      await delay(280);
    }

    var boostMints = [];
    var seenBoost = new Set();
    try {
      var feeds = await Promise.all([
        getJson(DEX + "/token-boosts/top/v1"),
        getJson(DEX + "/token-boosts/latest/v1"),
        getJson(DEX + "/token-profiles/latest/v1")
      ]);
      feeds.forEach(function (list) {
        (list || []).forEach(function (row) {
          if (!row || row.chainId !== "solana" || !row.tokenAddress || seenBoost.has(row.tokenAddress)) return;
          if (WI.isNonMeme({ mint: row.tokenAddress, symbol: "" })) return;
          seenBoost.add(row.tokenAddress);
          boostMints.push(row.tokenAddress);
        });
      });
    } catch (err) {
      notes.push("DexScreener list failed: " + err.message);
    }

    var lookupMints = Array.from(byMint.keys());
    boostMints.forEach(function (mint) {
      if (lookupMints.indexOf(mint) === -1) lookupMints.push(mint);
    });
    try {
      var dexCoins = await loadMints(lookupMints.slice(0, 60));
      dexCoins.forEach(function (coin) { upsertCoin(byMint, coin); });
    } catch (err) {
      notes.push("DexScreener token batch failed: " + err.message);
    }

    var unnamed = Array.from(byMint.values()).filter(function (coin) {
      return !WI.cleanLabel(coin.symbol) || !WI.cleanLabel(coin.name);
    }).map(function (coin) { return coin.mint; });
    if (unnamed.length) {
      var named = await geckoTokenNames(unnamed.slice(0, 30));
      notes = notes.concat(named.notes);
      applyNames(Array.from(byMint.values()), named.map);
    }

    var coins = Array.from(byMint.values()).filter(function (coin) {
      return WI.memeSide(
        { mint: coin.mint, symbol: coin.symbol, name: coin.name },
        { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Wrapped SOL" }
      );
    });
    var tradeFloor = Math.max(500, Number(options.minTrade) || 0);
    var ranked = coins.filter(function (coin) {
      return coin.pairAddress && WI.passesMcap(coin.marketCap, minMcap);
    }).sort(function (a, b) {
      return (b.volume24 || 0) - (a.volume24 || 0);
    });

    var trades = [];
    var scanned = [];
    var failed = 0;
    var tried = 0;
    for (var i = 0; i < ranked.length && scanned.length < 3 && tried < 6; i++) {
      var coin = ranked[i];
      var label = WI.cleanLabel(coin.symbol) || WI.cleanLabel(coin.name) || WI.shortAddr(coin.mint);
      tried += 1;
      if (options.onProgress) options.onProgress(scanned.length + 1, 4, label);
      try {
        var rows = await loadPoolTrades(coin, tradeFloor);
        if (rows.length) {
          trades = trades.concat(rows);
          scanned.push({ symbol: label, mint: coin.mint, trades: rows.length });
        }
      } catch (err) {
        failed += 1;
        notes.push("GeckoTerminal trades for " + label + " failed: " + err.message);
      }
      if (i < ranked.length - 1 && scanned.length < 3 && tried < 6) await delay(350);
    }

    var missing = [];
    var seenMissing = new Set();
    trades.forEach(function (trade) {
      if ((!WI.cleanLabel(trade.symbol) || !WI.cleanLabel(trade.name)) && !seenMissing.has(trade.mint)) {
        seenMissing.add(trade.mint);
        missing.push(trade.mint);
      }
    });
    if (missing.length) {
      var again = await geckoTokenNames(missing);
      notes = notes.concat(again.notes);
      applyNames(trades, again.map);
      applyNames(coins, again.map);
    }

    var marketOk = geckoOk || coins.length > 0;
    return {
      coins: coins,
      trades: WI.dedupeTrades(trades),
      scanned: scanned,
      notes: notes,
      marketOk: marketOk,
      tradesOk: tried === 0 ? marketOk : (scanned.length > 0 || failed < tried),
      partial: failed > 0,
      scannedFloor: minMcap,
      tradeFloor: tradeFloor
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
      var unnamed = mints.filter(function (mint) {
        var coin = meta.get(mint);
        return !coin || !WI.cleanLabel(coin.symbol) || !WI.cleanLabel(coin.name);
      });
      if (unnamed.length) {
        try {
          var named = await geckoTokenNames(unnamed);
          named.map.forEach(function (token, mint) {
            var prev = meta.get(mint) || { mint: mint, symbol: "", name: "" };
            if (!WI.cleanLabel(prev.symbol)) prev.symbol = token.symbol;
            if (!WI.cleanLabel(prev.name)) prev.name = token.name;
            meta.set(mint, prev);
          });
        } catch (err) {
          enrichError = enrichError || err.message;
        }
      }
    }

    var trades = events.filter(function (event) {
      return !WI.isNonMeme({ mint: event.mint, symbol: (meta.get(event.mint) || {}).symbol || "" });
    }).map(function (event) {
      var coin = meta.get(event.mint);
      var price = coin && coin.priceUsd != null ? coin.priceUsd : null;
      var usd = price != null ? event.tokenAmount * price : null;
      return {
        id: event.signature + ":" + event.side + ":" + event.mint,
        time: event.time,
        wallet: address,
        mint: event.mint,
        symbol: coin ? WI.cleanLabel(coin.symbol) : "",
        name: coin ? WI.cleanLabel(coin.name) : "",
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
