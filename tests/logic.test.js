/**
 * Node checks for filter math, tier separation, and the demo file.
 * Run: node tests/logic.test.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var root = path.join(__dirname, "..");
var sandbox = {};
vm.createContext(sandbox);
["js/logic.js", "data/demo-data.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
});

var WI = sandbox.WI;
var DEMO = sandbox.DEMO_DATA;

assert.ok(WI, "WI helpers loaded");
assert.strictEqual(DEMO.label, "DEMO DATA");
DEMO.coins.forEach(function (coin) {
  assert.strictEqual(coin.demo, true);
  assert.strictEqual(coin.source, "demo-data.js");
});
DEMO.trades.forEach(function (trade) {
  assert.strictEqual(trade.demo, true);
  assert.strictEqual(trade.source, "demo-data.js");
  assert.ok(trade.usd > 0);
});

var dir = {
  verified: new Set(DEMO.wallets.verified.map(function (w) { return w.address; })),
  unverified: new Set(DEMO.wallets.unverified.map(function (w) { return w.address; })),
  user: new Map()
};
var now = Date.now();
var tiered = DEMO.trades.map(function (trade) {
  return Object.assign({}, trade, { tier: WI.tierOf(trade.wallet, dir) });
});

var filtered = WI.applyTradeFilters(tiered, {
  minMcap: 1000000,
  minTrade: 1000,
  tier: "all",
  side: "all",
  window: "24h"
}, {}, now);

var tot = WI.totals(filtered);
assert.strictEqual(filtered.length, 5);
assert.strictEqual(tot.verified.buyUsd, 130000);
assert.strictEqual(tot.verified.sellUsd, 12000);
assert.strictEqual(tot.verified.net, 118000);
assert.strictEqual(tot.unverified.buyUsd, 9000);
assert.strictEqual(tot.unverified.sellUsd, 30000);
assert.strictEqual(tot.unverified.net, -21000);
assert.strictEqual(tot.combined.buyUsd, 139000);
assert.strictEqual(tot.combined.sellUsd, 42000);
assert.strictEqual(tot.combined.net, 97000);
assert.strictEqual(tot.combined.buyUsd, tot.verified.buyUsd + tot.unverified.buyUsd);
assert.strictEqual(tot.combined.sellUsd, tot.verified.sellUsd + tot.unverified.sellUsd);

var verifiedOnly = WI.applyTradeFilters(tiered, {
  minMcap: 1000000, minTrade: 1000, tier: "all", side: "all", window: "24h"
}, { tier: "verified" }, now);
assert.ok(verifiedOnly.every(function (trade) { return trade.tier === "verified"; }));
assert.strictEqual(WI.totals(verifiedOnly).unverified.buyUsd, 0);
assert.strictEqual(WI.totals(verifiedOnly).unverified.sellUsd, 0);

var buysOnly = WI.applyTradeFilters(tiered, {
  minMcap: 1000000, minTrade: 0, tier: "all", side: "all", window: "all"
}, { side: "buy" }, now);
assert.ok(buysOnly.every(function (trade) { return trade.side === "buy"; }));

var allRows = WI.applyTradeFilters(tiered, {
  minMcap: 0, minTrade: 0, tier: "all", side: "all", window: "all"
}, {}, now);
assert.strictEqual(allRows.length, 10);

var week = WI.applyTradeFilters(tiered, {
  minMcap: 0, minTrade: 0, tier: "all", side: "all", window: "7d"
}, {}, now);
assert.strictEqual(week.length, 9);

var lowCap = WI.applyTradeFilters(tiered, {
  minMcap: 0, minTrade: 1000, tier: "all", side: "all", window: "24h"
}, {}, now);
assert.ok(lowCap.some(function (trade) { return trade.symbol === "DMOON"; }));

assert.strictEqual(WI.tierOf(DEMO.wallets.verified[0].address, dir), "verified");
var override = {
  verified: dir.verified,
  unverified: dir.unverified,
  user: new Map([[DEMO.wallets.verified[0].address, "unverified"]])
};
assert.strictEqual(WI.tierOf(DEMO.wallets.verified[0].address, override), "unverified");
assert.strictEqual(WI.tierOf("NotAListedWallet111111111111111111111111", dir), "unverified");

var dup = WI.readWhaleFile({
  verified: [{ address: DEMO.wallets.verified[0].address, label: "V" }],
  unverified: [
    { address: DEMO.wallets.verified[0].address, label: "should not win" },
    { address: "not an address", label: "bad" }
  ]
});
assert.strictEqual(dup.verified.length, 1);
assert.strictEqual(dup.unverified.length, 0);
assert.strictEqual(dup.skipped.length, 1);

var coins = WI.byCoin(filtered, []);
var pepe = coins.find(function (coin) { return coin.symbol === "DPEPE"; });
assert.strictEqual(pepe.verifiedBuy, 50000);
assert.strictEqual(pepe.unverifiedSell, 30000);
assert.strictEqual(pepe.combinedBuy, 50000);
assert.strictEqual(pepe.combinedSell, 30000);

assert.strictEqual(WI.tradeSide("Mint", "So111", "Mint", "sell"), "buy");
assert.strictEqual(WI.tradeSide("Mint", "Mint", "So111", "buy"), "sell");

var wsol = "So11111111111111111111111111111111111111112";
var meme = "ejrz94zR4A2ScS8LdvRaQih2xUxaE2ydreqUNKmpump";
var wallet = "8TFfCJVNsqbpxWYicUzvNFqffhoB4v5HDj8Rv8zwqZ76";
var events = WI.parseRpcSwaps(wallet, {
  blockTime: 1795139715,
  meta: {
    err: null,
    preTokenBalances: [
      { mint: wsol, owner: wallet, uiTokenAmount: { uiAmount: 10 } },
      { mint: meme, owner: wallet, uiTokenAmount: { uiAmount: 0 } },
      { mint: meme, owner: "SomeoneElse11111111111111111111111111111", uiTokenAmount: { uiAmount: 5 } }
    ],
    postTokenBalances: [
      { mint: wsol, owner: wallet, uiTokenAmount: { uiAmount: 1 } },
      { mint: meme, owner: wallet, uiTokenAmount: { uiAmount: 400 } }
    ]
  }
}, "Sig");
assert.strictEqual(events.length, 1);
assert.strictEqual(events[0].side, "buy");
assert.strictEqual(events[0].mint, meme);
assert.strictEqual(events[0].usdEstimated, true);
assert.strictEqual(WI.parseRpcSwaps(wallet, { meta: { err: { InstructionError: [0, "X"] } } }, "Sig").length, 0);

assert.ok(WI.matchesQuery("dpepe", ["DPEPE", "Demo Pepe"]));
assert.ok(WI.matchesQuery("Alpha", ["Demo Verified Alpha"]));
assert.ok(!WI.matchesQuery("zzzz-no-match", ["DPEPE"]));

var sorted = WI.sortRows([{ usd: 5 }, { usd: 20 }, { usd: null }], "usd", "desc");
assert.strictEqual(sorted[0].usd, 20);
assert.strictEqual(sorted[sorted.length - 1].usd, null);

assert.ok(WI.formatUsd(130000).indexOf("130.0K") !== -1);
assert.strictEqual(WI.formatNet(-21000)[0], "-");
assert.strictEqual(WI.formatNet(1000)[0], "+");

var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf("WHALE INTELLIGENCE") !== -1);
assert.ok(html.indexOf('href="css/styles.css"') !== -1);
assert.ok(html.indexOf('src="js/app.js"') !== -1);
assert.ok(!/<(?:script|link)[^>]+(?:src|href)="\//.test(html), "asset paths must stay relative");
assert.ok(fs.existsSync(path.join(root, ".nojekyll")));

console.log("logic.test.js: " + filtered.length + " default-filter demo trades, totals separated");
