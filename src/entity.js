import * as THREE from "three";

export class Entity {
  constructor(gridX, gridY, { kind = null, id = null } = {}) {
    const defaultKind = this.constructor?.name ?? "Entity";

    this.kind = kind ?? defaultKind;
    this.id = id ?? this.kind;
    this.coords = new THREE.Vector2(gridX, gridY);

    this.model = null;
    this.interaction = null;

    this._components = [];
  }

  addComponent(component) {
    component.attach?.(this);
    this._components.push(component);
    return component;
  }

  addTo(parent, map) {
    const adds = this._components
      .filter((component) => typeof component.addTo === "function")
      .map((component) => component.addTo(parent));

    return Promise.all(adds).then(() => {
      if (map) this.updatePosition(map);
      return this.model;
    });
  }

  updatePosition(map) {
    for (const component of this._components) {
      component.updatePosition?.(map);
    }
  }

  updateVisual(deltaSeconds) {
    for (const component of this._components) {
      component.updateVisual?.(deltaSeconds);
    }
  }

  cancelVisuals() {
    for (const component of this._components) {
      component.cancel?.();
    }
  }
}
