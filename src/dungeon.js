import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {TileType, Room, Pool } from './types.js'
import { Player } from './player.js'
import { Enemy } from './enemy.js';

//const TILE_SIZE = 16;  TODO: implment dynamic resizing

export class Dungeon {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.denseMatrix = this.createEmptyMatrix();
        this.sparseMatrix = [];
        this.dungeonRooms = [];
        this.statusMessages = [];

        //this.materialMap = this.loadMaterialMap();
    }

    loadModelMap() {
        const loader = new GLTFLoader();
        const modelMap = {};

        const loadModel = (url, key) => {
            return new Promise((resolve, reject) => {
                loader.load(
                    url, 
                    (gltf) => {
                        modelMap[key] = gltf.scene;
                        resolve();
                    },
                    undefined,
                    (error) => reject(error)
                );
            });
        };

        // Duplicates are to ensure no holes in dungeon for now
        return Promise.all([
            loadModel('./public/wall.glb', TileType.WALL),
            loadModel('./public/floor.glb', TileType.FLOOR),
            loadModel('./public/floor-detail.glb', TileType.PEBBLES),
            loadModel('./public/floor.glb', TileType.ROCK),
            loadModel('./public/wall.glb', TileType.WALL),
            loadModel('./public/dirt.glb', TileType.DIRT),
            loadModel('./public/dirt.glb', TileType.PEBBLE_DIRT),
            loadModel('./public/dirt.glb', TileType.ROCK_DIRT),
            loadModel('./public/gate.glb', TileType.DOOR),
        ]).then(() => modelMap);
    }

    // DEAD CODE
    loadMaterialMap() {

        const textureLoader = new THREE.TextureLoader();

        const standardWallTexture = textureLoader.load('./tile_0014.png', () => {
            standardWallTexture.colorSpace = THREE.SRGBColorSpace
        });

        const brightWallTexture = textureLoader.load('./tile_0040.png', () => {
            brightWallTexture.colorSpace = THREE.SRGBColorSpace
        });

        const daggerHead = textureLoader.load('./tile_0019.png', () => {
            daggerHead.colorSpace = THREE.SRGBColorSpace
        });

        const spoutWallTexture = textureLoader.load('./tile_0007.png', () => {
            spoutWallTexture.colorSpace = THREE.SRGBColorSpace
        });

        const wallTextures = [ 
            new THREE.MeshBasicMaterial({ map: standardWallTexture } ),
            new THREE.MeshBasicMaterial({ map: brightWallTexture } ),
            new THREE.MeshBasicMaterial({ map: spoutWallTexture } ),
            new THREE.MeshBasicMaterial({ map: daggerHead } ),
        ];

        const floorTexture = textureLoader.load('./tile_0048.png', () => {
            floorTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const rockTexture = textureLoader.load('./tile_0042.png', () => {
            rockTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const pebblesTexture = textureLoader.load('./tile_0049.png', () => {
            pebblesTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const doorTexture = textureLoader.load('./tile_0045.png', () => {
            doorTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const waterTexture = textureLoader.load('./tile_0037.png', () => {
            waterTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const dirtTexture = textureLoader.load('./tile_0000.png', () => {
            dirtTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const pebbleDirtTexture = textureLoader.load('./tile_0012.png', () => {
            pebbleDirtTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const rocksDirtTexture = textureLoader.load('./tile_0024.png', () => {
            rocksDirtTexture.colorSpace = THREE.SRGBColorSpace;
        });

        const materialMap = {
            [TileType.WALL]: wallTextures,
            [TileType.FLOOR]: new THREE.MeshBasicMaterial({ map: floorTexture }),
            [TileType.ROCK]: new THREE.MeshBasicMaterial({ map: rockTexture }),
            [TileType.PEBBLES]: new THREE.MeshBasicMaterial({ map: pebblesTexture }),
            [TileType.DOOR]: new THREE.MeshBasicMaterial({ map: doorTexture }),
            [TileType.WATER]: new THREE.MeshBasicMaterial({ map: waterTexture }),
            [TileType.DIRT]: new THREE.MeshBasicMaterial({ map: dirtTexture }),
            [TileType.PEBBLE_DIRT]: new THREE.MeshBasicMaterial({ map: pebbleDirtTexture }),
            [TileType.ROCK_DIRT]: new THREE.MeshBasicMaterial({ map: rocksDirtTexture }),
        };

        return materialMap;
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
                    const roll = Math.random();
                    if (roll < 0.85) {
                        this.denseMatrix[y][x] = TileType.DIRT;
                    } else if (roll < 0.99) {
                        this.denseMatrix[y][x] = TileType.PEBBLE_DIRT;
                    } else {
                        this.denseMatrix[y][x] = TileType.ROCK_DIRT;
                    }
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

            const posLimit = Math.min(this.width, this.height) - 12;
            const rx = this.randInt(1, posLimit);
            const ry = this.randInt(1, posLimit);

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
          for (let x = startX; x < endX; x++) {
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
        this.sparseMatrix.push(player); // just push them on the sparse matrix
    }

    spawnEnemies() {
        for (let i = 0; i < 8; i++) {
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
                let cyclops = new Enemy("Cyclopes", 50, ex, ey, 10); // ID, HP, x, y, atk, agro
                this.sparseMatrix.push(cyclops);
            } else {
                let spider = new Enemy("Spider", 30, ex, ey, 3, 4); // Spiders have smaller agro range
                this.sparseMatrix.push(spider);
            }
        }
    }

    // Takes reference to THREE.js scene
    updateEnemies(scene) {
        const player = this.player;
        if (!player) {
            console.error("ERROR: player entity does not exist when it should");
            return;
        }

        for (const obj of this.sparseMatrix) {
            if (obj instanceof Enemy) {
                if (obj.hp <= 0) {
                    this.addStatus(`You have slain a: ${obj.id}`);
                    scene.remove(obj.mesh);
                    if (obj.mesh.geometry) obj.mesh.geometry.dispose();
                    if (obj.mesh.material) obj.mesh.material.dispose();
                    this.sparseMatrix.splice(this.sparseMatrix.indexOf(obj), 1);
                    continue;

                }
                const nextPos = obj.tryMove(player.coords, this.denseMatrix);
                if (nextPos.equals(obj.coords)) {
                    const idlePos = obj.idle(this.denseMatrix);
                    if (!idlePos.equals(obj.coords)) {
                        obj.move(idlePos);
                    }
                } else {
                    obj.move(nextPos);

                }
            }
        }
    }

    get player() {
        return this.sparseMatrix.find(obj => obj instanceof Player); // This should go by ID at some point rather than inst of
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



    async generateDungeon() {
        this.denseMatrix = this.createEmptyMatrix();
        this.sparseMatrix = [];
        this.dungeonRooms = [];

        this.generateRooms();
        this.fillDungeonWithDirt();
        this.setRoomBorders();
        this.carveRooms();
        this.connectRooms();
        this.placeDoors();

        this.spawnPools();


        await this.spawnPlayer();
    }
}