
Using the handy [TypeScript template](https://github.com/bitburner-official/typescript-template).

## Useful Breakpoints
The game runs in a browser *and* includes sourcemaps, so naturally, you can place breakpoints wherever you want to cheat in just about anything you need.
This is definitely not intended, but pretty much unavoidable - some changes may lead to profile corruption, however.

`🔴` denotes a main breakpoint for a section, all other colors represent optional/recommended additional breakpoints and usually come with explanations.

### Dev Menu - For if everything else is too tiresome
```tsx
// webpack:////src/ui/GameRoot.tsx

   202.  let withPopups = true;
   203.  let bypassGame = false;
🔴 204.  switch (pageWithContext.page) {
   205.    case Page.Recovery: {
   206.      mainPage = <RecoveryRoot softReset={softReset} />;
   207.      withSidebar = false;
   208.      withPopups = false;
   209.      bypassGame = true;
   210.      break;
   211.    }
```
Change to  another tab, then change `pageWithContext.page` to `Dev` in the debugger.

### Money, Karma & Stats
This method is slightly roundabout - but bundles the main things you'd want starting out into one breakpoint.
```ts
   61.    let gains = scaleWorkStats(this.earnings(), focusBonus, false);
   62.    let karma = crime.karma;
🔴 63.    const success = determineCrimeSuccess(crime.type);
   64.    if (success) {
   65.      Player.gainMoney(gains.money, "crime");
   66.      Player.numPeopleKilled += crime.kills;
   67.      Player.gainIntelligenceExp(gains.intExp);
   68.    } else {
   69.      gains = scaleWorkStats(gains, 0.25);
   70.      karma /= 4;
   71.    }
```
Go to `the Slums` and start any crime (specific crime does *not* matter. Pick `Mug`, since it's the fastest).
Wait for the crime to finish; set `success` to true in the debugger.
Adjust every field in `gains` as you see fit. Exp and money should work with >= `1e300`.

### Purchased servers
This is particularly useful after clearing a BitNode, since it allows your server auto-upgrade script to buy everything in one go (and also fully upgrade your `home`) right at the start.
```ts
// webpack:///src/Server/data/Constants.ts

   21.
   22.   PurchasedServerLimit: 25,
🔴 23.   PurchasedServerMaxRam: 1048576, // 2^20
   24. };
```
Set the breakpoint, optionally save and reload. The debugger should focus this code section as soon as the game loads.

Set `BaseCostFor1GBOfRamHome` & `BaseCostFor1GBOfRamServer` to `0`. Other values can also be modified, but these are the main ones. Messing with `PurchasedServerLimit` and the `MaxRam`s seems to be fine as well. The game doesn't seem to like these being too big, so `2 ** 30` is a pretty safe (and honestly, big enough) amount.
<!-- TODO: Test with Number.MAX_SAFE_INTEGER -->

Remember to unset the breakpoint before the next reload.

### Infiltrations (Money, Reputation)
Allows you to instantly finish an infiltration. To earn more reputation, see the 2nd breakpoint.
```tsx
// webpack:///src/Infiltration/ui/Game.tsx

   120.
🔴 121.  let stageComponent: React.ReactNode;
   122.  switch (stage) {
   123.    case Stage.Countdown:
```
Set `stage` to 3 (or, if changed in the future, whatever the value of `Stage.Sell` further up in the file is) and continue execution.

Additionally, to modify what you get from selling or trading in intel,
```tsx
// webpack:///src/Infiltration/ui/Victory.tsx

   45.  function sell(): void {
🔵 46.    Player.gainMoney(moneyGain, "infiltration");
   47.    quitInfiltration();
   48.  }
   49.
   50.  function trade(): void {
   51.    if (!getEnumHelper("FactionName").isMember(factionName)) return;
🟢 52.    Factions[factionName].playerReputation += repGain;
   53.    quitInfiltration();
   54.  }
```

🔵: click `Sell for [x]` in the victory screen and adjust `moneyGain` as you see fit.

🟢: select a faction, and click `Trade for [x] reputation`. You have two choices here: adjust `repGain`, or directly mess with `Factions` and their reputation in the debugger. Both work, but the latter is more of a hassle - you'll need to find the correct scope (since `Factions` itself seems to be a Proxy or similar) *and* minified variable for this to work. But once you've got it figured out, it's easy enough to get working consistently.
