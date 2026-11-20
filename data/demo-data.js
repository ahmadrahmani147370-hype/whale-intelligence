/**
 * DEMO DATA — synthetic wallets, coins, and trades.
 * Not observed on Solana. Not returned by an API.
 * Shown only in Demo mode, and badged DEMO DATA in the interface.
 */
(function (root) {
  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;
  var now = Date.now();

  var wallets = {
    verified: [
      { address: "DV1WaheDemoAddress1111111111111111111111", label: "Demo Verified Alpha" },
      { address: "DV2WaheDemoAddress2222222222222222222222", label: "Demo Verified Beta" }
    ],
    unverified: [
      { address: "DU1WaheDemoAddress3333333333333333333333", label: "Demo Unverified Gamma" },
      { address: "DU2WaheDemoAddress4444444444444444444444", label: "Demo Unverified Delta" }
    ]
  };

  var coins = [
    coin("DPEPE", "Demo Pepe", "DPepeMintDemo111111111111111111111111111", 12400000, 800000, 0.00042),
    coin("DDOG", "Demo Dog", "DDogMintDemo2222222222222222222222222222", 4200000, 350000, 0.0011),
    coin("DCAT", "Demo Cat", "DCatMintDemo3333333333333333333333333333", 1500000, 120000, 0.008),
    coin("DMOON", "Demo Moon", "DMoonMintDemo444444444444444444444444444", 900000, 80000, 0.02),
    coin("DFISH", "Demo Fish", "DFishMintDemo555555555555555555555555555", 220000, 40000, 0.0009),
    coin("DROCK", "Demo Rock", "DRockMintDemo666666666666666666666666666", 25000000, 2000000, 1.25)
  ];

  var bySymbol = {};
  coins.forEach(function (c) { bySymbol[c.symbol] = c; });

  var rows = [
    ["DV1", "DPEPE", "buy", 50000, 20 * MIN],
    ["DV1", "DDOG", "sell", 12000, 2 * HOUR],
    ["DV2", "DROCK", "buy", 80000, 5 * HOUR],
    ["DV2", "DMOON", "buy", 7000, 30 * MIN],
    ["DU1", "DPEPE", "sell", 30000, 40 * MIN],
    ["DU1", "DCAT", "buy", 9000, 10 * HOUR],
    ["DU2", "DDOG", "sell", 15000, 2 * DAY],
    ["DU2", "DFISH", "buy", 4000, 50 * MIN],
    ["DV1", "DROCK", "sell", 20000, 12 * DAY],
    ["DU2", "DPEPE", "buy", 600, 15 * MIN]
  ];

  var addr = {
    DV1: wallets.verified[0].address,
    DV2: wallets.verified[1].address,
    DU1: wallets.unverified[0].address,
    DU2: wallets.unverified[1].address
  };

  var trades = rows.map(function (row, i) {
    var c = bySymbol[row[1]];
    return {
      id: "demo-" + (i + 1),
      time: now - row[4],
      wallet: addr[row[0]],
      mint: c.mint,
      symbol: c.symbol,
      name: c.name,
      marketCap: c.marketCap,
      liquidity: c.liquidity,
      priceUsd: c.priceUsd,
      side: row[2],
      usd: row[3],
      usdEstimated: false,
      signature: "",
      source: "demo-data.js",
      demo: true,
      pairUrl: "",
      dex: "demo"
    };
  });

  function coin(symbol, name, mint, marketCap, liquidity, priceUsd) {
    return {
      mint: mint,
      symbol: symbol,
      name: name,
      priceUsd: priceUsd,
      marketCap: marketCap,
      liquidity: liquidity,
      volume24: marketCap / 10,
      dex: "demo",
      pairAddress: "",
      pairUrl: "",
      chain: "solana",
      demo: true,
      source: "demo-data.js"
    };
  }

  root.DEMO_DATA = {
    label: "DEMO DATA",
    note: "Synthetic sample from data/demo-data.js. Not blockchain data.",
    wallets: wallets,
    coins: coins,
    trades: trades
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
