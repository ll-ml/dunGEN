const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/**
 * Owns browser input state for first-person controls.
 *
 * Movement and look input are sampled by FirstPersonController. Interaction
 * and attack callbacks are intentionally exposed here so later gameplay
 * systems do not need to bind their own DOM listeners.
 */
export class FirstPersonInput {
  constructor({
    domElement,
    onAttack = null,
    onInteract = null,
    onLockChange = null,
    onLockError = null,
  } = {}) {
    if (!domElement) {
      throw new Error("FirstPersonInput requires a DOM element");
    }

    this.domElement = domElement;
    this.onAttack = onAttack;
    this.onInteract = onInteract;
    this.onLockChange = onLockChange;
    this.onLockError = onLockError;

    this._pressed = new Set();
    this._lookX = 0;
    this._lookY = 0;
    this._lockPending = false;

    this._bind();
  }

  get isLocked() {
    return document.pointerLockElement === this.domElement;
  }

  getMovementAxes(target = { forward: 0, right: 0 }) {
    const forward =
      Number(this._pressed.has("KeyW") || this._pressed.has("ArrowUp")) -
      Number(this._pressed.has("KeyS") || this._pressed.has("ArrowDown"));
    const right =
      Number(this._pressed.has("KeyD") || this._pressed.has("ArrowRight")) -
      Number(this._pressed.has("KeyA") || this._pressed.has("ArrowLeft"));

    target.forward = forward;
    target.right = right;
    return target;
  }

  consumeLookDelta(target) {
    target.set(this._lookX, this._lookY);
    this._lookX = 0;
    this._lookY = 0;
    return target;
  }

  requestLock() {
    if (
      this.isLocked ||
      this._lockPending ||
      !this.domElement.requestPointerLock
    ) return;

    this._lockPending = true;
    try {
      const request = this.domElement.requestPointerLock();
      request?.catch?.((err) => {
        this._lockPending = false;
        console.warn("Unable to acquire pointer lock", err);
        this.onLockError?.(err);
      });
    } catch (err) {
      this._lockPending = false;
      console.warn("Unable to acquire pointer lock", err);
      this.onLockError?.(err);
    }
  }

  releaseLock() {
    this._lockPending = false;
    if (this.isLocked) document.exitPointerLock?.();
  }

  resetTransientState() {
    this._pressed.clear();
    this._lookX = 0;
    this._lookY = 0;
  }

  dispose() {
    const ownsPointerLock = this.isLocked;
    this.domElement.removeEventListener("mousedown", this._onMouseDown);
    this.domElement.removeEventListener("contextmenu", this._onContextMenu);
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    document.removeEventListener("pointerlockerror", this._onPointerLockError);
    window.removeEventListener("blur", this._onBlur);
    this.resetTransientState();
    if (ownsPointerLock) document.exitPointerLock?.();
  }

  _bind() {
    this._onMouseDown = (event) => {
      if (event.button !== 0) return;

      if (!this.isLocked) {
        this.requestLock();
        return;
      }

      this.onAttack?.();
    };

    this._onContextMenu = (event) => event.preventDefault();

    this._onMouseMove = (event) => {
      if (!this.isLocked) return;
      this._lookX += event.movementX;
      this._lookY += event.movementY;
    };

    this._onKeyDown = (event) => {
      if (!this.isLocked) return;

      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this._pressed.add(event.code);
        return;
      }

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        this.onInteract?.();
      }
    };

    this._onKeyUp = (event) => {
      if (MOVEMENT_KEYS.has(event.code)) {
        this._pressed.delete(event.code);
      }
    };

    this._onPointerLockChange = () => {
      this._lockPending = false;
      if (!this.isLocked) {
        this.resetTransientState();
      }
      this.onLockChange?.(this.isLocked);
    };

    this._onPointerLockError = (event) => {
      this._lockPending = false;
      this.onLockError?.(event);
    };

    this._onBlur = () => {
      this.resetTransientState();
    };

    this.domElement.addEventListener("mousedown", this._onMouseDown);
    this.domElement.addEventListener("contextmenu", this._onContextMenu);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    document.addEventListener("pointerlockerror", this._onPointerLockError);
    window.addEventListener("blur", this._onBlur);
  }
}
