# The Horse's Equipment Limits

Limit equipped items by D&D 5e equipment category and set separate carrying capacities for ammo, aid items, and implants. The GM can block changes that exceed a limit or allow them with a warning listing the limit and the actor's items.

## Install and configure

Targets Foundry v13/v14 and D&D 5e 5.3.3 or newer. Requires **libWrapper**, available from Foundry's module browser. Compatibility has been checked against documented APIs and the 5.3.3 source, but has not yet been verified in a running Foundry world. Newer 5e versions still need a smoke test.

For installation through Foundry's **Add-on Modules > Install Module > Manifest URL**, use:

```text
https://raw.githubusercontent.com/ryanw341/The-Horses-Equipment-Limits/main/module.json
```

The repository and release ZIP are public. You can also install the ZIP manually:

1. Close Foundry and extract the ZIP into `Data/modules/the-horses-equipment-limits/`. The `module.json` file must be directly inside that folder.
2. Start Foundry and enable libWrapper and The Horse's Equipment Limits in your world.
3. Open **Game Settings > Configure Settings > The Horse's Equipment Limits > Configure Equipment Limits**.
4. Enable the categories or carried-capacity sections you want, configure their limits and matching items, choose **Block the change** or **Warn only**, and save.

All category limits, carried-capacity sections, and the attunement reminder start disabled. A limit of zero prevents equipping any item in that enabled equipment category. GM actions bypass limits and reminders by default; enable **Apply to GM actions too** to test from the GM account or apply the same rules to everyone. Players are checked on any actor they control, including player-owned NPCs and unlinked tokens. Upgrading preserves your existing settings.

## Categories and weapons

Opening the settings window scans the system's registered equipment categories, world items, all world actor inventories, and scene token actors. **Scan again** refreshes the list while preserving unsaved choices. Existing saved category rules remain available even when no current item uses that type. Categories newly discovered by a scan start disabled.

Custom categories must be actual equipment types in `system.type.value`, either registered by another module or present on a world/actor item. Cosmetic inventory headings from other sheets are not item types. Compendiums are not loaded or scanned; import an item first if its type is not registered with the system. Equipment subtypes and item names do not create separate limits.

Melee and ranged weapons have separate limits. Weapon groups follow `CONFIG.DND5E.weaponTypeMap`; thrown melee weapons remain melee. **Weapon type assignments** lets the GM assign custom types to either group or exclude them. Unassigned types, including natural and improvised weapons when the system provides no mapping, are shown as **Not counted** until assigned by the GM.

The **Heavy** and **Two-Handed** options independently make matching weapons cost two slots. A weapon with both properties costs two total, even when both options are on. The options apply to both melee and ranged groups. Versatile alone does not count as Two-Handed.

The separate **Light weapons count as half a slot (0.5)** option makes weapons with the Light property cost 0.5 slots. It starts disabled and applies to both melee and ranged groups. Two Light weapons use one slot. If a custom weapon also qualifies for an enabled Heavy or Two-Handed rule, it costs two slots instead. Light armor is unaffected. Player warnings and GM reports show the fractional costs, totals, and excesses.

Each equipped item entry uses its slot cost (normally one, or 0.5/two for a qualifying weapon) regardless of stack quantity. Split a stack into separate items if its copies should occupy separate equipment slots. Weapon slot weighting does not change the Ammo, Aid, or Implant carried-capacity totals.

## Ammo, aid, and implant carrying capacity

Under **Carried capacity**, each section has its own toggle, formula controls, counting method, and item selections. Matching items count while carried, whether equipped or unequipped, including items in containers on the actor. Each section has a separate total for each actor.

| Section | Default capacity |
| --- | --- |
| Ammo | `max(2, 1 + proficiency bonus + STR modifier)` |
| Aid | `max(4, (1 + proficiency bonus + STR modifier) * 2)` |
| Implants | `max(0, CON modifier + proficiency bonus)` |

The GM can edit the **Base**, **Proficiency multiplier**, **Ability**, **Ability multiplier**, **Total multiplier**, and **Minimum capacity**. The general formula is `(Base + PROF * proficiency multiplier + ability modifier * ability multiplier) * total multiplier`, then apply the minimum and round down. Capacities cannot go below zero. These are numeric controls, not executable expressions. For a fixed capacity, set Base to the desired number, Proficiency multiplier to zero, Ability to None, Total multiplier to one, and Minimum to zero.

Capacity uses the actor's current prepared proficiency and ability modifier, including applicable adjustments. For example, PROF 3 and STR +2 gives six ammo and twelve aid items; CON +1 gives four implants.

### Choose what counts

Expand **Customize formula and matching items** and choose one or more sources. Choices are combined: any one match counts the item, and matching several choices in the same section never counts it twice. An item selected in two different sections counts toward both pools.

- **Item UUIDs:** paste UUIDs or Foundry `@UUID[...]` links, one per line. World, actor-owned, and compendium Item UUIDs are supported. Copies match using their recorded source IDs. Matching does not depend on item names.
- **Item categories:** choose one or more actual item types/categories, including custom equipment categories and consumable subtypes. For your implants, enable **Implant capacity**, select **Equipment / [your implant type]**, and save. A registered type appears automatically; otherwise create/import an item with that type and use **Scan again**. Cosmetic sheet headings are not categories.
- **World Item folders:** select folders from the Items directory, including their subfolders. Saving captures the source UUIDs of their current items so copies in actor inventories can match even if players cannot access the folder. Save again after changing the folder's contents or structure. Actor folders and folders inside compendiums are not offered.
- **Item compendiums:** select whole Item packs. Newly imported items match through their recorded compendium source. Packs are not downloaded just to populate the selector.

Use Ctrl/Cmd-click to select or clear several categories, folders, or compendiums. An enabled section needs at least one selection. Items created independently or copied by a module that strips source IDs need category matching or their own UUID; identical names alone will not match.

### Choose how to count

- **Inventory Quantity** (default): add the quantities of all matching stacks. A stack with Quantity 5 costs five capacity. For magazine limits, select magazine items whose Quantity represents magazines, rather than individual rounds or loaded weapon charges. The module does not convert bullets into magazines.
- **Remaining Uses:** add each matching item's remaining uses pool once. Uses are not multiplied by Quantity; items without a uses pool contribute zero. Refilling a pool can trigger a capacity check.
- **One per item entry:** each matching inventory entry costs one regardless of stack size. Entries with zero Quantity contribute zero in every mode.

The existing Block/Warn setting applies to all three sections. Adding matching items, increasing a stack, or changing an item into a counted category can trigger a check. Unequipping does not free carried capacity; reduce the quantity, consume uses where relevant, or remove the item. Existing excess is never removed automatically, and changes that reduce it remain allowed.

## Player messages and attunement

The initiating user sees a dialog showing the category limit, current total, proposed total, and the current and proposed item lists. Equipment warnings show equipped items; capacity warnings show carried items and the selected counting method. Weighted weapons and stacks show their cost. Warnings are local to that user and do not post to chat.

The optional attunement reminder uses the actor's prepared `system.attributes.attunement.max`, so an increased maximum such as an artificer's is respected. All attuned items count, including unequipped items. It warns when a change increases the attuned total beyond the maximum. It always permits the attunement change; equipment limits in the same operation may still block that operation. Actors without a numeric attunement maximum are skipped.

## Initial player capacity report

The first time the module runs with limits enabled in a world, **Player Equipment Capacity** opens for the designated active GM. A hidden world setting remembers that it has been shown, so refreshing or having several GMs connected does not repeatedly open it. Players never receive the report. Worlds that have already seen it retain that preference across updates.

The report opens again for the GM who **saves limits**, so enabling categories on a fresh install or tightening limits immediately reveals existing excess equipment. You can reopen it at any time through **Configure Settings > The Horse's Equipment Limits > View Player Capacity**, or use **Refresh report** to check inventory changes.

- The summary lists every non-GM player, including offline players, with their actor count and capacity status.
- Assigned characters and all actors with player Owner permissions are included. Observers and GM-only actors are excluded. Shared actors appear under each owner but count only once in the overall total.
- Linked tokens use their world actor inventory once. Unlinked tokens are listed separately with their scene and token names, including tokens on inactive scenes.
- Over-capacity categories show the total, limit, amount over, and equipped or carried items. Weapon slot weights, custom categories, and carried-capacity formulas use the same rules as player checks. Attunement is included when its reminder is enabled.
- Items that pass the limit in **inventory sort order** are marked **Excess candidate**. The module does not know which item was equipped last. These are suggested items to review; the player can choose other items to remove. A two-slot weapon may be marked even if only one slot needs freeing.
- Carried stacks show their excess amount: a stack of ten magazines against a capacity of six is marked four over, not ten.
- Nothing is automatically unequipped or unattuned. The report also works in Warn only mode and is unaffected by GM bypass.

If no category limits, carried-capacity limits, or attunement reminders are enabled yet, the first report explains that configuration is needed and provides a **Configure limits** button. It does not falsely report that everyone's equipment is within capacity. When limits are configured and nobody exceeds them, it explicitly says so.

## Behavior and boundaries

- Normal sheet equip toggles, macros using Item document operations, and already-equipped items added to an actor are checked. The entire batch is evaluated, allowing an equip/unequip swap and preventing a bulk equip from independently claiming the same free slots.
- In block mode, an invalid Item batch is canceled in full, including other edits in that same batch. No partial inventory edits are applied by this module.
- Existing excess equipment is not automatically removed. Unequipping, reducing an excess, and unrelated edits remain possible. Rules are checked when a category's total increases.
- Carried-capacity checks also cover unequipped Item creation and quantity/uses increases. Capacity changes caused by actor stat changes do not trigger an inventory dialog immediately; the next increase and the GM report use the new capacity.
- Saving rules shows the GM an audit of player-controlled actors without unequipping anything. Individual player attunement reminders still fire on increasing attunement, not simply opening a sheet.
- Enforcement runs on the initiating client. Separate concurrent requests can race, especially when several users share an actor. This is a gameplay helper, not a server-side permission boundary.
- Creating/importing an entire Actor, editing raw Actor item arrays, changing token actor deltas directly, and active-effect-only changes do not go through the Item batch checks. Integrations using those paths need separate validation.
- This version does not impose a shared armor limit across Light, Medium, and Heavy categories. Each enabled type has its own limit.

## Development

Node 22+ runs checks and tests without npm dependencies. Python 3 is only needed to build the ZIP.

```sh
npm run check
npm test
npm run package
```

The ZIP is written to `dist/the-horses-equipment-limits-0.3.1.zip`, with `module.json` at its root. Source is hosted in the [GitHub repository](https://github.com/ryanw341/The-Horses-Equipment-Limits). The manifest's download URL points to that ZIP on release `v0.3.1`. CI checks pushes and pull requests and uploads the ZIP as a workflow artifact.

To preview the settings and messages without Foundry, run `python -m http.server 8765 --bind 127.0.0.1` from this folder and open `http://127.0.0.1:8765/tools/preview.html`. This uses an in-memory API mock and does not connect to a world. The preview is excluded from the module ZIP.

The rule engine is pure JavaScript. Integration tests use a small Foundry API harness; they do not replace testing in an actual world. libWrapper wraps the documented `_preUpdateOperation` and `_preCreateOperation` Item methods after upstream processing, then evaluates the whole requested batch. These are protected extension methods and may require adjustment after future Foundry changes.

Sources checked:

- [5e equipment schema and categories](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/item/equipment.mjs)
- [5e weapon classification and properties](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/item/weapon.mjs)
- [5e equipped and attuned fields](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/item/templates/equippable-item.mjs)
- [Foundry Item batch operations](https://foundryvtt.com/api/classes/foundry.documents.BaseItem.html)
- [libWrapper registration](https://github.com/ruipin/fvtt-lib-wrapper#132-using-libwrapper)
- [Foundry active GM selection](https://foundryvtt.com/api/v13/classes/foundry.documents.collections.Users.html#activeGM)
- [Foundry actor ownership checks](https://foundryvtt.com/api/v13/classes/foundry.documents.Actor.html#testUserPermission)
- [Foundry source UUID metadata](https://foundryvtt.com/api/interfaces/foundry.data.types.DocumentStats.html)

## In-world smoke test

1. As GM, enable Rings with a limit of two. Connect a player who owns a character with three unequipped rings. Equip two, then a third. Verify that the third remains unequipped and the message lists the other two.
2. Switch to Warn only and repeat. Verify the third equips and the message appears. Unequip it and verify no warning.
3. Register/use a custom equipment type, reopen settings or scan again, and enable its limit. Verify a player cannot exceed it in block mode.
4. Set melee to two and ranged to one. Equip one of each. Verify their totals remain separate; a thrown dagger belongs to melee.
5. Test Heavy alone, Two-Handed alone, both on one weapon, and a Versatile-only weapon. Verify costs of two, two, two, and one respectively when the corresponding options are enabled.
6. Enable attunement reminders and attune an item beyond the actor's maximum. Verify the change succeeds with a reminder. Raise the actor's maximum and verify the new maximum is respected.
7. Repeat on an unlinked player-owned token. Verify its base actor is unchanged.
8. Use `actor.updateEmbeddedDocuments("Item", [...])` to equip two items at once and to swap items in one batch. Verify blocking and swapping respectively. Add two already-equipped items with `createEmbeddedDocuments` and verify their combined cost is checked.
9. Save, reload the world, and verify settings persist. Confirm GM bypass and the option to apply limits to GMs.
10. On first activation, verify only the active GM sees the capacity report. If categories are disabled, verify the configuration guidance. Save a Rings limit below a player's existing equipped count and verify the new report lists that player, actor, limit, and excess candidates. Check an offline player and an unlinked token on another scene.
11. Reload and verify the initial report does not repeat. Open View Player Capacity, fix the inventory, then refresh the report and verify the actor is within limits. Check weighted weapons and optional attunement. Verify no inventory items were changed by running the report.
12. Enable Ammo with a magazine category and default formula on an actor with PROF 3 and STR +2. Carry six magazines across stacks; adding a seventh or increasing a stack beyond six should block. Warn only should permit it. Verify unequipping does not change the total and reducing quantity remains allowed.
13. Enable Aid with a potion UUID and Implants with your custom equipment category. With PROF 3, STR +2, and CON +1, verify limits of twelve and four. Change the formula controls and confirm the new limits in the GM report. Test STR -5 and PROF 2 to verify the ammo/aid minima of two/four.
14. Select an Item folder containing a nested folder, save, and add a copied source item to an actor. Verify it matches. Change folder contents, save again, and verify the refreshed selection. Select an Item compendium and test a new import. Check both modern source metadata and legacy `flags.core.sourceId`.
15. Test Remaining Uses by spending and refilling a pool, then One per item entry with stacked and zero-quantity items. Verify a partial stack's excess quantity in the GM report. Restart the world and verify all three sections and their selections persist.
16. Enable Light half-slot counting and set melee to one slot. Equip two Light weapons successfully, then try a third. Verify the warning shows 1.5 slots against a limit of one and marks each Light weapon as 0.5. Check ranged weapons separately, verify the GM report shows 0.5 excess, and save/reload the setting. If a custom weapon is both Light and Heavy/Two-Handed, verify an enabled two-slot rule takes priority.
