import { DungeonObject } from "./dungeonObject";

export class DungeonEntrance extends DungeonObject {
    constructor(gridX, gridY) {
        super("./public/crypt-small.glb", gridX, gridY, {
            height: 0.0,
            scale: 11, // magic number deal with later

        });

        this.kind = "DungeonEntrance";
        this.id = "Dungeon";
    }
}