import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {TileType, Room, TILE_SIZE } from './types.js'
import { Enemy } from './enemy.js';
import { StorageItem } from './storageItem.js'
import { generateLoot, spawnDroppedItem } from "./loot.js";
import { clearLegacyCombatState } from "./legacyCombatState.js";
import { StatusBar } from "./statusBar.js";
import { DungeonEntrance } from "./DungeonEntrance.js";


export class Dungeon {
    constructor(width, height, {
        tileSize = 11,
        theme = (Math.random() < 0.25 ? "arena" : "default"),
        status = null,
    } = {}) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;

        this.offsetX = -(this.width * this.tileSize) / 2;
        this.offsetZ = -(this.height * this.tileSize) / 2;

        this.denseMatrix = this.createEmptyMatrix();
        this.theme = theme;
        this.entities = [];
        this.dungeonRooms = [];
        this.overworldExit = null;
        this.status = status ?? new StatusBar();

        this.env = {
          background: 0x2f2221,
          fog: null, // no fog right now
        };

        this.isDungeon = true;
    }

    async loadModelMap() {
        const loader = new GLTFLoader();
        const texLoader = new THREE.TextureLoader();
        const modelMap = {};

        async function loadModel(url, key, colormapUrl = null) {
            const gltf = await loader.loadAsync(url);
        
            const sceneClone = gltf.scene.clone(true);
        
            if (colormapUrl) {
              const map = await texLoader.loadAsync(colormapUrl);
              map.encoding = THREE.sRGBEncoding;
              map.colorSpace = THREE.SRGBColorSpace;
              map.flipY    = false;
        
              sceneClone.traverse(node => {
                if (!node.isMesh) return;
                const mat = node.material.clone();
                mat.map          = map;
                mat.needsUpdate  = true;

                mat.metalnessMap = null;
                mat.roughnessMap = null;
                mat.metalness    = 0;
                mat.roughness    = 1;
                node.material    = mat;
              });
            }
        
            modelMap[key] = sceneClone;
          }

          const themes = {
            default: [
                ['./public/wall.glb',        TileType.WALL,      null],
                ['./public/floor.glb',       TileType.FLOOR,     null],
                ['./public/floor-detail.glb',TileType.PEBBLES,   null],
                ['./public/stones.glb',       TileType.ROCK,   null], // this needs to be hacked a bit to work properly right now
            ],
            arena: [
                ['./public/wall.glb',                   TileType.WALL,      null],
                ['./public/alternate-floor.glb',        TileType.FLOOR,      './public/Textures/colormap3.png'],
                ['./public/alternate-floor-detail.glb', TileType.PEBBLES,   './public/Textures/colormap3.png'],
                ['./public/floor.glb',                  TileType.ROCK,   null],

            ]
          }
       const defs = themes[this.theme] || themes.default;

       await Promise.all(defs.map(([url, key, cmap]) => 
            loadModel(url, key, cmap)
        ));

        return modelMap;
    }
    
    createEmptyMatrix() {
        return Array.from({ length: this.height }, () =>
            Array.from({ length: this.width }, () => TileType.WALL)
        );
    }

    isInsideAnyRoom(x, y) {
        for (const room of this.dungeonRooms) {
          if (
            x >= room.x &&
            x < room.x + room.width &&
            y >= room.y &&
            y < room.y + room.height 
          ) {
            return true;
          }
        }
        return false;
      }

    fillDungeonWithDirt() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (!this.isInsideAnyRoom(x, y)) {
                    this.denseMatrix[y][x] = TileType.DIRT;
                }
            }
        }
    }
    
    setRoomBorders() {
        for (const room of this.dungeonRooms) {
          // Loop over the rectangle from one tile above/left to one tile below/right of the room.
          for (let y = room.y - 1; y <= room.y + room.height; y++) {
            for (let x = room.x - 1; x <= room.x + room.width; x++) {
              // Skip out-of-bound indices.
              if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
              // Only place a wall if this cell is not inside any room.
              if (!this.isInsideAnyRoom(x, y)) {
                this.denseMatrix[y][x] = TileType.WALL;
              }
            }
          }
        }
      }
      
      

    addStatus(message) {
        this.status.addStatus(message);
    }

    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    generateRooms() {
        for (let i = 0; i < 8; i ++) {
            const rw = this.randInt(4, 10);
            const rh = this.randInt(4, 10);

            const rx = this.randInt(1, this.width - rw - 1);
            const ry = this.randInt(1, this.height - rh - 1);

            this.dungeonRooms.push(new Room(rx, ry, rw, rh));
        }
    }

    carveRooms() {
        const chooseTile = () => {
            const rnd = Math.random() * 100;
            if (rnd < 89) return TileType.FLOOR;
            else if (rnd < 90) return TileType.ROCK;
            else return TileType.PEBBLES;
        };

        for (const room of this.dungeonRooms) {
            for (let y = room.y; y < room.y + room.height && y < this.height; y++) {
                for (let x = room.x; x < room.x + room.width && x < this.width; x++) {
                    this.denseMatrix[y][x] = chooseTile();
                }
            }
        }
    }

    connectRooms() {
        // determine if a tile is considered dirt.
        const isDirt = (tile) =>
          tile === TileType.DIRT || tile === TileType.PEBBLE_DIRT;
      
        for (let i = 1; i < this.dungeonRooms.length; i++) {
          const r1 = this.dungeonRooms[i - 1];
          const r2 = this.dungeonRooms[i];
      
          const x1 = Math.floor(r1.x + r1.width / 2);
          const y1 = Math.floor(r1.y + r1.height / 2);
      
          const x2 = Math.floor(r2.x + r2.width / 2);
          const y2 = Math.floor(r2.y + r2.height / 2);
      
          // horizontal corridor from min(x1, x2) to max(x1, x2) along row y1.
          const startX = Math.min(x1, x2);
          const endX = Math.max(x1, x2);
          for (let x = startX; x <= endX; x++) {
            if (y1 >= 0 && y1 < this.height && x >= 0 && x < this.width) {
              this.denseMatrix[y1][x] = TileType.FLOOR;
              // for horizontal corridors, check above and below.
              if (y1 - 1 >= 0 && isDirt(this.denseMatrix[y1 - 1][x])) {
                this.denseMatrix[y1 - 1][x] = TileType.WALL;
              }
              if (y1 + 1 < this.height && isDirt(this.denseMatrix[y1 + 1][x])) {
                this.denseMatrix[y1 + 1][x] = TileType.WALL;
              }
            }
          }
      
          // vertical corridor from min(y1, y2) to max(y1, y2) along column x2.
          const startY = Math.min(y1, y2);
          const endY = Math.max(y1, y2);
          for (let y = startY; y <= endY; y++) {
            if (y >= 0 && y < this.height && x2 >= 0 && x2 < this.width) {
              this.denseMatrix[y][x2] = TileType.FLOOR;
              // for vertical corridors, check left and right.
              if (x2 - 1 >= 0 && isDirt(this.denseMatrix[y][x2 - 1])) {
                this.denseMatrix[y][x2 - 1] = TileType.WALL;
              }
              if (x2 + 1 < this.width && isDirt(this.denseMatrix[y][x2 + 1])) {
                this.denseMatrix[y][x2 + 1] = TileType.WALL;
              }
            }
          }
        }
      }
      

    placeDoors() {
        const gates = [];
        const addDoor = (x, y) => {
            if (this.denseMatrix[y]?.[x] === TileType.DOOR) return null;
            this.denseMatrix[y][x] = TileType.DOOR;
            const gate = new DungeonEntrance(x, y, {
                modelPath: "./public/wall-gate.glb",
                scale: this.tileSize,
                colormap: "./public/Textures/colormap3.png",
                id: "Dungeon Gate",
                label: "Enter next dungeon",
            });
            this.entities.push(gate);
            gates.push(gate);
            return gate;
        };

        for (const room of this.dungeonRooms) {
            const x = Math.floor(room.x + room.width / 2);
            const y = room.y;
            if (y - 1 >= 0 && this.denseMatrix[y - 1][x] === TileType.WALL) {
                addDoor(x, y - 1);
            } else if (y + room.height < this.height && this.denseMatrix[y + room.height][x] === TileType.WALL) {
                addDoor(x, y + room.height);
            }
        }

        // Generated layouts normally provide several room-wall gates. Keep a
        // bounded fallback so a valid dungeon can never be created without an
        // exit if a future room-generation change produces no normal gate.
        if (gates.length === 0) {
            const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            let fallback = null;
            for (let y = 1; y < this.height - 1 && !fallback; y++) {
                for (let x = 1; x < this.width - 1; x++) {
                    if (this.denseMatrix[y][x] !== TileType.WALL) continue;
                    if (directions.some(([dx, dy]) =>
                        this.denseMatrix[y + dy]?.[x + dx] === TileType.FLOOR
                    )) {
                        fallback = { x, y };
                        break;
                    }
                }
            }

            if (!fallback) {
                for (let y = 1; y < this.height - 1 && !fallback; y++) {
                    for (let x = 1; x < this.width - 1; x++) {
                        if (this.denseMatrix[y][x] === TileType.FLOOR) {
                            fallback = { x, y };
                            break;
                        }
                    }
                }
            }

            if (fallback) addDoor(fallback.x, fallback.y);
        }

        if (gates.length === 0) {
            throw new Error("Unable to place an overworld exit in the dungeon");
        }

        const exitGate = gates[this.randInt(0, gates.length - 1)];
        exitGate.setDestination("overworld");
        this.overworldExit = exitGate;
    }

    placePlayer(player) {
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const reachable = [];
        const visited = new Set();
        const queue = [];
        const exit = this.overworldExit;
        const enqueue = (x, y) => {
            const key = `${x},${y}`;
            if (visited.has(key) || !this.isWalkableAt(x, y)) return;
            visited.add(key);
            queue.push({ x, y });
        };

        if (exit) {
            for (const [dx, dy] of directions) {
                enqueue(exit.coords.x + dx, exit.coords.y + dy);
            }
        }

        if (queue.length === 0) {
            for (let y = 0; y < this.height && queue.length === 0; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (!this.isWalkableAt(x, y)) continue;
                    enqueue(x, y);
                    break;
                }
            }
        }

        for (let index = 0; index < queue.length; index++) {
            const position = queue[index];
            reachable.push(position);

            for (const [dx, dy] of directions) {
                enqueue(position.x + dx, position.y + dy);
            }
        }

        const occupied = new Set(
            this.entities.map((entity) => `${entity.coords.x},${entity.coords.y}`)
        );
        const openTiles = reachable.filter(({ x, y }) =>
            !occupied.has(`${x},${y}`)
        );
        const roomTiles = openTiles.filter(({ x, y }) =>
            this.isInsideAnyRoom(x, y)
        );
        const candidates = roomTiles.length > 0 ? roomTiles : openTiles;
        if (candidates.length === 0) {
            throw new Error("Unable to place the player near the dungeon exit");
        }

        const spawn = candidates[this.randInt(0, candidates.length - 1)];
        player.coords.set(spawn.x, spawn.y);
        player.path = [];
        player._targetWorldPos = null;
    }

    spawnEnemies() {
        for (let i = 0; i < 4; i++) {
            const spawnRoll = Math.random();
            if (spawnRoll > 0.6) continue;
            const enemyRoll = Math.random();
            const spawnHardEnemy = enemyRoll > 0.6;
            let ex, ey;

            do {
                ex = this.randInt(1, this.width - 2);
                ey = this.randInt(1, this.height - 2);
            } while (this.denseMatrix[ey][ex] !== TileType.FLOOR);

            if (spawnHardEnemy) {
                let hardEnemy;
                if (this.theme === 'arena') {
                    hardEnemy = new Enemy("./public/character-soldier.glb",
                        "Legion Grunt",
                        60, ex, ey, 10, 15,
                        {
                            scale: TILE_SIZE, 
                            height: 0, 
                            colormap: "./public/Textures/colormap3.png",
                            faction: "legion"
                        });
                } else {
                    hardEnemy = new Enemy("./public/character-orc.glb",
                        "Orc Warrior",
                        50, ex, ey, 8, 10,
                        {
                            faction: "orc"
                        });
                }
                this.entities.push(hardEnemy);
            } else {
                let easyEnemy = new Enemy("./public/character-zombie.glb",
                     "Zombie",
                      30, ex, ey, 7, 4,
                    {
                        scale: TILE_SIZE,
                        height: 0,
                        colormap: "./public/Textures/colormap2.png",
                        faction: "undead"

                    });
                this.entities.push(easyEnemy);
            }
        }
    }

    spawnLoot() {
        let chance = 1.0;
        const occupied = new Set(
            this.entities.map((entity) => `${entity.coords.x},${entity.coords.y}`)
        );

        const randomFloorInRoom = room => {
            const available = [];
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (
                        this.denseMatrix[y]?.[x] === TileType.FLOOR &&
                        !occupied.has(`${x},${y}`)
                    ) {
                        available.push({ x, y });
                    }
                }
            }

            if (available.length === 0) return null;
            const location = available[this.randInt(0, available.length - 1)];
            occupied.add(`${location.x},${location.y}`);
            return location;
        };

        for (const room of this.dungeonRooms) {
            if (Math.random() < chance) {
                const location = randomFloorInRoom(room);
                if (location) {
                    const count = this.randInt(1, 3);
                    const contents = generateLoot(count);

                    this.entities.push(
                        new StorageItem(
                            "Barrel",
                            location.x,
                            location.y,
                            contents,
                            { scale: this.tileSize }
                        )
                    );
                }
            }
            chance *= 0.25;
        }

         // Always include one guaranteed loot barrel in addition to random spawns.
         if (this.dungeonRooms.length) {
            const roomOffset = this.randInt(0, this.dungeonRooms.length - 1);
            for (let i = 0; i < this.dungeonRooms.length; i++) {
                const room = this.dungeonRooms[
                    (roomOffset + i) % this.dungeonRooms.length
                ];
                const location = randomFloorInRoom(room);
                if (!location) continue;

                const numItems = this.randInt(1, 3);
                const contents = generateLoot(numItems);
                this.entities.push(
                    new StorageItem(
                        "Barrel",
                        location.x,
                        location.y,
                        contents,
                        { scale: this.tileSize }
                    )
                );
                break;
            }
         }
    }


   gridToWorld(x, y) {
    return new THREE.Vector3(
        this.offsetX + x * this.tileSize + this.tileSize / 2,
        0,
        this.offsetZ + y * this.tileSize + this.tileSize / 2
        );
    }


    worldToGrid(worldPt) {
        const gx = Math.floor((worldPt.x - this.offsetX) / this.tileSize);
        const gy = Math.floor((worldPt.z - this.offsetZ) / this.tileSize);
        if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return null;
        return { x: gx, y: gy };
    }

    removeEntity(entity) {
        const idx = this.entities.indexOf(entity);
        if (idx < 0) return false;
        entity.cancelVisuals?.();
        this.entities.splice(idx, 1);
        return true;
    }

    isWalkableAt(x, y) {
        const t = this.denseMatrix[y]?.[x];
        if (t == null) return false;

        switch (t) {
            case TileType.WALL:
            case TileType.WATER:
            case TileType.DIRT:
            case TileType.PEBBLE_DIRT:
            case TileType.ROCK_DIRT:
            case TileType.DOOR:
            return false;
            default:
            return true;
    }
}

    blocksInteractionAt(x, y) {
        const tile = this.denseMatrix[y]?.[x];
        return tile === TileType.WALL ||
            tile === TileType.DIRT ||
            tile === TileType.PEBBLE_DIRT ||
            tile === TileType.ROCK_DIRT;
    }


getActionsAt({ gridX, gridY, entity }) {
  const actions = [];

  if (this.isWalkableAt(gridX, gridY)) {
    actions.push({
      label: "Walk here",
      run: async (game) => {
        await game.player.moveToAsync(new THREE.Vector2(gridX, gridY), this);
      },
    });
  }

  return actions;
}

    updateTick(game) {
        const player = game.player;
        if (!player) return;

        clearLegacyCombatState(game.combatMgr, this.entities);
        game.ui?.setHealth?.(player.combat.hp);
        player.skills?.updateUI?.();

        // Combat no longer advances on ticks, but completed death animations
        // still need their normal removal and loot-drop lifecycle.
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const entity = this.entities[i];
            if (!(entity instanceof Enemy) || !entity.readyToRemove) continue;

            if (Math.random() < 0.5) {
                spawnDroppedItem(
                    entity.coords.x,
                    entity.coords.y,
                    this.entities,
                    game.currentMapGroup,
                    this
                );
            }
            game.currentMapGroup?.remove(entity.model);
            this.entities.splice(i, 1);
        }
    }

    async generateDungeon(player = null) {
        this.denseMatrix = this.createEmptyMatrix();
        this.theme = (Math.random() < 0.25 ? 'arena' : 'default'); // should make this generally happen only at one point
        this.entities = [];
        this.dungeonRooms = [];
        this.overworldExit = null;

        this.generateRooms();
        this.fillDungeonWithDirt();
        this.setRoomBorders();
        this.carveRooms();
        this.connectRooms();
        this.placeDoors();
        this.spawnLoot();
        this.spawnEnemies();

        if (player) this.placePlayer(player);
    }
}
