import { GridEntity } from "./gridEntity.js";
import { InteractionComponent } from "./components/interactionComponent.js";

export class DungeonEntrance extends GridEntity {
  constructor(gridX, gridY, {
    modelPath = "./public/crypt-small.glb",
    height = 0,
    scale = 11,
    colormap = null,
    id = "Dungeon",
    label = null,
    rangeTiles = 2,
    destination = "dungeon",
  } = {}) {
    super(modelPath, gridX, gridY, {
      height,
      scale,
      colormap,
      kind: "DungeonEntrance",
      id,
    });

    this.destination = destination;
    this.addComponent(new InteractionComponent({
      id: destination === "overworld" ? "exit-dungeon" : "enter-dungeon",
      label: label ?? (
        destination === "overworld" ? "Return to overworld" : "Enter dungeon"
      ),
      rangeTiles,
      execute: ({ game, entity }) => (
        entity.destination === "overworld"
          ? game?.exitDungeon?.({ entrance: entity })
          : game?.enterDungeon?.({ entrance: entity })
      ),
    }));
  }

  setDestination(destination, label = null) {
    this.destination = destination;
    this.interaction.id = destination === "overworld"
      ? "exit-dungeon"
      : "enter-dungeon";
    this.interaction.label = label ?? (
      destination === "overworld" ? "Return to overworld" : "Enter dungeon"
    );
    return this;
  }
}
