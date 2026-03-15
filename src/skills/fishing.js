import * as THREE from "three";
import { InventoryItem } from "../inventory.js";

const FOOD_ITEMS = Object.freeze([
  {
    id: "Cheese Wheel",
    name: "Cheese Wheel",
    imagePath: "./Items/cheese.png",
    description: "A wheel of cheese.",
    heal: 4,
  },
  {
    id: "Raw Meat",
    name: "Raw meat",
    imagePath: "./Items/meat-raw.png",
    description: "Fresh but raw.",
    heal: 4,
  },
  {
    id: "Cake",
    name: "Cake",
    imagePath: "./Items/cake.png",
    description: "An entire cake.",
    heal: 6,
  },
  {
    id: "Coconut",
    name: "Coconut",
    imagePath: "./Items/coconut.png",
    description: "Restores HP.",
    heal: 5,
  },
  {
    id: "Cabbage",
    name: "Cabbage",
    imagePath: "./Items/cabbage.png",
    description: "Crunchy and fresh.",
    heal: 3,
  },
  {
    id: "Fish Bones",
    name: "Fish Bones",
    imagePath: "./Items/fish-bones.png",
    description: "A bony consolation prize.",
    heal: 1,
    glbPath: "./public/fish-bones.glb",
  },
]);

const FOOD_MESSAGES = Object.freeze([
  "You reel in a snack that probably wasn't meant to swim.",
  "Your line delivers a suspiciously tasty surprise.",
  "You catch something edible and question the river's ecosystem.",
  "You tug up a meal with a faint smell of adventure.",
]);

const FISH_MESSAGES = Object.freeze([
  "A solid tug! You land a proper fish.",
  "The line bends and a fish joins your party.",
  "You hook a fish and feel like a legend.",
  "A shimmering catch splashes into your pack.",
]);

const NOTHING_MESSAGES = Object.freeze([
  "Nothing bites. The water wins this round.",
  "You wait... and the fish ghost you.",
  "A ripple, a tug, then nothing. Classic.",
  "You haul in a whole lot of nothing.",
]);

function addStatus(map, message) {
  if (map?.addStatus) {
    map.addStatus(message);
    return;
  }
  map?.status?.addStatus?.(message);
}

function rollWeighted(rng, entries) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let r = rng() * total;
  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

function pickMessage(messages, rng) {
  return messages[Math.floor(rng() * messages.length)];
}

function rollOutcome(level, rng) {
  const fishChance = Math.min(0.28, 0.01 + level * 0.006);
  const foodChance = Math.min(0.22, 0.05 + level * 0.004);
  const totalChance = fishChance + foodChance;
  const nothingChance = Math.max(0.1, 1 - totalChance);

  const scale = fishChance + foodChance + nothingChance;

  return rollWeighted(rng, [
    { item: "nothing", weight: nothingChance / scale },
    { item: "food", weight: foodChance / scale },
    { item: "fish", weight: fishChance / scale },
  ]);
}

function makeFoodItem(def) {
  return new InventoryItem(
    def.id,
    def.name,
    def.imagePath,
    def.description,
    "food",
    (player, map) => {
      const heal = def.heal ?? 4;
      player.combat.hp = Math.min(player.combat.hp + heal, player.maxHealth);
      player.interact();
      addStatus(map, `You eat ${def.name.toLowerCase()} and recover ${heal} HP.`);
    },
    { stackable: true, maxStackSize: 16, glbPath: def.glbPath }
  );
}

function makeFishItem() {
  return new InventoryItem(
    "Fish",
    "Fish",
    "./Items/fish.png",
    "A freshly caught fish.",
    "food",
    (player, map) => {
      player.combat.hp = Math.min(player.combat.hp + 6, player.maxHealth);
      player.interact();
      addStatus(map, "You eat the fish and feel refreshed.");
    },
    { stackable: true, maxStackSize: 16, glbPath: "./public/fish.glb" }
  );
}

function findFishingSpot(map, waterX, waterY, playerCoords) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const candidates = [];
  for (const [dx, dy] of dirs) {
    const x = waterX + dx;
    const y = waterY + dy;
    if (!map?.isWalkableAt?.(x, y)) continue;
    const dist = Math.abs(playerCoords.x - x) + Math.abs(playerCoords.y - y);
    candidates.push({ x, y, dist });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return new THREE.Vector2(candidates[0].x, candidates[0].y);
}

export function startFishing(game, map, waterX, waterY) {
  const player = game?.player;
  if (!player || !map) return;

  if (player._fishingState?.active) {
    addStatus(map, "You're already fishing.");
    return;
  }

  const spot = findFishingSpot(map, waterX, waterY, player.coords);
  if (!spot) {
    addStatus(map, "No room to stand and fish from here.");
    return;
  }

  player._fishingState = {
    active: true,
    phase: "moving",
    water: new THREE.Vector2(waterX, waterY),
    spot,
  };

  player.moveToAsync(spot, map).then(() => {
    const state = player._fishingState;
    if (!state?.active) return;
    state.phase = "fishing";
    if (map.gridToWorld && player.model) {
      const world = map.gridToWorld(waterX, waterY);
      player.model.lookAt(world.x, player.model.position.y, world.z);
    }
  });
}

export function updateFishingTick(game, map) {
  const player = game?.player;
  if (!player?.skills || !player._fishingState?.active) return;

  const state = player._fishingState;

  if (state.phase === "moving") {
    return;
  }

  if (!player.coords.equals(state.spot)) {
    player._fishingState = null;
    return;
  }

  player.interact();
  addStatus(map, "You attempt to catch a fish...");

  const level = player.skills.skills?.Fishing?.level ?? 1;
  const outcome = rollOutcome(level, Math.random);

  if (outcome === "nothing") {
    addStatus(map, pickMessage(NOTHING_MESSAGES, Math.random));
    return;
  }

  if (outcome === "food") {
    const def = FOOD_ITEMS[Math.floor(Math.random() * FOOD_ITEMS.length)];
    const item = makeFoodItem(def);
    player.addItem(item, 1);
    player.skills.gainXp("Fishing", 6);
    addStatus(map, pickMessage(FOOD_MESSAGES, Math.random));
    game.ui?.renderInventory?.(player.inventory);
    player._fishingState = null;
    return;
  }

  const fish = makeFishItem();
  player.addItem(fish, 1);
  player.skills.gainXp("Fishing", 12);
  addStatus(map, pickMessage(FISH_MESSAGES, Math.random));
  game.ui?.renderInventory?.(player.inventory);
  player._fishingState = null;
}
