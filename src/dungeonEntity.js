import { Entity } from "./entity.js";
import { ModelComponent } from "./components/modelComponent.js";
import { GridPlacement } from "./components/gridPlacement.js";

export class DungeonEntity extends Entity {
  constructor(modelPath, gridX, gridY, opts = {}) {
    super(gridX, gridY, { kind: opts.kind, id: opts.id });

    this.modelPath = modelPath;
    this.height = opts.height ?? 0;
    this.scale = opts.scale ?? 11;
    this.colormap = opts.colormap ?? null;

    this.modelComponent = this.addComponent(
      new ModelComponent(this.modelPath, {
        scale: this.scale,
        colormap: this.colormap,
      })
    );
    this.placement = this.addComponent(new GridPlacement());

    this._loadPromise = this.modelComponent.load();
  }
}
