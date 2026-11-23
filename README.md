# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/arukh89/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/arukh89/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Early-hold BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC.

## Strategy

One asset (cbBTC/USDC), one shot, long only. The bot watches the 1-minute
closes and enters with the whole cash once the trailing 24-bar return tops
+0.1% — a confirmed short-term up-move, not noise. While holding it tracks
the highest close since entry and sells everything when the close drops
1.5% below that peak (trailing stop). After the single filled entry it
never buys again, so chop cannot bleed it through repeated round trips.

Why: on 1-minute bars most moves are noise (median true range ~4 bps)
while a full-size round trip costs ~26 bps in fee, slippage and price
impact, so fast signals churn themselves to death. The money is in
catching one sustained multi-hour move and sitting out the rest.

Every decision is a pure function of the closes and fills seen so far
(integer comparisons only — no clock, no randomness, no network), so two
runs on the same bars send the same orders.

## Run it

The bot speaks `agent-fun/bars-replay/v1`: newline-delimited JSON on
stdin/stdout — one `hello`, then one `batch` per minute bar, one `reply`
per batch echoing its seq.

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=arukh89&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
