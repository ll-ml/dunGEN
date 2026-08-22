const MenuMode = Object.freeze({
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  INVENTORY: "inventory",
  BLOCKED: "blocked",
  STOPPED: "stopped",
});

const DEFAULT_SENSITIVITY_MULTIPLIER = 1.5;
const SENSITIVITY_STORAGE_KEY = "dungen.mouseSensitivityMultiplier";

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase?.();
  return (
    target?.isContentEditable === true ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

/**
 * Owns first-person overlay state and its pointer-lock lifecycle.
 *
 * Game owns the settings' effects; this controller only coordinates the DOM,
 * menu shortcuts, pausing, and the transition back into pointer-locked play.
 */
export class GameMenuController {
  constructor({
    input,
    onInventoryOpen = null,
    onGameplayEntered = null,
    onSensitivityChange = null,
    documentRef = globalThis.document,
    storage,
  } = {}) {
    if (!input || !documentRef) {
      throw new Error("GameMenuController requires input and a document");
    }

    this.input = input;
    this.document = documentRef;
    this.onInventoryOpen = onInventoryOpen;
    this.onGameplayEntered = onGameplayEntered;
    this.onSensitivityChange = onSensitivityChange;
    this.storage = storage ?? this._getDefaultStorage();

    this.pauseModal = this._requireElement("pauseModal");
    this.inventoryModal = this._requireElement("inventoryModal");
    this.resumeButton = this._requireElement("resumeGame");
    this.inventoryClose = this._requireElement("inventoryClose");
    this.openInventoryButton = this._requireElement("openInventoryFromPause");
    this.sensitivityInput = this._requireElement("mouseSensitivity");
    this.sensitivityValue = this._requireElement("mouseSensitivityValue");
    this.crosshair = this._requireElement("crosshair");
    this.controlHint = this._requireElement("controlHint");
    this.contextMenu = this.document.getElementById("ctxMenu");

    this.mode = MenuMode.READY;
    this._inventoryReturnMode = MenuMode.READY;
    this._blockingReturnMode = MenuMode.READY;
    this._blockingPausesSimulation = true;
    this._blockingOnCancel = null;
    this._blockingOwner = null;
    this._resumeRequested = false;
    this._disposed = false;

    this._onKeyDown = (event) => this._handleKeyDown(event);
    this._onPointerLockChange = () => {
      this.handlePointerLockChange(this.input.isLocked);
    };
    this._onVisibilityChange = () => {
      if (this.document.hidden && this.input.isLocked) {
        this.input.releaseLock?.();
      }
    };
    this._onResume = () => this.requestResume();
    this._onInventoryClose = () => this.closeInventory();
    this._onOpenInventory = () => this.openInventory();
    this._onSensitivityInput = () => {
      this._applySensitivity(this.sensitivityInput.value, true);
    };

    this.document.addEventListener("keydown", this._onKeyDown);
    this.document.addEventListener("pointerlockchange", this._onPointerLockChange);
    this.document.addEventListener("visibilitychange", this._onVisibilityChange);
    this.resumeButton.addEventListener("click", this._onResume);
    this.inventoryClose.addEventListener("click", this._onInventoryClose);
    this.openInventoryButton.addEventListener("click", this._onOpenInventory);
    this.sensitivityInput.addEventListener("input", this._onSensitivityInput);

    const storedSensitivity = this._loadSensitivityMultiplier();
    this._applySensitivity(storedSensitivity, false);
    this._render();
  }

  get isSimulationPaused() {
    if (this.mode === MenuMode.PLAYING) return false;
    if (this.mode === MenuMode.BLOCKED) {
      return this._blockingPausesSimulation;
    }
    return true;
  }

  get activeMenu() {
    if (this.mode === MenuMode.PAUSED) return "pause";
    if (this.mode === MenuMode.INVENTORY) return "inventory";
    return null;
  }

  handlePointerLockChange(locked) {
    if (this._disposed || this.mode === MenuMode.STOPPED) return;

    if (locked) {
      if (this.mode === MenuMode.PLAYING) {
        this._render();
        return;
      }

      const acceptsInitialLock = this.mode === MenuMode.READY;
      const acceptsRequestedResume =
        this._resumeRequested &&
        (this.mode === MenuMode.PAUSED ||
          (this.mode === MenuMode.INVENTORY &&
            this._inventoryReturnMode === MenuMode.PLAYING) ||
          (this.mode === MenuMode.BLOCKED &&
            this._blockingReturnMode === MenuMode.PLAYING));

      if (!acceptsInitialLock && !acceptsRequestedResume) {
        this._resumeRequested = false;
        this.input.releaseLock?.();
        return;
      }

      this._resumeRequested = false;
      this._blockingOnCancel = null;
      this._blockingOwner = null;
      this._setMode(MenuMode.PLAYING);
      this.onGameplayEntered?.();
      return;
    }

    if (this.mode === MenuMode.PLAYING) {
      this._setMode(MenuMode.PAUSED);
      return;
    }

    this._render();
  }

  openInventory() {
    if (this._disposed || this.mode === MenuMode.BLOCKED) return;

    this._resumeRequested = false;

    this._inventoryReturnMode =
      this.mode === MenuMode.PLAYING
        ? MenuMode.PLAYING
        : this.mode === MenuMode.READY
          ? MenuMode.READY
          : MenuMode.PAUSED;

    this.onInventoryOpen?.();
    this._setMode(MenuMode.INVENTORY);

    // Set INVENTORY first so its intentional unlock cannot be mistaken for
    // the native Escape gesture and replaced with the pause menu.
    if (this.input.isLocked) this.input.releaseLock?.();
  }

  closeInventory() {
    if (this.mode !== MenuMode.INVENTORY) return;

    if (this._inventoryReturnMode === MenuMode.PLAYING) {
      this.requestResume();
      return;
    }

    this._setMode(this._inventoryReturnMode);
  }

  openPause() {
    if (this._disposed || this.mode === MenuMode.BLOCKED) return;
    this._resumeRequested = false;
    this._setMode(MenuMode.PAUSED);
    if (this.input.isLocked) this.input.releaseLock?.();
  }

  requestResume() {
    if (this._disposed || this.mode === MenuMode.BLOCKED) return;
    const canResume =
      this.mode === MenuMode.PAUSED ||
      (this.mode === MenuMode.INVENTORY &&
        this._inventoryReturnMode === MenuMode.PLAYING);
    if (!canResume) return;

    this._resumeRequested = true;
    // The overlay remains visible and simulation remains paused until the
    // browser confirms pointer lock through pointerlockchange.
    this.input.requestLock?.();
  }

  openBlockingOverlay({
    owner = null,
    pauseSimulation = true,
    onCancel = null,
  } = {}) {
    if (this._disposed || this.mode === MenuMode.BLOCKED) return false;
    this._resumeRequested = false;
    this._blockingReturnMode =
      this.mode === MenuMode.READY
        ? MenuMode.READY
        : this.mode === MenuMode.INVENTORY
          ? MenuMode.INVENTORY
          : this.mode === MenuMode.PLAYING
            ? MenuMode.PLAYING
            : MenuMode.PAUSED;
    this._blockingPausesSimulation = Boolean(pauseSimulation);
    this._blockingOnCancel =
      typeof onCancel === "function" ? onCancel : null;
    this._blockingOwner = owner;
    this._setMode(MenuMode.BLOCKED);
    if (this.input.isLocked) this.input.releaseLock?.();
    return true;
  }

  closeBlockingOverlay({
    owner = null,
    resumeGameplay = true,
    force = false,
  } = {}) {
    if (this.mode !== MenuMode.BLOCKED) return false;
    if (!force && owner !== this._blockingOwner) return false;

    if (
      resumeGameplay &&
      this._blockingReturnMode === MenuMode.PLAYING
    ) {
      this._resumeRequested = true;
      this._blockingOnCancel = null;
      // Keep the neutral BLOCKED mode until pointer lock is confirmed. This
      // prevents the native unlock event from briefly opening Pause.
      this.input.requestLock?.();
      return true;
    }

    this._resumeRequested = false;
    this._blockingOnCancel = null;
    this._blockingOwner = null;
    this._setMode(
      this._blockingReturnMode === MenuMode.PLAYING
        ? MenuMode.PAUSED
        : this._blockingReturnMode
    );
    return true;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    this.document.removeEventListener("keydown", this._onKeyDown);
    this.document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    this.document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this.resumeButton.removeEventListener("click", this._onResume);
    this.inventoryClose.removeEventListener("click", this._onInventoryClose);
    this.openInventoryButton.removeEventListener("click", this._onOpenInventory);
    this.sensitivityInput.removeEventListener("input", this._onSensitivityInput);

    this.mode = MenuMode.STOPPED;
    this._blockingOwner = null;
    this._blockingOnCancel = null;
    this._hideContextMenu();
    this._render();
  }

  _handleKeyDown(event) {
    if (this._disposed || event.repeat) return;

    if (
      event.code === "Escape" &&
      !this.input.isLocked &&
      this.mode === MenuMode.BLOCKED
    ) {
      if (this._resumeRequested) {
        event.preventDefault();
        this.closeBlockingOverlay({
          owner: this._blockingOwner,
          resumeGameplay: false,
        });
      } else if (this._blockingOnCancel) {
        event.preventDefault();
        this._blockingOnCancel();
      }
      return;
    }

    if (event.code === "KeyI") {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (this.mode === MenuMode.INVENTORY) {
        this.closeInventory();
      } else {
        this.openInventory();
      }
      return;
    }

    if (event.code !== "Escape" || this.input.isLocked) return;

    if (this.mode === MenuMode.INVENTORY || this.mode === MenuMode.READY) {
      event.preventDefault();
      this.openPause();
      return;
    }

    if (this.mode === MenuMode.PAUSED && this._resumeRequested) {
      event.preventDefault();
      this._resumeRequested = false;
    }
  }

  handlePointerLockError() {
    const failedGameplayOverlayResume =
      this.mode === MenuMode.BLOCKED &&
      this._resumeRequested &&
      this._blockingReturnMode === MenuMode.PLAYING;
    this._resumeRequested = false;
    if (failedGameplayOverlayResume) {
      this._blockingOnCancel = null;
      this._blockingOwner = null;
      this._setMode(MenuMode.PAUSED);
      return;
    }
    this._render();
  }

  _setMode(mode) {
    if (this.mode === mode) {
      this._render();
      return;
    }
    this.mode = mode;
    this._hideContextMenu();
    this._render();
  }

  _render() {
    const showPause = this.mode === MenuMode.PAUSED;
    const showInventory = this.mode === MenuMode.INVENTORY;
    const isPlaying = this.mode === MenuMode.PLAYING && this.input.isLocked;
    const showHint = this.mode === MenuMode.READY && !this.input.isLocked;

    this.pauseModal.classList.toggle("hidden", !showPause);
    this.pauseModal.setAttribute("aria-hidden", String(!showPause));
    this.inventoryModal.classList.toggle("hidden", !showInventory);
    this.inventoryModal.setAttribute("aria-hidden", String(!showInventory));
    this.crosshair.classList.toggle("active", isPlaying);
    this.controlHint.classList.toggle("hidden", !showHint);

    if (!showPause && !showInventory) {
      const activeElement = this.document.activeElement;
      if (
        this.pauseModal.contains?.(activeElement) ||
        this.inventoryModal.contains?.(activeElement)
      ) {
        activeElement.blur?.();
      }
    }

    if (showPause) this.resumeButton.focus?.();
    if (showInventory) this.inventoryClose.focus?.();
  }

  _applySensitivity(rawValue, persist) {
    const min = Number.parseFloat(this.sensitivityInput.min) || 0.25;
    const max = Number.parseFloat(this.sensitivityInput.max) || 5;
    const parsed = Number.parseFloat(rawValue);
    const multiplier = Math.min(
      max,
      Math.max(min, Number.isFinite(parsed) ? parsed : DEFAULT_SENSITIVITY_MULTIPLIER)
    );

    this.sensitivityInput.value = multiplier.toString();
    this.sensitivityValue.textContent = `${multiplier.toFixed(2)}\u00d7`;
    this.onSensitivityChange?.(multiplier);

    if (persist) {
      try {
        this.storage?.setItem(SENSITIVITY_STORAGE_KEY, multiplier.toString());
      } catch {
        // Settings still work for this session when storage is unavailable.
      }
    }
  }

  _loadSensitivityMultiplier() {
    try {
      return this.storage?.getItem(SENSITIVITY_STORAGE_KEY) ??
        DEFAULT_SENSITIVITY_MULTIPLIER;
    } catch {
      return DEFAULT_SENSITIVITY_MULTIPLIER;
    }
  }

  _getDefaultStorage() {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  _hideContextMenu() {
    if (this.contextMenu) this.contextMenu.style.display = "none";
  }

  _requireElement(id) {
    const element = this.document.getElementById(id);
    if (!element) throw new Error(`Missing menu element #${id}`);
    return element;
  }
}

export { MenuMode };
