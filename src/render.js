import * as THREE from 'three';
import { TileType } from './types.js';
import  { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';


export function buildDungeon(group, modelMap, dungeonTiles, TILE_SIZE) {

    while (group.children.length) group.remove(group.children[0]);

    const height = dungeonTiles.length;
    const width = dungeonTiles[0]?.length ?? 0;
    if (!width || !height) return;

    const px = width * TILE_SIZE;
    const pz = height * TILE_SIZE;
    const offsetX = -px / 2;
    const offsetZ = -pz / 2;

    const dirtCoords = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = dungeonTiles[y][x];
            if (tile === TileType.DIRT || tile === TileType.PEBBLE_DIRT || tile === TileType.ROCK_DIRT) {
                dirtCoords.push([x, y]); // better than using THREE.Vector2D? 
            } else {
                if (tile === TileType.DOOR) {
                    // Swapped out door model logic for now
                    // See commit: https://github.com/ll-ml/dunGEN.io/commit/defcdfbc231ccf250a93309e5a539d25883fc84d
                    const doorwayModel = modelMap[TileType.FLOOR];
                    const doorWayInst = doorwayModel.clone();

                    doorWayInst.position.set(
                        offsetX + x * TILE_SIZE + TILE_SIZE / 2,
                        0,
                        offsetZ + y * TILE_SIZE + TILE_SIZE / 2
                    )
                    doorWayInst.scale.setScalar(TILE_SIZE);
                    group.add(doorWayInst);
                }
                // this actually allows rocks in with floor underneath not sure if this code is worth having at the moment
                if (tile === TileType.ROCK) {
                    const standardFloor = modelMap[TileType.FLOOR];
                    const standardFloorInst = standardFloor.clone();

                    standardFloorInst.position.set(
                        offsetX + x * TILE_SIZE + TILE_SIZE / 2,
                        0,
                        offsetZ + y * TILE_SIZE + TILE_SIZE / 2
                    );

                    standardFloorInst.scale.setScalar(TILE_SIZE);
                    group.add(standardFloorInst);
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
                group.add(modelInstance);
            
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
        group.add(mesh);
    }
}
