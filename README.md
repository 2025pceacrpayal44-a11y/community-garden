#🌱 Community Garden — Soroban Smart Contract

A Soroban smart contract on the Stellar blockchain that manages a shared community garden. It handles plot allocation for members and a shared tool borrowing system, so everyone gets fair access to space and equipment.

---

## What it does

Community gardens involve two classic coordination problems: who gets which plot, and who has the shovel right now. This contract puts both on-chain, giving a garden admin transparent control over plot assignments while letting members self-serve tool loans — with automatic due-back tracking via Stellar ledger sequence numbers.

---

## Features

### Plot allocation
- **Admin-only allocation** — the garden admin assigns plots to registered members, specifying the size in m²
- **Member relinquishment** — members can voluntarily hand back their plot, freeing it for reassignment
- **Per-member plot registry** — look up every plot a member holds in a single call
- **Active/inactive status** — plots are never deleted, just deactivated, preserving the full history on-chain

### Shared tool borrowing
- **Tool inventory** — the admin can add named tools (shovel, wheelbarrow, hoe, etc.); three starter tools are seeded on initialisation
- **Borrow with due-date** — members with an active plot can borrow any available tool; a due-back ledger number is calculated automatically (~1 day at 5 s/ledger)
- **Member-only borrowing** — non-members (no active plot) are rejected at the contract level
- **Single-borrower enforcement** — a tool can only be borrowed by one person at a time; double-borrowing panics with a clear error
- **Self-service returns** — members return tools themselves; only the borrower can return their own tool

### Access control & events
- **Admin authentication** — `initialize`, `allocate_plot`, and `add_tool` require the admin's signature via `require_auth()`
- **Member authentication** — `borrow_tool` and `return_tool` require the caller's own signature
- **Event emission** — every state change (`init`, `alloc`, `relq`, `borrow`, `return`) emits a typed Soroban event for off-chain indexers and frontends

---

## Project structure

```
community-garden/
├── Cargo.toml
└── src/
    └── lib.rs          # Contract, data types, and tests
```

---

## Getting started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) with the `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) (`stellar`)

```bash
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli --features opt
```

### Build

```bash
stellar contract build
```

The compiled `.wasm` lands in `target/wasm32-unknown-unknown/release/community_garden.wasm`.

### Test

```bash
cargo test
```

Five tests are included covering: plot allocation, tool borrow/return, plot relinquishment, double-borrow rejection, and non-member borrow rejection.

### Deploy to Testnet

```bash
# Fund a test account
stellar keys generate --global admin --network testnet --fund

# Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/community_garden.wasm \
  --source admin \
  --network testnet
```

### Initialise

```bash
stellar contract invoke \
  
  --source admin \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

---

## Contract API

| Function | Auth required | Description |
|---|---|---|
| `initialize(admin)` | admin | One-time setup; seeds 3 tools |
| `allocate_plot(member, size_sqm)` | admin | Assign a plot to a member |
| `relinquish_plot(member, plot_id)` | member | Hand plot back to the garden |
| `get_plot(plot_id)` | — | Fetch plot details |
| `get_member_plots(member)` | — | List all plot IDs for a member |
| `plot_count()` | — | Total plots ever allocated |
| `add_tool(name)` | admin | Add a named tool to inventory |
| `borrow_tool(borrower, tool_id)` | member | Borrow an available tool |
| `return_tool(borrower, tool_id)` | member | Return a borrowed tool |
| `get_tool(tool_id)` | — | Fetch tool details |
| `tool_count()` | — | Total tools in inventory |

---

## Design notes

- **No XLM payments** — this contract is purely state management; payment flows (e.g. plot fees, tool deposits) can be layered on via a separate contract or off-chain process.
- **Storage** — all data uses `instance` storage for simplicity; a production version should move per-plot and per-tool entries to `persistent` storage with TTL extensions.
- **Borrow period** — hardcoded to 17,280 ledgers (~1 day). Override `BORROW_PERIOD_LEDGERS` at compile time or expose it as a configurable admin parameter.
- **Overdue tools** — the contract records `due_back_ledger` but does not currently enforce penalties. An off-chain cron job or a separate `flag_overdue` admin function can handle enforcement.

---

## License

MIT
wallet address:GD5A2S4L7WDNMTYWVRJ3N4QFOOUVJUSSCTKQ7RCCBHL2FDXZKTRIQV2O

contract address:CA53K7GXC5PG26CQ7NGTZEDXBDQY4ROPNZU4HXVXTZW6QPULBU7Y4EZM

https://stellar.expert/explorer/testnet/contract/CA53K7GXC5PG26CQ7NGTZEDXBDQY4ROPNZU4HXVXTZW6QPULBU7Y4EZM

<img width="1852" height="932" alt="image" src="https://github.com/user-attachments/assets/b02ab3f4-63b9-475d-b1d1-e6d9a72cc445" />

