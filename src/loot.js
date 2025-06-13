import { InventoryItem } from "./inventory.js";

/**
 * Generate `count` loot items:
 * 1) for each slot, roll a rarity
 * 2) sample one item from that rarity’s table
 */
export function generateLoot(count = 1) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const rarity = rollRarity();
      const table  = lootTables[rarity];
      result.push(weightedChoice(table));
    }
    return result;
  }


export const lootTables = {
    common: [
      { item: new InventoryItem("Cheese Wheel",  "Cheese Wheel",  "./Items/cheese.png",  "A wheel of cheese.", "food", (player, dungeon) => { player.combat.hp = Math.min(player.combat.hp + 3, player.maxHealth); player.interact(); dungeon.addStatus("You eat a cheese wheel and recover 3 HP.");}),      weight: 50 },
      { item: new InventoryItem("Raw Meat",   "Raw meat", "./Items/meat-raw.png",  "Fresh but raw.", "food", (player, dungeon) => { player.combat.hp = Math.min(player.combat.hp + 5, player.maxHealth); dungeon.addStatus("You consume raw meat in order to recover 5 HP.")}),      weight: 30 },
      { item: new InventoryItem("Gold Coin",   "Gold coin","./Items/coin.png",  "It glitters."),         weight: 20 },
    ],
    uncommon: [
      { item: new InventoryItem("Cake",  "Cake",    "./Items/cake.png",  "An entire cake."), weight: 40 },
      { item: new InventoryItem("Coconut",  "Coconut","./Items/coconut.png","Restores HP."), weight: 10 },
    ],
    rare: [
      { item: new InventoryItem("Coins","100 Coins",   "./Items/coin.png","Heavier than you thought."),       weight: 1 },
    ]
  };

  const rarityChances = [
    { rarity: "common",   weight: 0.7 },
    { rarity: "uncommon", weight: 0.25 },
    { rarity: "rare",     weight: 0.05 }
  ];


  function rollRarity() {
    return weightedChoice(
      rarityChances.map(({ rarity, weight }) => ({
        item: rarity,
        weight
      }))
    );
  }
  

function weightedChoice(choices) {
    const total = choices.reduce((sum, { weight }) => sum + weight, 0);
    let r = Math.random() * total;
    for (const { item, weight } of choices) {
      if (r < weight) return item;
      r -= weight;
    }

    return choices[choices.length - 1].item;
  }