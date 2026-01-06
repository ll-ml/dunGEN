import * as THREE from "three";

export class InputController {
  constructor({ domElement, camera, getActiveMap, onActionSelected, ui }) {
    this.domElement = domElement;
    this.camera = camera;
    this.getActiveMap = getActiveMap;
    this.onActionSelected = onActionSelected;
    this.ui = ui;

    if (typeof this.getActiveMap !== "function") {
      throw new Error("InputController: getActiveMap must be a function");
    }

    this.raycaster = new THREE.Raycaster();
    this.mouseNDC = new THREE.Vector2();

    this._bind();
  }

  _bind() {
    this.domElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._onContextMenu(e);
    });
  }

  _setMouseNDCFromEvent(e) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  _onContextMenu(e) {
    const map = this.getActiveMap();
    if (!map) return;

    if (this.ui?.isUIEvent?.(e)) return;

    this._setMouseNDCFromEvent(e);
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    const worldPt = map.pickWorldPoint(this.raycaster);
    if (!worldPt) return;

    const grid = map.worldToGrid(worldPt);
    if (!grid) return;

    const hitEntity = map.pickEntity(this.raycaster);

    const actions = map.getActionsAt({
      gridX: grid.x,
      gridY: grid.y,
      worldPt,
      entity: hitEntity,
    });

    if (!actions || actions.length === 0) return;

    this.ui.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      actions,
      onSelect: (action) => this.onActionSelected(action),
    });
  }
}
