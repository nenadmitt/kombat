# `invite`: a denormalized user_invite_stats table

Investigation notes (2026-08-02). Question: instead of computing the Profile
screen's referral numbers with live queries over `users` and `game_rooms`,
keep a `user_invite_stats` row per user holding `invitedCount`,
`invitedPlayedGames` and `invitedEarnings`, incremented as the events happen.
No code written; proposal only.

## TL;DR

The denormalization is right for two of the three counters and unnecessary for
the third. `invitedPlayedGames` and `invitedEarnings` have no cheap dynamic
form, so they want a maintained row. `invitedCount` is a single indexed
`COUNT(*)` once `referred_by_user_id` is indexed, and staying dynamic keeps it
permanently correct for free.

The blocker is not storage. **There is no referrer revenue share in the code
today.** The whole stake fee goes to the platform
(`apps/server/src/stake-pot/stake-pot.service.ts:374`), so `invitedEarnings`
has nothing to accumulate until someone decides what a referrer is owed. The
Profile card currently hardcodes all three to zero for exactly this reason.

## What exists today

- **The link.** `users.referred_by_user_id`, set once at username claim in
  `apps/server/src/users/users.service.ts:92`. Nullable uuid, **no index**
  (`apps/server/src/db/migrations/1785000000000-InitialSchema.ts:25`).
- **The only live counter.** `DbService.countReferralsFor`
  (`apps/server/src/db/db.service.ts:126`) is
  `COUNT(*) FROM users WHERE referred_by_user_id = $1`. With no index that is
  a sequential scan of `users` on every Profile open.
- **Nothing for the other two.** No query computes matches played by a user's
  invitees, and no code attributes any fee to a referrer.
- **The fee.** `pot * STAKE_FEE_BPS / 10000`, credited entirely to the
  platform in `settleRoom`.

## Proposed shape

One row per referrer, created lazily on the first invite:

```
user_invite_stats
  user_id              uuid primary key references users(id)
  invited_count        integer      not null default 0
  invited_played_games integer      not null default 0
  invited_earnings     numeric(78,0) not null default 0  -- base units
  earnings_asset       smallint     null                 -- StakeAsset
  updated_at           timestamptz  not null
```

`invited_earnings` as a single scalar assumes one settlement asset. Matches
settle in ETH, KOMBAT and USDC today, so this should almost certainly be
`user_invite_earnings (user_id, stake_token, amount)` keyed like
`PlayerStats.netByToken` already is, and the scalar dropped.

### Where each counter increments

| Counter | Hook | Note |
|---|---|---|
| `invited_count` | `users.service.ts:92`, where `referredByUserId` is assigned | Same transaction as the user save |
| `invited_played_games` | `DbService.completeGameRoom` (`db.service.ts:561`) | Single choke point; both callers are in `stakes.service.ts` |
| `invited_earnings` | `stake-pot.service.ts:374`, where the fee is split | Needs a referrer share to exist first |

`completeGameRoom` is the useful find: every completion path in the codebase
funnels through it, so there is exactly one place to hook rather than one per
game.

### Cost of the increment

`completeGameRoom` would gain a lookup of each participant's referrer plus an
upsert. That is one extra indexed read and one write per completed match, at
match-completion frequency rather than profile-open frequency. Fine.

## Recommendation

1. **Index `referred_by_user_id` now.** One line, fixes the seq scan, and is
   worth doing whether or not the table lands. Not included in
   `GameRoomParticipantIndexes1785600000000`.
2. **Keep `invitedCount` dynamic.** Indexed it is trivial, and a maintained
   counter can drift while the query cannot.
3. **Denormalize the two that need it** once the product decides the referrer
   share, and split earnings per asset rather than one scalar.
4. **Write a reconciliation job** alongside the table. Any counter maintained
   by increments needs a periodic recompute-and-compare, or a missed
   transaction is silently wrong forever. The same job doubles as the backfill
   for existing users.

## Risks

- **Drift.** The increments must be in the same transaction as the event they
  count. `completeGameRoom` is currently a bare `update` with no surrounding
  transaction, so hooking it means giving it one.
- **Double counting on replay.** Settlement paths already guard against
  re-settling a room; the invite increment has to sit inside that same guard,
  not beside it.
- **Backfill.** `invited_played_games` for existing users is recoverable from
  `game_rooms`; `invited_earnings` is not, because no fee attribution was ever
  recorded. Historic earnings would start at zero regardless.
