/**
 * WHALE INTELLIGENCE — pages, filters, search, watchlist, alerts.
 * Hash routes keep the site working on GitHub Pages project URLs.
 */
(function () {
  var WI = window.WI;
  var DEMO = window.DEMO_DATA;
  var SETTINGS_KEY = "wi_settings";
  var WATCH_KEY = "wi_watchlist";
  var USER_KEY = "wi_user_wallets";
  var CACHE_KEY = "wi_live_cache";

  var PAGES = {
    dashboard: "Dashboard",
    verified: "Verified Whales",
    unverified: "Unverified Whales",
    buys: "Whale Buys",
    sells: "Whale Sells",
    coins: "Coins",
    coin: "Coin",
    wallets: "Wallets",
    wallet: "Wallet",
    watchlist: "Watchlist",
    alerts: "Alerts",
    search: "Search"
  };

  var DEFAULT_SORT = {
    dashboard: ["time", "desc"],
    verified: ["absNet", "desc"],
    unverified: ["absNet", "desc"],
    buys: ["combinedBuy", "desc"],
    sells: ["combinedSell", "desc"],
    coins: ["marketCap", "desc"],
    coin: ["time", "desc"],
    wallets: ["absNet", "desc"],
    wallet: ["time", "desc"],
    watchlist: ["absNet", "desc"],
    alerts: ["time", "desc"],
    search: ["marketCap", "desc"]
  };

  var state = {
    settings: loadSettings(),
    live: null,
    loading: false,
    loadToken: 0,
    progress: "",
    chain: {},
    extraCoins: [],
    lookups: {},
    formNotice: "",
    formError: "",
    page: "",
    sortKey: "time",
    sortDir: "desc"
  };

  function storageGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* ignore quota */ }
  }

  function loadSettings() {
    var saved = storageGet(SETTINGS_KEY, {});
    function num(value, fallback) {
      var n = Number(value);
      return isFinite(n) && n >= 0 ? n : fallback;
    }
    return {
      mode: saved.mode === "demo" ? "demo" : "live",
      minMcap: num(saved.minMcap, 1000000),
      minTrade: num(saved.minTrade, 1000),
      tier: saved.tier === "verified" || saved.tier === "unverified" ? saved.tier : "all",
      side: saved.side === "buy" || saved.side === "sell" ? saved.side : "all",
      window: WI.WINDOWS[saved.window] != null ? saved.window : "24h",
      alertUsd: num(saved.alertUsd, 1000)
    };
  }

  function saveSettings() { storageSet(SETTINGS_KEY, state.settings); }

  function loadUser() {
    var rows = storageGet(USER_KEY, []);
    if (!Array.isArray(rows)) return [];
    return rows.filter(function (row) {
      return row && WI.isAddr(row.address) && (row.tier === "verified" || row.tier === "unverified");
    }).map(function (row) {
      return { address: row.address, label: String(row.label || "").slice(0, 80), tier: row.tier };
    });
  }

  function loadWatch() {
    var rows = storageGet(WATCH_KEY, []);
    return Array.isArray(rows) ? rows.filter(WI.isAddr) : [];
  }

  function whaleDir() {
    var user = new Map();
    loadUser().forEach(function (row) { user.set(row.address, row.tier); });
    if (state.settings.mode === "demo") {
      return {
        verified: new Set(DEMO.wallets.verified.map(function (w) { return w.address; })),
        unverified: new Set(DEMO.wallets.unverified.map(function (w) { return w.address; })),
        user: user,
        skipped: []
      };
    }
    var file = WI.readWhaleFile(window.WHALE_LIST || { verified: [], unverified: [] });
    return {
      verified: new Set(file.verified.map(function (w) { return w.address; })),
      unverified: new Set(file.unverified.map(function (w) { return w.address; })),
      user: user,
      skipped: file.skipped
    };
  }

  function labelOf(address) {
    var user = loadUser().find(function (row) { return row.address === address; });
    if (user && user.label) return user.label;
    if (state.settings.mode === "demo") {
      var demo = DEMO.wallets.verified.concat(DEMO.wallets.unverified).find(function (row) {
        return row.address === address;
      });
      if (demo && demo.label) return demo.label;
      return "";
    }
    var file = WI.readWhaleFile(window.WHALE_LIST || {});
    var found = file.verified.concat(file.unverified).find(function (row) { return row.address === address; });
    return found && found.label ? found.label : "";
  }

  function originOf(address, dir) {
    if (dir.user.has(address)) return "browser";
    if (state.settings.mode === "demo" && (dir.verified.has(address) || dir.unverified.has(address))) return "demo";
    if (state.settings.mode !== "demo") {
      var file = WI.readWhaleFile(window.WHALE_LIST || {});
      if (file.verified.concat(file.unverified).some(function (row) { return row.address === address; })) return "file";
    }
    return "observed";
  }

  function route() {
    var raw = (location.hash || "").replace(/^#/, "");
    var qpos = raw.indexOf("?");
    var path = (qpos >= 0 ? raw.slice(0, qpos) : raw).replace(/^\/+/, "");
    var qs = qpos >= 0 ? raw.slice(qpos + 1) : "";
    var parts = path.split("/").filter(Boolean);
    var page = parts[0] || "dashboard";
    var id = parts[1] ? decodeURIComponent(parts[1]) : "";
    return { page: page, id: id, query: new URLSearchParams(qs) };
  }

  function locksFor(page) {
    if (page === "verified") return { tier: "verified" };
    if (page === "unverified") return { tier: "unverified" };
    if (page === "buys") return { side: "buy" };
    if (page === "sells") return { side: "sell" };
    return {};
  }

  function dataset() {
    if (state.settings.mode === "demo") {
      return { coins: DEMO.coins.slice(), trades: DEMO.trades.slice(), reliable: true, demo: true };
    }
    var live = state.live;
    var coins = ((live && live.coins) || []).concat(state.extraCoins);
    var seen = new Set();
    coins = coins.filter(function (coin) {
      if (!coin || seen.has(coin.mint)) return false;
      seen.add(coin.mint);
      return true;
    });
    return {
      coins: coins,
      trades: (live && live.trades) || [],
      reliable: !!(live && live.marketOk && live.tradesOk),
      demo: false,
      ready: !!live
    };
  }

  function tieredTrades() {
    var dir = whaleDir();
    return dataset().trades.map(function (trade) {
      return Object.assign({}, trade, { tier: WI.tierOf(trade.wallet, dir) });
    });
  }

  function filteredTrades() {
    var info = route();
    return WI.applyTradeFilters(tieredTrades(), state.settings, locksFor(info.page));
  }

  function modeBadge() {
    return state.settings.mode === "demo"
      ? '<span class="badge demo">DEMO DATA</span>'
      : '<span class="badge live">LIVE</span>';
  }

  function tierBadge(tier) {
    return tier === "verified"
      ? '<span class="badge tier-verified">VERIFIED</span>'
      : '<span class="badge tier-unverified">UNVERIFIED</span>';
  }

  function sourceBadge(trade) {
    if (trade.demo) return '<span class="badge demo">DEMO DATA</span>';
    var html = '<span class="badge live">LIVE</span>';
    if (trade.usdEstimated) html += ' <span class="badge est">ESTIMATE</span>';
    return html;
  }

  function originBadge(origin) {
    if (origin === "demo") return '<span class="badge demo">DEMO DATA</span>';
    if (origin === "file") return "whales.js";
    if (origin === "browser") return "This browser";
    return "Observed";
  }

  function txLink(trade) {
    if (trade.demo || !WI.isSig(trade.signature)) return "";
    return ' <a href="https://solscan.io/tx/' + trade.signature + '" target="_blank" rel="noopener">tx</a>';
  }

  function money(trade) {
    if (trade.usd == null || !isFinite(trade.usd)) return "—";
    return (trade.usdEstimated ? "~" : "") + WI.formatUsd(trade.usd);
  }

  function watchButtons(address) {
    var on = loadWatch().indexOf(address) !== -1;
    if (on) {
      return '<button type="button" class="small" data-watch-remove="' + WI.esc(address) + '">Remove from watchlist</button>';
    }
    return '<button type="button" class="small" data-watch-add="' + WI.esc(address) + '">Add to watchlist</button>';
  }

  function trackButtons(address, origin) {
    var html = watchButtons(address);
    if (origin === "browser") {
      html += ' <button type="button" class="small" data-forget="' + WI.esc(address) + '">Remove wallet</button>';
    } else if (origin === "observed") {
      html += ' <button type="button" class="small" data-track="' + WI.esc(address) + '" data-tier="verified">Save as verified</button>';
      html += ' <button type="button" class="small" data-track="' + WI.esc(address) + '" data-tier="unverified">Save as unverified</button>';
    }
    return '<div class="actions">' + html + "</div>";
  }

  function coinCell(row) {
    var parts = WI.coinParts(row || {});
    var label = parts.symbol || parts.name || parts.fallback || "Unknown";
    var extra = parts.symbol && parts.name ? ' <span class="coin-name">' + WI.esc(parts.name) + "</span>" : "";
    var text = WI.esc(label) + extra;
    if (!WI.isAddr(row && row.mint)) return text;
    return '<a class="coin-link" href="#/coin/' + encodeURIComponent(row.mint) + '">' + text + "</a>";
  }

  function walletLink(address) {
    if (!WI.isAddr(address)) return WI.esc(address || "");
    var label = labelOf(address);
    var text = WI.shortAddr(address) + (label ? " " + label : "");
    return '<a href="#/wallet/' + encodeURIComponent(address) + '" title="' + WI.esc(address) + '">' + WI.esc(text) + "</a>";
  }

  function renderTable(caption, columns, rows, empty) {
    var head = columns.map(function (col) {
      var active = state.sortKey === col.key;
      var aria = active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none";
      var mark = active ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
      return '<th scope="col"><button type="button" data-sort="' + WI.esc(col.key) + '" aria-sort="' + aria + '">' +
        WI.esc(col.label) + mark + "</button></th>";
    }).join("");
    var body = rows.length
      ? rows.map(function (row) {
        return "<tr>" + columns.map(function (col) {
          return '<td class="' + (col.cls ? col.cls(row) : "") + '">' + col.cell(row) + "</td>";
        }).join("") + "</tr>";
      }).join("")
      : '<tr><td colspan="' + columns.length + '">' + WI.esc(empty || "Nothing to show for these filters.") + "</td></tr>";
    return '<div class="table-wrap"><table><caption>' + WI.esc(caption) + "</caption><thead><tr>" +
      head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function tradeColumns() {
    return [
      { key: "time", label: "Time", cell: function (t) {
        return '<span title="' + WI.esc(WI.utc(t.time)) + '">' + WI.esc(WI.formatTime(t.time)) + "</span>";
      } },
      { key: "tier", label: "Tier", cell: function (t) { return tierBadge(t.tier); } },
      { key: "side", label: "Side", cls: function (t) { return t.side === "sell" ? "sell" : "buy"; }, cell: function (t) {
        return t.side === "sell" ? "SELL" : "BUY";
      } },
      { key: "symbol", label: "Coin", cell: function (t) { return coinCell(t); } },
      { key: "usd", label: "USD", cls: function () { return "num"; }, cell: function (t) { return WI.esc(money(t)); } },
      { key: "wallet", label: "Wallet", cell: function (t) { return walletLink(t.wallet); } },
      { key: "marketCap", label: "Market cap", cls: function () { return "num"; }, cell: function (t) {
        return WI.esc(WI.formatUsd(t.marketCap));
      } },
      { key: "source", label: "Source", cell: function (t) { return sourceBadge(t) + txLink(t); } }
    ];
  }

  function sorted(rows) {
    return WI.sortRows(rows, state.sortKey, state.sortDir);
  }

  function shownRows(rows, limit) {
    var ordered = sorted(rows);
    if (ordered.length <= limit) return { rows: ordered, note: "" };
    return {
      rows: ordered.slice(0, limit),
      note: "Showing " + limit + " of " + ordered.length + " rows. Totals still use every trade that passed the filters."
    };
  }

  function statGroup(id, title, tot) {
    return '<section class="group group-' + id + '" aria-label="' + WI.esc(title) + '">' +
      "<h2>" + WI.esc(title) + " " + modeBadge() + "</h2>" +
      '<div class="figures">' +
      '<p><span>Buys</span><strong id="stat-' + id + '-buys" class="buy">' + WI.esc(WI.formatUsd(tot.buyUsd)) +
      "</strong><small>" + tot.buyCount + " trades</small></p>" +
      '<p><span>Sells</span><strong id="stat-' + id + '-sells" class="sell">' + WI.esc(WI.formatUsd(tot.sellUsd)) +
      "</strong><small>" + tot.sellCount + " trades</small></p>" +
      '<p><span>Net flow</span><strong id="stat-' + id + '-net" class="' + WI.netClass(tot.net) + '">' +
      WI.esc(WI.formatNet(tot.net)) + "</strong><small>" + tot.wallets + " wallets</small></p>" +
      "</div></section>";
  }

  function addForm(defaultTier) {
    return '<form class="stack" data-add-wallet>' +
      "<label>Wallet address<input name=\"address\" autocomplete=\"off\" spellcheck=\"false\" required placeholder=\"Solana address\"></label>" +
      "<label>Label<input name=\"label\" maxlength=\"80\" placeholder=\"Optional label\"></label>" +
      '<label>List<select name="tier"><option value="verified"' + (defaultTier === "verified" ? " selected" : "") +
      '>Verified</option><option value="unverified"' + (defaultTier !== "verified" ? " selected" : "") +
      ">Unverified</option></select></label>" +
      '<div class="actions"><button type="submit">Add wallet</button></div>' +
      (state.formError ? '<p class="err">' + WI.esc(state.formError) + "</p>" : "") +
      (state.formNotice ? '<p class="note">' + WI.esc(state.formNotice) + "</p>" : "") +
      '<p class="note">Saved in this browser only. Shared lists are edited in data/whales.js. Adding a wallet does not create trades.</p>' +
      "</form>";
  }

  function walletRows(tier) {
    var dir = whaleDir();
    var trades = filteredTrades();
    var stats = new Map();
    WI.byWallet(trades).forEach(function (row) { stats.set(row.address, row); });
    var seen = new Set();
    var rows = [];
    function add(address) {
      if (!WI.isAddr(address) || seen.has(address)) return;
      if (WI.tierOf(address, dir) !== tier && tier !== "all") return;
      seen.add(address);
      var stat = stats.get(address) || {
        address: address,
        tier: WI.tierOf(address, dir),
        buyUsd: 0,
        sellUsd: 0,
        net: 0,
        absNet: 0,
        count: 0,
        last: 0
      };
      stat.label = labelOf(address);
      stat.origin = originOf(address, dir);
      stat.tier = WI.tierOf(address, dir);
      rows.push(stat);
    }
    if (tier === "all" || tier === "verified") dir.verified.forEach(add);
    if (tier === "all" || tier === "unverified") dir.unverified.forEach(add);
    dir.user.forEach(function (userTier, address) {
      if (tier === "all" || userTier === tier) add(address);
    });
    if (tier === "all" || tier === "unverified") {
      tieredTrades().forEach(function (trade) { add(trade.wallet); });
    }
    return rows.filter(function (row) {
      if (tier !== "all" && row.tier !== tier) return false;
      if (row.origin === "observed" && row.count === 0) return false;
      return true;
    });
  }

  function walletColumns() {
    return [
      { key: "label", label: "Wallet", cell: function (row) { return walletLink(row.address); } },
      { key: "tier", label: "Tier", cell: function (row) { return tierBadge(row.tier); } },
      { key: "origin", label: "List", cell: function (row) { return originBadge(row.origin); } },
      { key: "buyUsd", label: "Buys", cls: function () { return "num buy"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.buyUsd)); } },
      { key: "sellUsd", label: "Sells", cls: function () { return "num sell"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.sellUsd)); } },
      { key: "net", label: "Net", cls: function (row) { return "num " + WI.netClass(row.net); }, cell: function (row) { return WI.esc(WI.formatNet(row.net)); } },
      { key: "last", label: "Last", cell: function (row) { return WI.esc(row.last ? WI.formatTime(row.last) : "—"); } },
      { key: "address", label: "Watch", cell: function (row) { return trackButtons(row.address, row.origin); } }
    ];
  }

  function coinColumns() {
    return [
      { key: "symbol", label: "Coin", cell: function (row) { return coinCell(row); } },
      { key: "priceUsd", label: "Price", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatPrice(row.priceUsd)); } },
      { key: "marketCap", label: "Market cap", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.marketCap)); } },
      { key: "liquidity", label: "Liquidity", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.liquidity)); } },
      { key: "verifiedBuy", label: "Verified buys", cls: function () { return "num buy"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.verifiedBuy)); } },
      { key: "unverifiedBuy", label: "Unverified buys", cls: function () { return "num buy"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.unverifiedBuy)); } },
      { key: "combinedBuy", label: "Combined buys", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.combinedBuy)); } },
      { key: "verifiedSell", label: "Verified sells", cls: function () { return "num sell"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.verifiedSell)); } },
      { key: "unverifiedSell", label: "Unverified sells", cls: function () { return "num sell"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.unverifiedSell)); } },
      { key: "combinedSell", label: "Combined sells", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.combinedSell)); } }
    ];
  }

  function flowColumns(kind) {
    var verifiedKey = kind === "sell" ? "verifiedSell" : "verifiedBuy";
    var unverifiedKey = kind === "sell" ? "unverifiedSell" : "unverifiedBuy";
    var combinedKey = kind === "sell" ? "combinedSell" : "combinedBuy";
    return [
      { key: "symbol", label: "Coin", cell: function (row) { return coinCell(row); } },
      { key: verifiedKey, label: "Verified", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row[verifiedKey])); } },
      { key: unverifiedKey, label: "Unverified", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row[unverifiedKey])); } },
      { key: combinedKey, label: "Combined", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row[combinedKey])); } },
      { key: "marketCap", label: "Market cap", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.marketCap)); } },
      { key: "liquidity", label: "Liquidity", cls: function () { return "num"; }, cell: function (row) { return WI.esc(WI.formatUsd(row.liquidity)); } }
    ];
  }

  function marketGate() {
    if (state.settings.mode === "demo") return "";
    if (state.loading && !state.live) {
      return "<h2 class=\"page-title\">" + WI.esc(PAGES[route().page] || "WHALE INTELLIGENCE") + " " + modeBadge() +
        "</h2>" + unavailable();
    }
    if (state.live && !state.live.marketOk) {
      return "<h2 class=\"page-title\">" + WI.esc(PAGES[route().page] || "WHALE INTELLIGENCE") + " " + modeBadge() +
        "</h2>" + unavailable();
    }
    return "";
  }

  function unavailable() {
    if (state.settings.mode === "demo") return "";
    if (state.loading && !state.live) return '<p class="empty" id="result-count">Loading Solana market data…</p>';
    if (!state.live) return '<p class="empty">Live data has not loaded yet.</p>';
    if (!state.live.marketOk) {
      return '<p class="err">Live market data is unavailable. Totals are hidden so a failed request is not shown as zero. ' +
        WI.esc((state.live.notes || []).join(" ")) + "</p>";
    }
    if (!state.live.tradesOk && !(state.live.trades || []).length) {
      return '<p class="err">Pool trades did not load. Buy and sell totals are hidden. ' +
        WI.esc((state.live.notes || []).join(" ")) + "</p>";
    }
    return "";
  }

  function renderDashboard() {
    var blocked = unavailable();
    if (blocked && state.settings.mode !== "demo" && (!state.live || !state.live.marketOk || (!state.live.tradesOk && !state.live.trades.length))) {
      return "<h2 class=\"page-title\">Dashboard " + modeBadge() + "</h2>" + blocked;
    }
    var trades = filteredTrades();
    var tot = WI.totals(trades);
    return "<h2 class=\"page-title\">Dashboard " + modeBadge() + "</h2>" +
      '<p class="note">Verified, unverified, and combined are separate. Combined is the sum of the other two.</p>' +
      '<p id="result-count" class="note">' + trades.length + " trades in these totals.</p>" +
      '<div class="stats">' +
      statGroup("verified", "Verified", tot.verified) +
      statGroup("unverified", "Unverified", tot.unverified) +
      statGroup("combined", "Combined", tot.combined) +
      "</div>" +
      "<h2>Recent trades</h2>" +
      (function () {
        var shown = shownRows(trades, 40);
        return (shown.note ? '<p class="note">' + WI.esc(shown.note) + "</p>" : "") +
          renderTable("Recent whale trades. Verified and unverified stay in their own column.", tradeColumns(), shown.rows);
      })();
  }

  function renderTierPage(tier) {
    var title = tier === "verified" ? "Verified Whales" : "Unverified Whales";
    var rows = sorted(walletRows(tier));
    var allActivity = filteredTrades();
    var activity = shownRows(allActivity, 60);
    var emptyList = tier === "verified"
      ? "No verified wallets yet. Add one below or in data/whales.js. Live mode does not invent verified trades."
      : "No unverified wallets in this filter. Large traders seen in scanned pools show up here in Live mode.";
    return "<h2 class=\"page-title\">" + title + " " + modeBadge() + "</h2>" +
      '<p id="result-count" class="note">' + rows.length + " wallets · " + allActivity.length + " trades.</p>" +
      (rows.length > 80 ? '<p class="note">Showing 80 of ' + rows.length + " wallets.</p>" : "") +
      renderTable(title + " only. The other tier is not mixed into this list.", walletColumns(), rows.slice(0, 80), emptyList) +
      "<h2>Activity</h2>" +
      (activity.note ? '<p class="note">' + WI.esc(activity.note) + "</p>" : "") +
      renderTable(title + " trades.", tradeColumns(), activity.rows) +
      "<h2>Track a wallet</h2>" + addForm(tier);
  }

  function renderFlow(kind) {
    var blocked = marketGate();
    if (blocked) return blocked;
    if (state.settings.mode !== "demo" && state.live && !state.live.tradesOk && !(state.live.trades || []).length) {
      var title = kind === "sell" ? "Whale Sells" : "Whale Buys";
      return "<h2 class=\"page-title\">" + title + " " + modeBadge() + "</h2>" + unavailable();
    }
    var trades = filteredTrades().filter(function (trade) { return trade.side === kind; });
    var rows = WI.byCoin(trades, []).filter(function (row) {
      return kind === "sell" ? row.combinedSell > 0 : row.combinedBuy > 0;
    });
    var title = kind === "sell" ? "Whale Sells" : "Whale Buys";
    return "<h2 class=\"page-title\">" + title + " " + modeBadge() + "</h2>" +
      '<p class="note">Each coin shows verified USD, unverified USD, and the combined sum in its own column.</p>' +
      '<p id="result-count" class="note">' + rows.length + " coins · " + trades.length + " trades.</p>" +
      renderTable(title + " by coin.", flowColumns(kind), sorted(rows));
  }

  function renderCoins() {
    var blocked = marketGate();
    if (blocked) return blocked;
    var coins = dataset().coins.filter(function (coin) {
      return WI.passesMcap(coin.marketCap, state.settings.minMcap);
    });
    var rows = WI.byCoin(filteredTrades(), coins);
    return "<h2 class=\"page-title\">Coins " + modeBadge() + "</h2>" +
      '<p class="note">Solana meme pairs with market cap and liquidity. Whale columns follow the filters and stay split by tier.</p>' +
      '<p id="result-count" class="note">' + rows.length + " coins.</p>" +
      renderTable("Solana meme coins.", coinColumns(), sorted(rows));
  }

  function renderCoin(mint) {
    if (state.settings.mode === "live") ensureMint(mint);
    var coin = dataset().coins.find(function (row) { return row.mint === mint; });
    var coinTrades = filteredTrades().filter(function (trade) { return trade.mint === mint; });
    var pool = shownRows(coinTrades, 60);
    var tot = WI.totals(coinTrades);
    var lookup = state.lookups[mint];
    var parts = coin ? WI.coinParts(coin) : null;
    var heading = "Coin";
    if (parts) {
      heading = WI.esc(parts.symbol || parts.name || WI.shortAddr(coin.mint) || "Coin");
      if (parts.symbol && parts.name) heading += " · " + WI.esc(parts.name);
    }
    var html = "<h2 class=\"page-title\">" + heading + " " + modeBadge() + "</h2>";
    if (!coin && lookup === "loading") return html + '<p class="empty">Looking up this mint on DexScreener…</p>';
    if (!coin && WI.EXCLUDE_MINTS[mint]) return html + '<p class="empty">That mint is on the major or stablecoin exclude list and is not tracked as a meme coin.</p>';
    if (!coin) return html + '<p class="empty">No Solana pair was found for this mint in the loaded data.</p>';
    html += '<p class="note">' + WI.esc(coin.mint) + " " + sourceBadge(coin.demo ? { demo: true } : { demo: false }) + "</p>";
    html += '<div class="detail">' +
      detail("Price", WI.formatPrice(coin.priceUsd)) +
      detail("Market cap", WI.formatUsd(coin.marketCap)) +
      detail("Liquidity", WI.formatUsd(coin.liquidity)) +
      detail("24h volume", WI.formatUsd(coin.volume24)) +
      detail("DEX", coin.dex || "—") +
      "</div>";
    if (coin.pairUrl) {
      html += '<p><a href="' + WI.esc(coin.pairUrl) + '" target="_blank" rel="noopener">Open on DexScreener</a></p>';
    }
    html += '<div class="stats">' +
      statGroup("verified", "Verified", tot.verified) +
      statGroup("unverified", "Unverified", tot.unverified) +
      statGroup("combined", "Combined", tot.combined) +
      "</div>" +
      '<p id="result-count" class="note">' + coinTrades.length + " trades for this coin.</p>" +
      (pool.note ? '<p class="note">' + WI.esc(pool.note) + "</p>" : "") +
      renderTable("Trades for this coin.", tradeColumns(), pool.rows);
    return html;
  }

  function detail(label, value) {
    return "<div><span>" + WI.esc(label) + "</span><strong class=\"num\">" + WI.esc(value) + "</strong></div>";
  }

  function renderWallets() {
    var rows = sorted(walletRows("all"));
    return "<h2 class=\"page-title\">Wallets " + modeBadge() + "</h2>" +
      '<p id="result-count" class="note">' + rows.length + " wallets.</p>" +
      (rows.length > 80 ? '<p class="note">Showing 80 of ' + rows.length + " wallets.</p>" : "") +
      renderTable("Tracked and observed wallets. Verified and unverified are separate rows.", walletColumns(), rows.slice(0, 80), "No wallets yet.") +
      "<h2>Track a wallet</h2>" + addForm("unverified");
  }

  function renderWallet(address) {
    if (!WI.isAddr(address)) return '<p class="err">That is not a Solana address.</p>';
    if (state.settings.mode === "live" && !isDemoAddress(address)) ensureChain(address);
    var dir = whaleDir();
    var tier = WI.tierOf(address, dir);
    var origin = originOf(address, dir);
    var walletTrades = filteredTrades().filter(function (trade) { return trade.wallet === address; });
    var poolShown = shownRows(walletTrades, 40);
    var tot = WI.totals(walletTrades.map(function (trade) { return Object.assign({}, trade, { tier: tier }); }));
    var bucket = tier === "verified" ? tot.verified : tot.unverified;
    var html = "<h2 class=\"page-title\">" + WI.esc(labelOf(address) || "Wallet") + " " + modeBadge() + "</h2>" +
      "<p>" + tierBadge(tier) + " " + originBadge(origin) + "</p>" +
      '<p class="num">' + WI.esc(address) +
      ' <button type="button" class="small" data-copy="' + WI.esc(address) + '">Copy</button></p>' +
      trackButtons(address, origin) +
      "<h2>Scanned pool trades</h2>" +
      '<p class="note">These trades are included in dashboard totals. ' +
      (state.settings.mode === "demo" ? "They are DEMO DATA." : "USD volume comes from GeckoTerminal.") + "</p>" +
      '<div class="detail">' +
      detail("Buys", WI.formatUsd(bucket.buyUsd)) +
      detail("Sells", WI.formatUsd(bucket.sellUsd)) +
      detail("Net flow", WI.formatNet(bucket.net)) +
      "</div>" +
      '<p id="result-count" class="note">' + walletTrades.length + " pool trades.</p>" +
      (poolShown.note ? '<p class="note">' + WI.esc(poolShown.note) + "</p>" : "") +
      renderTable("Pool trades for this wallet.", tradeColumns(), poolShown.rows);
    html += renderChain(address);
    if (origin === "file") {
      html += '<p class="note">This address is in data/whales.js. Remove it there to drop it from the shared list. A browser save can override its tier on this browser.</p>';
    }
    return html;
  }

  function renderChain(address) {
    if (state.settings.mode === "demo" || isDemoAddress(address)) {
      return "<h2>Chain history</h2><p class=\"empty\">Chain history stays off in Demo mode so sample rows are never mixed with Solana RPC.</p>";
    }
    var cur = state.chain[address] || { status: "idle" };
    var html = "<h2>Chain history " + modeBadge() + " <span class=\"badge est\">ESTIMATE</span></h2>" +
      '<p class="note">Latest signatures from a public Solana RPC. USD is the token amount times the current DexScreener price, not the historical fill. These rows are not added to dashboard totals.</p>' +
      '<p><button type="button" class="small" data-reload-chain="' + WI.esc(address) + '">Reload chain history</button></p>';
    if (cur.status === "loading" || cur.status === "idle") return html + '<p class="empty">Loading chain history…</p>';
    if (cur.status === "error") return html + '<p class="err">Solana RPC did not return history. ' + WI.esc(cur.error || "") + "</p>";
    var dir = whaleDir();
    var tier = WI.tierOf(address, dir);
    var poolSigs = new Set(tieredTrades().filter(function (trade) { return trade.wallet === address && trade.signature; }).map(function (trade) { return trade.signature; }));
    var rows = (cur.trades || []).filter(function (trade) { return !poolSigs.has(trade.signature); }).map(function (trade) {
      return Object.assign({}, trade, { tier: tier, wallet: address });
    });
    rows = WI.applyTradeFilters(rows, state.settings, locksFor("wallet"));
    if (cur.enrichError) html += '<p class="warn">Token prices did not load: ' + WI.esc(cur.enrichError) + "</p>";
    html += '<p class="note">' + cur.fetched + " transactions fetched · " + rows.length + " meme swaps after filters.</p>";
    html += renderTable("Estimated swaps from Solana RPC. Not included in dashboard totals.", tradeColumns(), sorted(rows), "No meme-coin balance changes in the fetched transactions matched these filters.");
    return html;
  }

  function renderWatchlist() {
    var dir = whaleDir();
    var wanted = loadWatch();
    var stats = new Map();
    WI.byWallet(filteredTrades()).forEach(function (row) { stats.set(row.address, row); });
    var rows = wanted.map(function (address) {
      var stat = stats.get(address) || { address: address, buyUsd: 0, sellUsd: 0, net: 0, absNet: 0, count: 0, last: 0 };
      stat.tier = WI.tierOf(address, dir);
      stat.label = labelOf(address);
      stat.origin = originOf(address, dir);
      return stat;
    });
    return "<h2 class=\"page-title\">Watchlist " + modeBadge() + "</h2>" +
      '<p class="note">Saved in this browser. Add and remove wallets from the lists and from a wallet page.</p>' +
      '<p id="result-count" class="note">' + rows.length + " saved wallets.</p>" +
      renderTable("Watchlist.", walletColumns(), sorted(rows), "No wallets on the watchlist yet.");
  }

  function renderAlerts() {
    var structural = WI.applyTradeFilters(tieredTrades(), Object.assign({}, state.settings, { minTrade: 0 }), locksFor("alerts"));
    var watch = new Set(loadWatch());
    var rows = [];
    structural.forEach(function (trade) {
      var big = trade.usd != null && isFinite(trade.usd) && trade.usd >= state.settings.alertUsd &&
        (state.settings.minTrade <= 0 || trade.usd >= state.settings.minTrade);
      var watched = watch.has(trade.wallet);
      if (!big && !watched) return;
      var reason = big && watched ? "Large " + trade.side + " · Watchlist" : big ? "Large " + trade.side : "Watchlist";
      rows.push(Object.assign({}, trade, { reason: reason }));
    });
    var columns = [{ key: "reason", label: "Alert", cell: function (row) { return WI.esc(row.reason); } }].concat(tradeColumns());
    var alertShown = shownRows(rows, 40);
    return "<h2 class=\"page-title\">Alerts " + modeBadge() + "</h2>" +
      '<form class="stack" id="alert-form">' +
      '<label>Alert threshold (USD)<input id="alert-usd" type="number" min="0" step="100" value="' + WI.esc(state.settings.alertUsd) + '"></label>' +
      '<p class="note">Large buys and sells at or above this amount, plus activity from watchlisted wallets. Watchlist rows still have to pass market cap, time, side, and tier. They do not have to meet the minimum trade size.</p>' +
      "</form>" +
      '<p id="result-count" class="note">' + rows.length + " alerts.</p>" +
      (alertShown.note ? '<p class="note">' + WI.esc(alertShown.note) + "</p>" : "") +
      renderTable("Alerts.", columns, alertShown.rows, "No alerts for this threshold and these filters.");
  }

  function renderSearch() {
    var info = route();
    var q = (info.query.get("q") || "").trim();
    if (state.settings.mode === "live" && WI.isAddr(q)) ensureMint(q);
    var html = "<h2 class=\"page-title\">Search " + modeBadge() + "</h2>";
    if (!q) return html + '<p class="empty" id="result-count">Type a symbol, name, mint, wallet address, or label.</p>';
    var coins = dataset().coins.filter(function (coin) {
      var hit = WI.matchesQuery(q, [coin.symbol, coin.name, coin.mint]);
      if (!hit) return false;
      if (coin.mint === q) return true;
      return WI.passesMcap(coin.marketCap, state.settings.minMcap);
    });
    var dir = whaleDir();
    var walletMap = new Map();
    function consider(address) {
      if (!WI.isAddr(address) || walletMap.has(address)) return;
      var label = labelOf(address);
      if (!WI.matchesQuery(q, [address, label])) return;
      walletMap.set(address, {
        address: address,
        label: label,
        tier: WI.tierOf(address, dir),
        origin: originOf(address, dir),
        buyUsd: 0, sellUsd: 0, net: 0, absNet: 0, count: 0, last: 0
      });
    }
    dir.verified.forEach(consider);
    dir.unverified.forEach(consider);
    dir.user.forEach(function (_, address) { consider(address); });
    tieredTrades().forEach(function (trade) { consider(trade.wallet); });
    if (WI.isAddr(q) && !walletMap.has(q)) {
      walletMap.set(q, {
        address: q, label: "", tier: WI.tierOf(q, dir), origin: originOf(q, dir),
        buyUsd: 0, sellUsd: 0, net: 0, absNet: 0, count: 0, last: 0
      });
    }
    WI.byWallet(filteredTrades()).forEach(function (stat) {
      if (!walletMap.has(stat.address)) return;
      var row = walletMap.get(stat.address);
      row.buyUsd = stat.buyUsd;
      row.sellUsd = stat.sellUsd;
      row.net = stat.net;
      row.absNet = stat.absNet;
      row.count = stat.count;
      row.last = stat.last;
    });
    var coinRows = WI.byCoin(filteredTrades(), coins).filter(function (row) {
      return WI.matchesQuery(q, [row.symbol, row.name, row.mint]);
    });
    html += '<p id="result-count" class="note">' + coinRows.length + " coins · " + walletMap.size + " wallets for “" + WI.esc(q) + "”.</p>";
    if (state.lookups[q] === "loading") html += '<p class="empty">Looking up that mint on DexScreener…</p>';
    html += "<h2>Coins</h2>" + renderTable("Coin search.", coinColumns(), sorted(coinRows), "No coins match.") +
      "<h2>Wallets</h2>" + renderTable("Wallet search.", walletColumns(), sorted(Array.from(walletMap.values())), "No wallets match.");
    return html;
  }

  function renderView() {
    var info = route();
    var page = PAGES[info.page] ? info.page : "missing";
    var html;
    if (page === "dashboard") html = renderDashboard();
    else if (page === "verified") html = renderTierPage("verified");
    else if (page === "unverified") html = renderTierPage("unverified");
    else if (page === "buys") html = renderFlow("buy");
    else if (page === "sells") html = renderFlow("sell");
    else if (page === "coins") html = renderCoins();
    else if (page === "coin") html = renderCoin(info.id);
    else if (page === "wallets") html = renderWallets();
    else if (page === "wallet") html = renderWallet(info.id);
    else if (page === "watchlist") html = renderWatchlist();
    else if (page === "alerts") html = renderAlerts();
    else if (page === "search") html = renderSearch();
    else html = '<h2 class="page-title">Page not found</h2><p class="empty"><a href="#/dashboard">Back to the dashboard</a></p>';
    var focus = document.activeElement && document.activeElement.id;
    var caret = document.activeElement && document.activeElement.selectionStart;
    var view = document.getElementById("view");
    view.innerHTML = html;
    view.setAttribute("data-page", page);
    if (focus === "alert-usd" || focus === "q") {
      var el = document.getElementById(focus);
      if (el) {
        el.focus();
        if (caret != null && el.setSelectionRange) {
          try { el.setSelectionRange(caret, caret); } catch (err) { /* number inputs */ }
        }
      }
    }
  }

  function coverageText() {
    if (state.settings.mode === "demo") {
      return "Demo mode is showing sample rows from data/demo-data.js. None of these trades were read from Solana.";
    }
    if (!state.live) return state.loading ? "Loading live sources…" : "";
    var names = (state.live.scanned || []).map(function (row) { return row.symbol; });
    var line = names.length
      ? "Live totals use recent GeckoTerminal trades for " + names.length + " Solana meme pools (" + names.join(", ") + "). The feed is asked for trades at or above the minimum trade size, and at least $500. This is not a full-chain scan."
      : ((state.live.notes || []).length
        ? "No pool trades were returned. The public trade feed may be rate-limiting this browser."
        : "No meme pools passed the market cap filter, so there are no pool trades to total.");
    line += " Wallet pages can load Solana RPC history separately. That USD is estimated and is not added to these totals.";
    return line;
  }

  function renderNotice() {
    var el = document.getElementById("notice");
    var parts = [];
    if (state.progress && state.loading) parts.push('<p class="empty">' + WI.esc(state.progress) + "</p>");
    var cover = coverageText();
    if (cover) parts.push('<p class="note">' + WI.esc(cover) + "</p>");
    if (state.settings.mode === "live" && state.live) {
      if (state.live.partial) parts.push('<p class="warn">Some pool scans failed. Totals are incomplete. ' + WI.esc((state.live.notes || []).join(" ")) + "</p>");
      else if ((state.live.notes || []).length && state.live.marketOk) parts.push('<p class="warn">' + WI.esc(state.live.notes.join(" ")) + "</p>");
      if (state.live.savedAt && !state.loading) {
        parts.push('<p class="note">Last live fetch ' + WI.esc(WI.formatTime(state.live.savedAt)) + ".</p>");
      }
      var skipped = whaleDir().skipped || [];
      if (skipped.length) parts.push('<p class="warn">' + skipped.length + " entr" + (skipped.length === 1 ? "y" : "ies") + " in data/whales.js skipped (invalid address).</p>");
    }
    el.innerHTML = parts.join("");
  }

  function renderBanner() {
    var demo = state.settings.mode === "demo";
    var banner = document.getElementById("mode-banner");
    banner.className = "banner " + (demo ? "demo" : "live");
    banner.innerHTML = "<p><strong>" + (demo ? "DEMO DATA" : "LIVE DATA") + ".</strong> " +
      (demo
        ? "Sample wallets and trades from data/demo-data.js. Not blockchain data. Browser-added wallets stay saved, but their chain history is not loaded until you switch to Live."
        : "Markets from DexScreener, pool trades from GeckoTerminal, wallet history from a public Solana RPC. A source that does not answer is left blank.") +
      "</p>" +
      '<div class="modes">' +
      '<button type="button" data-mode="live" aria-pressed="' + (!demo) + '">Live</button>' +
      '<button type="button" data-mode="demo" aria-pressed="' + demo + '">Demo data</button>' +
      '<button type="button" data-refresh ' + (state.loading ? "disabled" : "") + ">Refresh</button>" +
      "</div>";
  }

  function highlightNav() {
    var info = route();
    var key = info.page === "coin" ? "coins" : info.page === "wallet" ? "wallets" : info.page;
    document.querySelectorAll(".nav a").forEach(function (link) {
      if (link.getAttribute("data-nav") === key) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var title = PAGES[info.page] || "WHALE INTELLIGENCE";
    document.title = title + " · WHALE INTELLIGENCE";
    var box = document.getElementById("q");
    if (box && document.activeElement !== box && info.page === "search") box.value = info.query.get("q") || "";
  }

  function syncLocks() {
    var lock = locksFor(route().page);
    var tier = document.getElementById("f-tier");
    var side = document.getElementById("f-side");
    if (!tier || !side) return;
    tier.disabled = !!lock.tier;
    side.disabled = !!lock.side;
    tier.value = lock.tier || state.settings.tier;
    side.value = lock.side || state.settings.side;
  }

  function render() {
    var info = route();
    if (info.page !== state.page) {
      state.page = info.page;
      state.formError = "";
      state.formNotice = "";
      var defaults = DEFAULT_SORT[info.page] || ["time", "desc"];
      state.sortKey = defaults[0];
      state.sortDir = defaults[1];
    }
    highlightNav();
    syncLocks();
    renderBanner();
    renderNotice();
    renderView();
  }

  function tradeRequestFloor() {
    var n = Number(state.settings.minTrade);
    if (!isFinite(n) || n < 500) return 500;
    return n;
  }

  function liveIsFresh(live) {
    if (!live || !live.savedAt || Date.now() - live.savedAt > 180000) return false;
    if (live.scannedFloor !== state.settings.minMcap) return false;
    if (live.tradeFloor == null || live.tradeFloor > tradeRequestFloor()) return false;
    return true;
  }

  function readCache(floor) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || cached.scannedFloor !== floor) return null;
      if (cached.tradeFloor == null || cached.tradeFloor > tradeRequestFloor()) return null;
      if (!cached.savedAt || Date.now() - cached.savedAt > 180000) return null;
      return cached;
    } catch (err) {
      return null;
    }
  }

  function writeCache(live) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(live)); } catch (err) { /* ignore */ }
  }

  async function ensureLive(force) {
    if (state.settings.mode !== "live") return;
    if (state.loading) return;
    if (!force && liveIsFresh(state.live)) return;
    var cached = !force && readCache(state.settings.minMcap);
    if (cached) {
      state.live = cached;
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    state.progress = "Loading Solana market data…";
    var token = ++state.loadToken;
    render();
    try {
      var live = await window.WIApi.loadLive({
        minMcap: state.settings.minMcap,
        minTrade: state.settings.minTrade,
        onProgress: function (i, n, symbol) {
          if (token !== state.loadToken) return;
          state.progress = "Reading pool trades " + i + "/" + n + " (" + symbol + ")…";
          renderNotice();
          renderBanner();
        }
      });
      if (token !== state.loadToken || state.settings.mode !== "live") return;
      live.savedAt = Date.now();
      state.live = live;
      writeCache(live);
    } catch (err) {
      if (token !== state.loadToken) return;
      state.live = {
        coins: [],
        trades: [],
        scanned: [],
        notes: [err.message || "Live load failed"],
        marketOk: false,
        tradesOk: false,
        partial: false,
        scannedFloor: state.settings.minMcap,
        savedAt: Date.now()
      };
    } finally {
      if (token === state.loadToken) {
        state.loading = false;
        state.progress = "";
        render();
      }
    }
  }

  function ensureChain(address) {
    var cur = state.chain[address];
    if (cur && (cur.status === "loading" || cur.status === "done" || cur.status === "error")) return;
    state.chain[address] = { status: "loading" };
    window.WIApi.loadWalletHistory(address).then(function (res) {
      state.chain[address] = {
        status: "done",
        trades: res.trades,
        signatures: res.signatures,
        fetched: res.fetched,
        enrichError: res.enrichError
      };
      if (route().page === "wallet" && route().id === address) renderView();
    }).catch(function (err) {
      state.chain[address] = { status: "error", error: err.message || "RPC failed" };
      if (route().page === "wallet" && route().id === address) renderView();
    });
  }

  function ensureMint(mint) {
    if (!WI.isAddr(mint) || WI.EXCLUDE_MINTS[mint]) return;
    if (dataset().coins.some(function (coin) { return coin.mint === mint; })) return;
    if (state.lookups[mint]) return;
    state.lookups[mint] = "loading";
    window.WIApi.loadMints([mint]).then(function (coins) {
      if (coins && coins[0]) state.extraCoins.push(coins[0]);
      state.lookups[mint] = coins && coins[0] ? "done" : "missing";
      if (route().page === "coin" || route().page === "search") renderView();
    }).catch(function (err) {
      state.lookups[mint] = err.message || "failed";
      if (route().page === "coin" || route().page === "search") renderView();
    });
  }

  function isDemoAddress(address) {
    return DEMO.wallets.verified.concat(DEMO.wallets.unverified).some(function (row) {
      return row.address === address;
    });
  }

  function setMode(mode) {
    state.settings.mode = mode === "demo" ? "demo" : "live";
    saveSettings();
    state.loadToken += 1;
    state.loading = false;
    state.progress = "";
    render();
    if (state.settings.mode === "live") ensureLive(false);
  }

  function readFilterNumbers() {
    var mcap = document.getElementById("f-mcap");
    var trade = document.getElementById("f-trade");
    var windowEl = document.getElementById("f-window");
    var prevFloor = state.settings.minMcap;
    if (mcap && mcap.value !== "" && isFinite(Number(mcap.value)) && Number(mcap.value) >= 0) {
      state.settings.minMcap = Number(mcap.value);
    }
    if (trade && trade.value !== "" && isFinite(Number(trade.value)) && Number(trade.value) >= 0) {
      state.settings.minTrade = Number(trade.value);
    }
    var tier = document.getElementById("f-tier");
    var side = document.getElementById("f-side");
    if (tier && !tier.disabled) state.settings.tier = tier.value;
    if (side && !side.disabled) state.settings.side = side.value;
    if (windowEl) state.settings.window = windowEl.value;
    saveSettings();
    return prevFloor !== state.settings.minMcap;
  }

  var mcapTimer = 0;
  function onFilters() {
    readFilterNumbers();
    render();
    if (state.settings.mode === "live") {
      clearTimeout(mcapTimer);
      mcapTimer = setTimeout(function () { ensureLive(false); }, 400);
    }
  }

  function onClick(event) {
    var node = event.target.closest("button");
    if (!node) return;
    if (node.hasAttribute("data-mode")) {
      setMode(node.getAttribute("data-mode"));
      return;
    }
    if (node.hasAttribute("data-refresh")) {
      if (state.settings.mode === "demo") { render(); return; }
      state.live = null;
      try { sessionStorage.removeItem(CACHE_KEY); } catch (err) { /* ignore */ }
      state.loading = false;
      ensureLive(true);
      return;
    }
    if (node.hasAttribute("data-sort")) {
      var key = node.getAttribute("data-sort");
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = key; state.sortDir = "desc"; }
      renderView();
      return;
    }
    var watchAdd = node.getAttribute("data-watch-add");
    var watchRemove = node.getAttribute("data-watch-remove");
    if (watchAdd || watchRemove) {
      var address = watchAdd || watchRemove;
      var next = loadWatch().filter(function (item) { return item !== address; });
      if (watchAdd) next.push(address);
      storageSet(WATCH_KEY, next);
      renderView();
      return;
    }
    var track = node.getAttribute("data-track");
    if (track) {
      saveUserWallet(track, labelOf(track), node.getAttribute("data-tier") === "verified" ? "verified" : "unverified");
      state.formNotice = "Saved in this browser.";
      renderView();
      return;
    }
    var forget = node.getAttribute("data-forget");
    if (forget) {
      storageSet(USER_KEY, loadUser().filter(function (row) { return row.address !== forget; }));
      renderView();
      return;
    }
    var copy = node.getAttribute("data-copy");
    if (copy && navigator.clipboard) {
      navigator.clipboard.writeText(copy).then(function () {
        node.textContent = "Copied";
      }).catch(function () { /* ignore */ });
      return;
    }
    var reload = node.getAttribute("data-reload-chain");
    if (reload) {
      delete state.chain[reload];
      ensureChain(reload);
      renderView();
    }
  }

  function saveUserWallet(address, label, tier) {
    var rows = loadUser().filter(function (row) { return row.address !== address; });
    rows.push({ address: address, label: String(label || "").slice(0, 80), tier: tier });
    storageSet(USER_KEY, rows);
  }

  function onSubmit(event) {
    var form = event.target;
    if (form.id === "filters" || form.id === "alert-form") {
      event.preventDefault();
      return;
    }
    if (form.id === "search-form") {
      event.preventDefault();
      var q = new FormData(form).get("q") || "";
      location.hash = "#/search?q=" + encodeURIComponent(String(q).trim());
      return;
    }
    if (form.hasAttribute("data-add-wallet")) {
      event.preventDefault();
      var data = new FormData(form);
      var address = String(data.get("address") || "").trim();
      var label = String(data.get("label") || "").trim();
      var tier = data.get("tier") === "verified" ? "verified" : "unverified";
      if (!WI.isAddr(address)) {
        state.formError = "Enter a Solana address (base58, 32–44 characters).";
        state.formNotice = "";
        renderView();
        return;
      }
      saveUserWallet(address, label, tier);
      state.formError = "";
      state.formNotice = "Saved in this browser. Switch to Live to read chain history for a real address.";
      renderView();
    }
  }

  function buildFilters() {
    var s = state.settings;
    document.getElementById("filters").innerHTML =
      '<label>Min market cap (USD)<input id="f-mcap" type="number" min="0" step="100000" value="' + s.minMcap + '"></label>' +
      '<label>Min trade (USD)<input id="f-trade" type="number" min="0" step="100" value="' + s.minTrade + '"></label>' +
      '<label>Tier<select id="f-tier"><option value="all">All</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></label>' +
      '<label>Side<select id="f-side"><option value="all">Buys and sells</option><option value="buy">Buys</option><option value="sell">Sells</option></select></label>' +
      '<label>Time window<select id="f-window"><option value="1h">1 hour</option><option value="6h">6 hours</option><option value="24h">24 hours</option><option value="7d">7 days</option><option value="all">All loaded</option></select></label>';
    document.getElementById("f-tier").value = s.tier;
    document.getElementById("f-side").value = s.side;
    document.getElementById("f-window").value = s.window;
  }

  function init() {
    buildFilters();
    document.getElementById("filters").addEventListener("input", onFilters);
    document.getElementById("filters").addEventListener("change", onFilters);
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("input", function (event) {
      if (!event.target || event.target.id !== "alert-usd") return;
      var n = Number(event.target.value);
      if (!isFinite(n) || n < 0) return;
      state.settings.alertUsd = n;
      saveSettings();
      renderView();
    });
    window.addEventListener("hashchange", render);
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    var cached = state.settings.mode === "live" ? readCache(state.settings.minMcap) : null;
    if (cached) state.live = cached;
    render();
    if (state.settings.mode === "live" && !cached) ensureLive(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
