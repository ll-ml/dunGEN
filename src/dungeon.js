import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {TileType, Room, Pool, TILE_SIZE } from './types.js'
import { Player } from './player.js'
import { Enemy } from './enemy.js';
import { StorageItem } from './storageItem.js'
import { generateLoot } from "./loot.js";


export class Dungeon {
    constructor(width, height, { tileSize = 11, theme = (Math.random() < 0.25 ? "arena" : "default") } = {}) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;

        this.offsetX = -(this.width * this.tileSize) / 2;
        this.offsetZ = -(this.height * this.tileSize) / 2;

        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);


        this.denseMatrix = this.createEmptyMatrix();
        this.theme = theme;
        this.entities = [];
        this.dungeonRooms = [];
        this.statusMessages = [];
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
                ['./public/wall-gate.glb',   TileType.DOOR,      './public/Textures/colormap3.png'],
            ],
            arena: [
                ['./public/wall.glb',                   TileType.WALL,      null],
                ['./public/alternate-floor.glb',        TileType.FLOOR,      './public/Textures/colormap3.png'],
                ['./public/alternate-floor-detail.glb', TileType.PEBBLES,   './public/Textures/colormap3.png'],
                ['./public/floor.glb',                  TileType.ROCK,   null],
                ['./public/wall-gate.glb',              TileType.DOOR,      './public/Textures/colormap3.png'],

            ]
          }


          /*
        // Duplicates are to ensure no holes in dungeon for now
        await Promise.all([
            loadModel('./public/wall.glb', TileType.WALL),
            //loadModel('./public/alternate-wall.glb', TileType.WALL, './public/Textures/colormap3.png'),
            //loadModel('./public/floor.glb', TileType.FLOOR),
            loadModel('./public/alternate-floor.glb', TileType.FLOOR, './public/Textures/colormap3.png'),
            //loadModel('./public/floor-detail.glb', TileType.PEBBLES),
            loadModel('./public/alternate-floor-detail.glb', TileType.PEBBLES, './public/Textures/colormap3.png'),
            loadModel('./public/floor.glb', TileType.ROCK),
            loadModel('./public/wall.glb', TileType.WALL),
            //loadModel('./public/wall-opening.glb', TileType.DOOR_WAY),
            loadModel('./public/wall-gate.glb', TileType.DOOR, './public/Textures/colormap3.png'),
        ]);
        */
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
      
      

    showCurrentState() {
        let outString = "";
        this.denseMatrix.forEach((row) => {
            outString += row.toString() +"\n";
        });
        console.log(outString);
    }

    addStatus(message) {
        this.statusMessages.push(message);

        if (this.statusMessages.length > 3) {
            this.statusMessages.shift();
        }

        this.updateStatusArea();

        setTimeout(() => {
            this.removeStatus(message);
        }, 5000); // remove message after 5 seconds elapsed
    }

    updateStatusArea() {
        const statusArea = document.getElementById('statusArea');

        if (statusArea) {
            statusArea.innerHTML = this.statusMessages.join('<br>');
        }
    }

    removeStatus(message) {
        this.statusMessages = this.statusMessages.filter(m => m !== message);
        this.updateStatusArea();
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
        for (const room of this.dungeonRooms) {
            const x = Math.floor(room.x + room.width / 2);
            const y = room.y;
            if (y - 1 >= 0 && this.denseMatrix[y - 1][x] == TileType.WALL) {
                this.denseMatrix[y - 1][x] = TileType.DOOR;
            } else if (y + room.height < this.height && this.denseMatrix[y + room.height][x] == TileType.WALL) {
                this.denseMatrix[y + room.height][x] = TileType.DOOR;
            }
        }
    }

    async spawnPlayer() {
        if (this.dungeonRooms.length === 0) {
            console.warn("ERROR: attempted to spawn player with no rooms in dungeon!");
            return;
        }

        // pull out a random room
        const roomIndex = this.randInt(0, this.dungeonRooms.length - 1);
        const room = this.dungeonRooms[roomIndex];

        const px = this.randInt(room.x + 1, room.x + room.width - 2);
        const pz = this.randInt(room.y + 1, room.y + room.height - 2)

        const player = new Player(px, pz);
        this.entities.push(player); // just push them on the sparse matrix
    }

    placePlayer(player) {
        const room = this.dungeonRooms[this.randInt(0, this.dungeonRooms.length - 1)];
        const px = this.randInt(room.x + 1, room.x + room.width - 2);
        const py = this.randInt(room.y + 1, room.y + room.height - 2);

        player.coords.set(px, py);
        player.path = [];
        player._targetWorldPos = null;

        player.updatePosition(this);
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
                            colormap: "./public/Textures/colormap3.png"
                        });
                } else {
                    hardEnemy = new Enemy("./public/character-orc.glb",
                        "Orc Warrior",
                        50, ex, ey, 8, 10,);
                }
                this.entities.push(hardEnemy);
            } else {
                let easyEnemy = new Enemy("./public/character-zombie.glb",
                     "Zombie",
                      30, ex, ey, 7, 4,
                    {
                        scale: TILE_SIZE,
                        height: 0,
                        colormap: "./public/Textures/colormap2.png"

                    });
                this.entities.push(easyEnemy);
            }
        }
    }

    spawnLoot() {
        let chance = 1.0;
        let anySpawned = false; 

        const randomFloorInRoom = room => {
            let x, y;
            
            do {
                x = this.randInt(room.x, room.x + room.width - 1);
                y = this.randInt(room.y, room.y + room.height - 1);
            } while (this.denseMatrix[y][x] !== TileType.FLOOR);
            return { x, y };
        };

        for (const room of this.dungeonRooms) {
            if (Math.random() < chance) {
                const { x, y } = randomFloorInRoom(room);

                const count = this.randInt(0, 3);
                const contents = generateLoot(count);
                
                this.entities.push(
                    new StorageItem("Barrel", x, y, contents)
                );
                anySpawned = true;
            }
            chance *= 0.25;
        }

         // If player gets bad RNG force a spawn for at least one loot barrel
         if (this.dungeonRooms.length) {
            const fallbackRoom = this.dungeonRooms[
                this.randInt(0, this.dungeonRooms.length - 1)
            ]

            const { x, y } = randomFloorInRoom(fallbackRoom);
            const numItems = this.randInt(1, 3);
            const contents = generateLoot(numItems);
            

            this.entities.push(
                new StorageItem("Barrel", x, y, contents)
            );
         }
    }


    get player() {
        return this.entities.find(obj => obj instanceof Player); // This should go by ID at some point rather than inst of
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

    pickWorldPoint(raycaster) {
        const out = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(this.groundPlane, out)) return null;
        return out;
    }

    pickEntity(raycaster) {
        let best = null;
        let bestDist = Infinity;
        const tmp = new THREE.Vector3();

        for (const obj of this.entities) {
            if (!obj.model) continue;
            if (raycaster.ray.intersectBox(obj.hitbox, tmp)) {
            const d = raycaster.ray.origin.distanceTo(tmp);
            if (d < bestDist) { bestDist = d; best = obj; }
        }
        }
        return best;
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
            return false;
            default:
            return true;
    }
}


    /*
        TODO: Remove pools, make it another tile structure.
    */
    spawnPools(spawnChance = 0.0) {
        this.pools = [];

        for (const room of this.dungeonRooms) {
            if (room.width < 4 || room.height < 4) continue;

            if (Math.random() >= spawnChance) continue;

            const poolX = this.randInt(room.x, room.x + room.width - 2);    // will have to adjust this later if we do not stick to just 2x2
            const poolY = this.randInt(room.y, room.y + room.height - 2);

            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    this.denseMatrix[poolY + dy][poolX + dx] = TileType.WATER;
                }
            }

            const pool = new Pool(poolX, poolY, 2, 2);
            this.pools.push(pool);
            this.addStatus("You notice a strange body of water...");
        }

    }

    getPoolAt(tileX, tileY) {
        return this.pools.find(pool => {
            tileX >= pool.x &&
            tileX < pool.x + pool.width && 
            tileY >= pool.y && 
            tileY < pool.y + pool.height
        });
    }

getActionsAt({ gridX, gridY, entity }) {
  const actions = [];

  if (entity?.kind === "Storage") {
    actions.push({
      label: `Search ${entity.id}`,
      run: async (game) => {
        await game.player.moveToAsync(entity.coords, this);
        game.ui.openStorageModal(entity);
      },
    });
  }

  if (entity?.kind === "Enemy") {
    actions.push({
      label: `Attack ${entity.name ?? "enemy"}`,
      run: async (game) => {
        // later: game.combatManager.engage(...)
        await game.player.moveToAsync(entity.coords.clone().add(new THREE.Vector2(-1, 0)), this);
      },
    });
  }

  const tile = this.denseMatrix[gridY]?.[gridX];

  if (tile === TileType.DOOR) {
    actions.push({
      label: "Open door",
      run: async (game) => {
        await game.player.moveToAsync(new THREE.Vector2(gridX, gridY), this);
        await game.enterDungeon({ regenerate: true });
      },
    });
  }

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




    async generateDungeon(player = null) {
        this.denseMatrix = this.createEmptyMatrix();
        this.theme = (Math.random() < 0.25 ? 'arena' : 'default'); // should make this generally happen only at one point
        //this.entities = [];
        this.dungeonRooms = [];

        this.generateRooms();
        this.fillDungeonWithDirt();
        this.setRoomBorders();
        this.carveRooms();
        this.connectRooms();
        this.placeDoors();

        this.placePlayer(player);

        this.spawnLoot();

        this.spawnEnemies();
    }
}