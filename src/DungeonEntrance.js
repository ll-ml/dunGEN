import { DungeonEntity } from "./dungeonEntity.js";

export class DungeonEntrance extends DungeonEntity {
    constructor(gridX, gridY) {
        super("./public/crypt-small.glb", gridX, gridY, {
            height: 0.0,
            scale: 11, // magic number deal with later

        });

        this.kind = "DungeonEntrance";
        this.id = "Dungeon";
    }
}
