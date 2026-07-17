# Manual Test Checklist — Amsterdam Brewery

Generated for Goal: `20260717-094614-brewery-game-playable-42344`

## Smoke Test (every change)

- [ ] **S1** — Launch: welcome screen appears with controls info and "Begin Your Story" button
- [ ] **S2** — Dismiss welcome: click button (or press Escape/Space/Enter) → step-by-step tutorial overlay appears
- [ ] **S3** — Complete all 8 tutorial steps:
  1. Press 1-4 to switch locations
  2. Press R to brew (select a recipe)
  3. Press B to open the bar
  4. Click a drink button to serve a customer
  5. Press Space to advance time
  6. Press M to open the shop
  7. Press U to open upgrades
  8. Press L or O to save/quick load
- [ ] **S4** — All tutorial steps complete → overlay fades out → free play begins
- [ ] **S5** — Exit: no crash on application quit

## Core Loop Test (brew → serve → earn → upgrade × 3)

- [ ] **C1** — Press R → brew panel opens → select Lager ($5, 3 turns) → brew starts
- [ ] **C2** — Press Space (×3) → brew timer counts down → "Lager ready!" notification → stock increases
- [ ] **C3** — Press B → bar shift starts → drink buttons are interactable (stock > 0)
- [ ] **C4** — Serve ≥ 1 customer → money earned → HUD updates
- [ ] **C5** — Press F to end shift → settlement summary appears → revenue added
- [ ] **C6** — Press U → upgrade panel opens → purchase cheapest available upgrade → money deducted
- [ ] **C7** — Repeat C1–C6 at least 3 times → money/stock/upgrades accumulate correctly

## Edge Case Tests

- [ ] **E1** — Money = 0: open brew panel → can't select recipes that cost more than $0 → brew button non-functional
- [ ] **E2** — Stock full: brew panel still works → stock count increases → bar drink buttons show updated count
- [ ] **E3** — All 5 upgrades purchased: upgrade panel shows "✓ Purchased" for each → no more interaction needed
- [ ] **E4** — Open bar with 0 stock: drink buttons are grayed out (non-interactable) → can still end shift
- [ ] **E5** — Negative money at dawn: GameWentBankrupt → end screen with "Bankrupt!" message
- [ ] **E6** — Reach $300 money target: victory screen with "Brewery Established!" message
- [ ] **E7** — Survive to day 8 (7 full days): end screen with "Time's Up!" message

## Save/Load Test

- [ ] **L1** — Save (press L → select slot → confirm) → verification feedback "Game saved" appears
- [ ] **L2** — Load (press L → select saved slot → confirm) → all data restored: money, stock, upgrades, day, time
- [ ] **L3** — Quick Load (press O) → loads slot 0 → state restored
- [ ] **L4** — Auto-save: advance time → slot 0 updated → reload confirms time/state persisted
- [ ] **L5** — Tutorial state persists: complete 3 steps → save → load → tutorial resumes from step 4
- [ ] **L6** — Mid-shift save: open bar → serve some customers → save → load → shift state restored

## UI Test

- [ ] **U1** — HUD: money, day/time, location, daily goals all display correctly after each action
- [ ] **U2** — Inventory (I): shows owned items → updates after shop purchase
- [ ] **U3** — Character (C): shows NPC affection → updates after gift/event
- [ ] **U4** — Achievements (P): shows unlocked achievements → updates after milestone
- [ ] **U5** — Shop (M): shows available items → purchase deducts money → item marked owned
- [ ] **U6** — Dialogue log (H): shows recent conversations → scrollable
- [ ] **U7** — End game screen: stats block shows all 7 fields (days, money, revenue, customers, upgrades, events, locations)

## Stability Test

- [ ] **ST1** — Continuous play 30 minutes, no crashes
- [ ] **ST2** — Rapid panel open/close (R, M, U, I, C, P, H, L in quick succession), no null reference
- [ ] **ST3** — All 4 locations visited → scene visuals load correctly → no missing textures
- [ ] **ST4** — Dialogue + gameplay interleaved → no input lock → dialogue dismiss works
