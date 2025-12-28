import * as THREE from 'three';
import { TileType } from './types.js';
import  { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WIDTH = 40;   // columns
const HEIGHT = 30;  // rows
const TILE_SIZE = 11;

export function buildDungeon(scene, modelMap, dungeonTiles) {

    while (scene.children.length) scene.remove(scene.children[0]);

    const px = WIDTH * TILE_SIZE;
    const pz = HEIGHT * TILE_SIZE;
    const offsetX = -px / 2;
    const offsetZ = -pz / 2;

    const dirtCoords = [];

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const tile = dungeonTiles[y][x];
            if (tile === TileType.DIRT || tile === TileType.PEBBLE_DIRT || tile === TileType.ROCK_DIRT) {
                dirtCoords.push([x, y]); // better than using THREE.Vector2D? 
            } else {
                if (tile === TileType.DOOR) {
                    // Swapped out door model logic for now
                    // See commit: https://github.com/ll-ml/UnboundDepths/commit/defcdfbc231ccf250a93309e5a539d25883fc84d
                    const doorwayModel = modelMap[TileType.FLOOR];
                    const doorWayInst = doorwayModel.clone();

                    doorWayInst.position.set(
                        offsetX + x * TILE_SIZE + TILE_SIZE / 2,
                        0,
                        offsetZ + y * TILE_SIZE + TILE_SIZE / 2
                    )
                    doorWayInst.scale.setScalar(TILE_SIZE);
                    scene.add(doorWayInst);
                }
                const proto = modelMap[tile];
                if (!proto) continue;
                const modelInstance = proto.clone();
                
                modelInstance.position.set( 
                    offsetX + x * TILE_SIZE + TILE_SIZE / 2,
                    0,
                    offsetZ + y * TILE_SIZE + TILE_SIZE / 2
                );
                modelInstance.scale.setScalar(TILE_SIZE); // Hard code constant for now
                scene.add(modelInstance);
            
            }
        }
    }

    if (dirtCoords.length) {
        const cube = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);
        const geos = dirtCoords.map(([x, y]) => {
            const g = cube.clone();
            g.translate(
                offsetX + x * TILE_SIZE + TILE_SIZE / 2,
                TILE_SIZE / 2,
                offsetZ + y * TILE_SIZE + TILE_SIZE / 2
            );
            return g;
        });
        const merged = mergeGeometries(geos, false);
        const brownDirtMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const mesh = new THREE.Mesh(merged, brownDirtMaterial);
        scene.add(mesh);
    }
}