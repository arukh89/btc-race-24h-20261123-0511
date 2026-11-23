// Early-hold BTC trading bot for make.fun btc-race-24h-20261123-0511.
//
// Protocol: agent-fun/bars-replay/v1. The harness sends one `hello` (the
// universe, capital, caps and fees), then one `batch` per minute: the bar
// that just closed, the fills of the orders sent on the previous batch,
// and the account. The bot answers every batch with exactly one reply
// echoing its seq, carrying its orders for that bar; an order decided on
// a batch fills at the next bar's open. The SDK shim in vendor/ owns that
// wire (one JSON line per batch, replies flushed before the next line is
// read); this file only decides the orders.
//
// Strategy ("early-hold", one shot, long only):
// - Watch the CBBTC closes. Once 24 closes are seen, enter with the whole
//   cash when the trailing 24-bar return tops +0.1% (the close above its
//   close 24 bars back by more than 1 part in 1000). Only ONE filled entry
//   per window: if the buy is rejected, retry on later batches while the
//   entry condition still holds; once a fill is seen, never buy again.
// - While holding, track the highest close since the entry fill. Sell the
//   whole position when the close drops 1.5% below that peak (a trailing
//   stop); if the sell is rejected, retry on later batches while the
//   condition still holds and the position remains.
// - A batch with no CBBTC bar gets no orders. At most one order per reply.
//
// Why this shape: on 1-minute bars most moves are noise (median true range
// ~4 bps) while a full-size round trip costs ~26 bps in fee, slippage and
// price impact, so fast signals churn themselves to death; the money is in
// catching one sustained multi-hour move and sitting out the rest. The
// trailing stop caps the loss when the move reverses, and the single-entry
// rule caps the cost bleed in chop.
//
// Determinism: every decision is a pure function of the closes and fills
// seen so far, compared with bigint cross-multiplication (no floats, no
// clock, no randomness, no environment, no network, no files). Two runs on
// the same bars therefore send the same orders.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Entry: trailing 24-bar return above +0.1% (closes[i] > closes[i-24] * 1.001).
const LOOKBACK_BARS = 24;
const ENTRY_NUM = 1001n; // closes[-1] * 1000 > closes[-25] * 1001  <=>  return > 0.1%
const ENTRY_DEN = 1000n;
// Exit: close below peak * (1 - 0.015)  <=>  close * 200 < peak * 197.
const TRAIL_NUM = 197n;
const TRAIL_DEN = 200n;
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on.

// Run state. A graded execution is one fresh process, so module state is
// per-run state: the closes seen, whether the single entry has filled,
// the client id of a buy still awaiting its fill, and the highest close
// seen while holding.
const closes: bigint[] = [];
let entryFilled = false;
let pendingEntryId: string | null = null;
let peak: bigint | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    // Settle the entry buy we are waiting on: the fills of this batch
    // report what happened to the orders of the previous batch. This runs
    // before the bar check, so the entry state settles even on a batch
    // that carries no bar for our symbol.
    if (pendingEntryId !== null) {
      for (const fill of batch.fills) {
        if (fill.client_id === pendingEntryId) {
          if (fill.status === 'filled') entryFilled = true;
          // Filled or rejected, the wait is over either way; a rejection
          // leaves entryFilled false so we may retry.
          pendingEntryId = null;
          break;
        }
      }
    }

    // The bar for our symbol on this batch, if the batch carries one.
    let bar: (typeof batch.bars)[number] | null = null;
    for (const candidate of batch.bars) {
      if (candidate.symbol === SYMBOL) {
        bar = candidate;
        break;
      }
    }
    if (bar === null) {
      // No bar for our symbol on this batch: nothing to decide on.
      return [];
    }

    const close = BigInt(bar.c);
    closes.push(close);

    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      // Holding: maintain the peak since the entry, then check the
      // trailing stop against it.
      if (peak === null || close > peak) peak = close;
      if (close * TRAIL_DEN < peak * TRAIL_NUM) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: the one entry, only while no buy is still awaiting its fill.
    if (entryFilled || pendingEntryId !== null) return [];
    if (closes.length > LOOKBACK_BARS) {
      const now = closes[closes.length - 1]!;
      const then = closes[closes.length - 1 - LOOKBACK_BARS]!;
      if (now * ENTRY_DEN > then * ENTRY_NUM) {
        const cid = state.clientId();
        pendingEntryId = cid;
        return [{ side: 'buy', client_id: cid, symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
