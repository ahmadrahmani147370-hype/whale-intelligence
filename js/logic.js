/**
 * Pure helpers for WHALE INTELLIGENCE.
 * No network and no DOM. Safe to load in the browser or in Node tests.
 */
(function (root) {
  var EXCLUDE_MINTS = {
    So11111111111111111111111111111111111111112: 1, // wSOL
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 1, // USDC
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 1, // USDT
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 1, // JUP
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 1, // RAY
    jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: 1, // JTO
    HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: 1, // PYTH
    "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ": 1, // W
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 1, // mSOL
    J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 1, // JitoSOL
    bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: 1 // bSOL
  };

  var QUOTE_MINTS = {
    So11111111111111111111111111111111111111112: 1,
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 1,
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 1
  };

  var EXCLUDE_SYMBOLS = {
    SOL: 1, WSOL: 1, USDC: 1, USDT: 1, JUP: 1, RAY: 1, JTO: 1, PYTH: 1,
    MSOL: 1, JITOSOL: 1, BSOL: 1, JLP: 1
  };

  var WINDOWS = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, all: Infinity };
  var B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  var SIG = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

  function isAddr(value) {
    return typeof value === "string" && B58.test(value);
  }

  function isSig(value) {
    return typeof value === "string" && SIG.test(value);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function formatUsd(n) {
    if (n == null || !isFinite(n)) return "—";
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n);
    if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "K";
    return sign + "$" + a.toFixed(0);
  }

  function formatNet(n) {
    if (n == null || !isFinite(n)) return "—";
    if (n > 0) return "+" + formatUsd(n);
    return formatUsd(n);
  }

  function formatPrice(n) {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1) return "$" + n.toFixed(2);
    if (n >= 0.01) return "$" + n.toFixed(4);
    return "$" + Number(n).toPrecision(3);
  }

  function netClass(n) {
    if (n > 0) return "buy";
    if (n < 0) return "sell";
    return "muted";
  }

  function shortAddr(addr) {
    if (!addr || addr.length < 10) return addr || "";
    return addr.slice(0, 4) + "…" + addr.slice(-4);
  }

  function formatTime(ms, now) {
    if (!ms) return "—";
    var delta = Math.round(((now || Date.now()) - ms) / 1000);
    if (delta < 0) return "just now";
    if (delta < 60) return delta + "s ago";
    var m = Math.round(delta / 60);
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }

  function utc(ms) {
    if (!ms) return "";
    try { return new Date(ms).toISOString(); } catch (e) { return ""; }
  }

  function uiAmount(balance) {
    if (!balance || !balance.uiTokenAmount) return 0;
    var ui = balance.uiTokenAmount;
    if (ui.uiAmount != null && isFinite(Number(ui.uiAmount))) return Number(ui.uiAmount);
    if (ui.uiAmountString != null && isFinite(Number(ui.uiAmountString))) return Number(ui.uiAmountString);
    return 0;
  }

  function pairScore(pair) {
    var liq = Number(pair && pair.liquidity && pair.liquidity.usd) || 0;
    var quote = pair && pair.quoteToken && pair.quoteToken.address;
    return (QUOTE_MINTS[quote] ? 1e15 : 0) + liq;
  }

  function coinFromPair(pair) {
    var liq = pair.liquidity && pair.liquidity.usd != null ? Number(pair.liquidity.usd) : null;
    var mc = pair.marketCap != null ? Number(pair.marketCap) : null;
    var price = pair.priceUsd != null ? Number(pair.priceUsd) : null;
    var vol = pair.volume && pair.volume.h24 != null ? Number(pair.volume.h24) : null;
    var url = typeof pair.url === "string" && pair.url.indexOf("https://dexscreener.com/") === 0 ? pair.url : "";
    return {
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol || "?",
      name: pair.baseToken.name || pair.baseToken.symbol || "Unknown",
      priceUsd: isFinite(price) ? price : null,
      marketCap: isFinite(mc) ? mc : null,
      liquidity: isFinite(liq) ? liq : null,
      volume24: isFinite(vol) ? vol : null,
      dex: pair.dexId || "",
      pairAddress: pair.pairAddress || "",
      pairUrl: url,
      chain: "solana",
      demo: false,
      source: "dexscreener"
    };
  }

  function bestPairsByMint(pairs) {
    var best = new Map();
    (pairs || []).forEach(function (pair) {
      if (!pair || pair.chainId !== "solana" || !pair.baseToken || !pair.baseToken.address) return;
      var mint = pair.baseToken.address;
      if (EXCLUDE_MINTS[mint]) return;
      var sym = String(pair.baseToken.symbol || "").toUpperCase();
      if (EXCLUDE_SYMBOLS[sym]) return;
      var prev = best.get(mint);
      if (!prev || pairScore(pair) > pairScore(prev)) best.set(mint, pair);
    });
    var out = new Map();
    best.forEach(function (pair, mint) { out.set(mint, coinFromPair(pair)); });
    return out;
  }

  function tradeSide(base, fromMint, toMint, kind) {
    if (toMint && toMint === base) return "buy";
    if (fromMint && fromMint === base) return "sell";
    if (kind === "buy" || kind === "sell") return kind;
    return null;
  }

  function dedupeTrades(trades) {
    var map = new Map();
    (trades || []).forEach(function (trade) {
      var key = trade.signature
        ? trade.signature + "|" + trade.mint + "|" + trade.side + "|" + trade.wallet
        : trade.id;
      if (!map.has(key)) map.set(key, trade);
    });
    return Array.from(map.values());
  }

  function readWhaleFile(list) {
    var verified = [];
    var unverified = [];
    var skipped = [];
    var seen = new Set();
    function take(entries, bucket, blockVerified) {
      (entries || []).forEach(function (row) {
        if (!row || !isAddr(row.address)) { skipped.push(row); return; }
        if (seen.has(row.address)) return;
        if (blockVerified && verified.some(function (w) { return w.address === row.address; })) return;
        seen.add(row.address);
        bucket.push({ address: row.address, label: String(row.label || "").slice(0, 80) });
      });
    }
    take(list && list.verified, verified, false);
    (list && list.unverified || []).forEach(function (row) {
      if (!row || !isAddr(row.address)) { skipped.push(row); return; }
      if (verified.some(function (w) { return w.address === row.address; })) return;
      if (seen.has(row.address)) return;
      seen.add(row.address);
      unverified.push({ address: row.address, label: String(row.label || "").slice(0, 80) });
    });
    return { verified: verified, unverified: unverified, skipped: skipped };
  }

  /**
   * dir.user is a Map of address -> tier and wins over the lists.
   * dir.verified and dir.unverified are Sets.
   * Anything else is unverified (observed, not on a list).
   */
  function tierOf(address, dir) {
    if (dir && dir.user && dir.user.has(address)) return dir.user.get(address);
    if (dir && dir.verified && dir.verified.has(address)) return "verified";
    if (dir && dir.unverified && dir.unverified.has(address)) return "unverified";
    return "unverified";
  }

  function applyTradeFilters(trades, settings, locks, now) {
    var cfg = settings || {};
    var lock = locks || {};
    var win = WINDOWS[cfg.window] != null ? WINDOWS[cfg.window] : WINDOWS["24h"];
    var minMcap = Number(cfg.minMcap);
    var minTrade = Number(cfg.minTrade);
    if (!isFinite(minMcap)) minMcap = 0;
    if (!isFinite(minTrade)) minTrade = 0;
    var tier = lock.tier || cfg.tier || "all";
    var side = lock.side || cfg.side || "all";
    var clock = now || Date.now();
    return (trades || []).filter(function (trade) {
      if (tier !== "all" && trade.tier !== tier) return false;
      if (side !== "all" && trade.side !== side) return false;
      if (!trade.time) {
        if (cfg.window !== "all") return false;
      } else if (win !== Infinity && (clock - trade.time) > win) {
        return false;
      }
      if (minMcap > 0 && (trade.marketCap == null || trade.marketCap < minMcap)) return false;
      if (minTrade > 0 && (trade.usd == null || !isFinite(trade.usd) || trade.usd < minTrade)) return false;
      return true;
    });
  }

  function totals(trades) {
    function blank() {
      return { buyUsd: 0, sellUsd: 0, buyCount: 0, sellCount: 0, missing: 0, wallets: new Set() };
    }
    var verified = blank();
    var unverified = blank();
    (trades || []).forEach(function (trade) {
      var bucket = trade.tier === "verified" ? verified : unverified;
      var usd = Number(trade.usd);
      if (!isFinite(usd)) { bucket.missing += 1; return; }
      if (trade.side === "sell") { bucket.sellUsd += usd; bucket.sellCount += 1; }
      else { bucket.buyUsd += usd; bucket.buyCount += 1; }
      bucket.wallets.add(trade.wallet);
    });
    function finish(bucket) {
      return {
        buyUsd: bucket.buyUsd,
        sellUsd: bucket.sellUsd,
        buyCount: bucket.buyCount,
        sellCount: bucket.sellCount,
        missing: bucket.missing,
        wallets: bucket.wallets.size,
        net: bucket.buyUsd - bucket.sellUsd
      };
    }
    var v = finish(verified);
    var u = finish(unverified);
    var walletSet = new Set();
    (trades || []).forEach(function (trade) { if (trade.wallet) walletSet.add(trade.wallet); });
    return {
      verified: v,
      unverified: u,
      combined: {
        buyUsd: v.buyUsd + u.buyUsd,
        sellUsd: v.sellUsd + u.sellUsd,
        buyCount: v.buyCount + u.buyCount,
        sellCount: v.sellCount + u.sellCount,
        missing: v.missing + u.missing,
        wallets: walletSet.size,
        net: (v.buyUsd + u.buyUsd) - (v.sellUsd + u.sellUsd)
      }
    };
  }

  function byCoin(trades, coins) {
    var map = new Map();
    function ensure(seed) {
      if (map.has(seed.mint)) return map.get(seed.mint);
      var row = {
        mint: seed.mint,
        symbol: seed.symbol || "?",
        name: seed.name || "",
        marketCap: seed.marketCap != null ? seed.marketCap : null,
        liquidity: seed.liquidity != null ? seed.liquidity : null,
        priceUsd: seed.priceUsd != null ? seed.priceUsd : null,
        volume24: seed.volume24 != null ? seed.volume24 : null,
        pairUrl: seed.pairUrl || "",
        dex: seed.dex || "",
        demo: !!seed.demo,
        verifiedBuy: 0,
        verifiedSell: 0,
        unverifiedBuy: 0,
        unverifiedSell: 0,
        verifiedCount: 0,
        unverifiedCount: 0
      };
      map.set(seed.mint, row);
      return row;
    }
    (coins || []).forEach(ensure);
    (trades || []).forEach(function (trade) {
      var row = ensure(trade);
      var usd = Number(trade.usd);
      var add = isFinite(usd) ? usd : 0;
      var verified = trade.tier === "verified";
      if (trade.side === "sell") {
        if (verified) row.verifiedSell += add; else row.unverifiedSell += add;
      } else if (verified) row.verifiedBuy += add; else row.unverifiedBuy += add;
      if (verified) row.verifiedCount += 1; else row.unverifiedCount += 1;
    });
    map.forEach(function (row) {
      row.combinedBuy = row.verifiedBuy + row.unverifiedBuy;
      row.combinedSell = row.verifiedSell + row.unverifiedSell;
      row.combinedNet = row.combinedBuy - row.combinedSell;
    });
    return Array.from(map.values());
  }

  function byWallet(trades) {
    var map = new Map();
    (trades || []).forEach(function (trade) {
      if (!map.has(trade.wallet)) {
        map.set(trade.wallet, {
          address: trade.wallet,
          tier: trade.tier,
          buyUsd: 0,
          sellUsd: 0,
          count: 0,
          last: 0
        });
      }
      var row = map.get(trade.wallet);
      row.tier = trade.tier;
      var usd = Number(trade.usd);
      if (isFinite(usd)) {
        if (trade.side === "sell") row.sellUsd += usd; else row.buyUsd += usd;
      }
      row.count += 1;
      if (trade.time > row.last) row.last = trade.time;
    });
    map.forEach(function (row) {
      row.net = row.buyUsd - row.sellUsd;
      row.absNet = Math.abs(row.net);
    });
    return Array.from(map.values());
  }

  function sortRows(rows, key, dir) {
    var m = dir === "asc" ? 1 : -1;
    return (rows || []).slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      var aNil = av == null || av === "";
      var bNil = bv == null || bv === "";
      if (aNil && bNil) return 0;
      if (aNil) return 1;
      if (bNil) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * m;
      return String(av).localeCompare(String(bv)) * m;
    });
  }

  function matchesQuery(query, values) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return false;
    return (values || []).some(function (value) {
      return String(value == null ? "" : value).toLowerCase().indexOf(q) !== -1;
    });
  }

  function passesMcap(marketCap, minMcap) {
    var min = Number(minMcap);
    if (!isFinite(min) || min <= 0) return true;
    return marketCap != null && isFinite(marketCap) && marketCap >= min;
  }

  function parseRpcSwaps(wallet, tx, signature) {
    if (!tx || !tx.meta || tx.meta.err) return [];
    var pre = new Map();
    var post = new Map();
    (tx.meta.preTokenBalances || []).forEach(function (bal) {
      if (bal && bal.owner === wallet && bal.mint) pre.set(bal.mint, uiAmount(bal));
    });
    (tx.meta.postTokenBalances || []).forEach(function (bal) {
      if (bal && bal.owner === wallet && bal.mint) post.set(bal.mint, uiAmount(bal));
    });
    var mints = new Set(Array.from(pre.keys()).concat(Array.from(post.keys())));
    var events = [];
    mints.forEach(function (mint) {
      if (EXCLUDE_MINTS[mint]) return;
      var delta = (post.get(mint) || 0) - (pre.get(mint) || 0);
      if (!isFinite(delta) || Math.abs(delta) < 1e-12) return;
      events.push({
        mint: mint,
        side: delta > 0 ? "buy" : "sell",
        tokenAmount: Math.abs(delta),
        signature: signature,
        time: (tx.blockTime || 0) * 1000,
        source: "solana-rpc",
        usdEstimated: true
      });
    });
    return events;
  }

  root.WI = {
    EXCLUDE_MINTS: EXCLUDE_MINTS,
    EXCLUDE_SYMBOLS: EXCLUDE_SYMBOLS,
    QUOTE_MINTS: QUOTE_MINTS,
    WINDOWS: WINDOWS,
    isAddr: isAddr,
    isSig: isSig,
    esc: esc,
    formatUsd: formatUsd,
    formatNet: formatNet,
    formatPrice: formatPrice,
    netClass: netClass,
    shortAddr: shortAddr,
    formatTime: formatTime,
    utc: utc,
    pairScore: pairScore,
    coinFromPair: coinFromPair,
    bestPairsByMint: bestPairsByMint,
    tradeSide: tradeSide,
    dedupeTrades: dedupeTrades,
    readWhaleFile: readWhaleFile,
    tierOf: tierOf,
    applyTradeFilters: applyTradeFilters,
    totals: totals,
    byCoin: byCoin,
    byWallet: byWallet,
    sortRows: sortRows,
    matchesQuery: matchesQuery,
    passesMcap: passesMcap,
    parseRpcSwaps: parseRpcSwaps
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
