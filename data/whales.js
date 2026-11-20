/**
 * WHALE INTELLIGENCE — editable whale lists.
 *
 * These lists are configuration for Live mode, not trade history.
 * The site never invents trades for an address you add here.
 * Live mode reads public APIs. Sample trades live only in data/demo-data.js.
 *
 * Put each address in only one list. If it appears in both, verified wins.
 * Address must be a Solana base58 address (32–44 characters).
 *
 *   { address: "<base58>", label: "Short label" }
 *
 * Wallets added in the browser are stored in localStorage and are not
 * written back to this file.
 */
window.WHALE_LIST = {
  verified: [],
  unverified: []
};
