
Using the handy [TypeScript template](https://github.com/bitburner-official/typescript-template).

## Useful Breakpoints
The game runs in a browser *and* includes sourcemaps, so naturally, you can place breakpoints wherever you want to cheat in just about anything you need.
This is definitely not intended, but pretty much unavoidable - some changes may lead to profile corruption, however.

`🔴` denotes a main breakpoint for a section, all other colors represent optional/recommended additional breakpoints and usually come with explanations.

### Money, Karma & Stats
This method is slightly roundabout - but bundles the main things you'd want starting out into one breakpoint.
```ts

```
Process: 
- Go to `the Slums` and start any crime (specific crime does *not* matter. Pick `Mug`, since it's the fastest).
- Wait for the crime to succeed (or alternatively, move )

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

### Infiltrations
Allows you to instantly finish an infiltration. To earn more reputation, see the 2nd breakpoint.
```tsx

```