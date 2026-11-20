# WHALE INTELLIGENCE

Lightweight tracker for Solana meme coin whales. Plain HTML, CSS, and JavaScript. No build step and no framework. GitHub Pages can serve it from the repository root.

The page address is [https://ahmadrahmani147370-hype.github.io/whale-intelligence/](https://ahmadrahmani147370-hype.github.io/whale-intelligence/). Asset paths are relative so that project-site URL works.

## Pages

Navigation uses hash routes (`#/dashboard`, `#/coins`, and the rest), so a refresh on GitHub Pages still opens the right section.

1. **Dashboard** — verified buys, sells, and net flow; the same three figures for unverified wallets; and the same three figures combined. Combined is the sum of the other two, not a third feed.
2. **Verified Whales** — wallets on the verified list and their activity.
3. **Unverified Whales** — wallets on the unverified list, plus wallets observed making large trades in Live mode.
4. **Whale Buys** — coins with the most whale buying. Verified USD, unverified USD, and combined USD are separate columns.
5. **Whale Sells** — the same split for selling.
6. **Coins** — symbol, price, market cap, and liquidity, plus the whale split for the current filters.
7. **Wallets** — addresses, labels, and a wallet page with pool trades and Solana transaction history.
8. **Watchlist** — favourite wallets in `localStorage`. Add and remove them on wallet lists and on a wallet page.
9. **Alerts** — buys and sells at or above a USD threshold you set, and trades from watchlisted wallets.
10. **Search** — the header box matches coin symbol, name, or mint, and wallet address or label.

## Filters

The filter bar applies across the tables:

- Minimum market cap, default **$1,000,000**
- Minimum trade size, default **$1,000**
- Verified, unverified, or all (locked on the Verified and Unverified pages)
- Buys, sells, or both (locked on Whale Buys and Whale Sells)
- Time window: 1 hour, 6 hours, 24 hours, 7 days, or all loaded rows
- Sort by clicking a column header

Settings stay in this browser.

## What is live

| Data | Source | How it is labelled |
| --- | --- | --- |
| Price, market cap, liquidity, Solana pairs | [DexScreener](https://docs.dexscreener.com/api/reference) public API | **LIVE** |
| Recent pool trades (wallet, buy/sell, USD volume) | [GeckoTerminal](https://www.geckoterminal.com/dex-api) public API | **LIVE** |
| Wallet transaction history | Public Solana RPC (`solana-rpc.publicnode.com`, then `api.mainnet-beta.solana.com`) | **LIVE** and **ESTIMATE** |

Live mode is the default. The banner at the top says **LIVE DATA**.

Limits, so the numbers are not oversold:

- Whale totals use the recent trades GeckoTerminal returns for up to **6** highest-volume Solana pools that pass the market cap filter. Trades under **$500** are not requested. This is not a full-chain scan.
- The meme list is Solana tokens from DexScreener boost and profile feeds, minus majors and stablecoins listed in `js/logic.js`. It is not a perfect meme classifier.
- If DexScreener or the pool scan fails, totals are hidden or marked incomplete. Sample numbers are not substituted.
- RPC history on a wallet page is the latest 8 signatures. A swap is inferred from that wallet's token balance change. USD is the token amount times the **current** DexScreener price, so it is marked **ESTIMATE**. Those rows are **not** added to dashboard totals.
- Public endpoints rate-limit. The page shows the error it got.

## What is demo

**Demo data** in the banner switches the whole activity view to `data/demo-data.js`.

That file is synthetic: fake addresses, fake coins, and fake trades. Every demo wallet, coin, and trade is badged **DEMO DATA**. Demo mode does not call Solana RPC, so sample rows are never mixed with chain history.

The shipped `data/whales.js` list is empty on purpose. Sample addresses are not presented as real whales.

## Edit the whale lists

Shared lists live in one file, [`data/whales.js`](data/whales.js):

```javascript
window.WHALE_LIST = {
  verified: [
    { address: "YourSolanaAddress", label: "Desk label" }
  ],
  unverified: []
};
```

- Put an address in only one array. If it is in both, verified wins.
- Addresses must be Solana base58 (32–44 characters). Invalid rows are skipped and counted on the page.
- This file does not contain trades. Live mode still reads public APIs for activity.

You can also add a wallet in the browser on Verified Whales, Unverified Whales, or Wallets. That entry is stored in `localStorage` for this browser and is not written back to `data/whales.js`. Removing it only removes the browser copy.

A wallet seen in pool trades can be saved as verified or unverified from its row. That is a label you choose. It does not create trades.

## Watchlist and alerts

- **Add to watchlist** / **Remove from watchlist** is on wallet tables and on the wallet page.
- The watchlist survives refresh and is local to the browser.
- The alert threshold defaults to $1,000 and is stored with the other settings.
- Watchlist alerts still respect market cap, time, side, and tier. They do not have to meet the minimum trade size.

## Run locally

Live requests need a normal web origin. Opening the HTML file directly will block them.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

Check the filter and total math without a browser:

```bash
node tests/logic.test.js
```

## GitHub Pages

1. Push the site to the `main` branch.
2. On GitHub open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Branch: **main**. Folder: **/ (root)**.
5. Save.

The published site is `https://ahmadrahmani147370-hype.github.io/whale-intelligence/`.

`.nojekyll` is in the repo root so Pages does not run Jekyll or drop files that start with an underscore.

## Privacy

There is no backend. Wallets you add, the watchlist, the alert threshold, and filters stay in `localStorage` on this browser.

This is not financial advice.
