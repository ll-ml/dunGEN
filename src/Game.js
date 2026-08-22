import * as THREE from "three";
import { Overworld } from "./overworld/overworld.js";
import { buildOverworld } from "./overworld/renderOverworld.js";
import { FrameCounter } from "./fpsCounter.js";
import { FirstPersonInput } from "./controllers/firstPersonInput.js";
import { FirstPersonController } from "./controllers/firstPersonController.js";
import { FirstPersonInteractionController } from "./controllers/firstPersonInteractionController.js";
import { InteractionTargetResolver } from "./controllers/interactionTargetResolver.js";
import { GameMenuController } from "./controllers/gameMenuController.js";
import { TickManager } from "./tickManager.js";
import { Dungeon } from "./dungeon.js";
import { buildDungeon } from "./render.js";
import { Player } from "./player.js";
import { WeatherSystem } from "./weather.js";
import { renderInventory, setupInventoryContext } from "./inventory.js";
import { initDamageDisplay } from "./damageDisplay.js";
import { TileId } from "./overworld/wfc.js";
import { CombatManager } from "./combat.js";
import { findNearestWalkable } from "./gridNavigation.js";
import { clearLegacyCombatState } from "./legacyCombatState.js";
import { StatusBar } from "./statusBar.js";
import { FirstPersonHandsViewModel } from "./viewmodels/firstPersonHandsViewModel.js";

const OverlayOwner = Object.freeze({
  NPC: "npc-dialog",
  STORAGE: "storage-dialog",
  CHANGELOG: "changelog-dialog",
  DEATH: "death-dialog",
});

class MapTransitionCancelledError extends Error {
  constructor() {
    super("Map transition cancelled");
    this.name = "MapTransitionCancelledError";
  }
}

export class Game {
  constructor({ tileSize = 11, worldW = 150, worldH = 100 } = {}) {
    this.TILE_SIZE = tileSize;
    this.WORLD_W = worldW;
    this.WORLD_H = worldH;

    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.input = null;
    this.playerController = null;
    this.interactionTargetResolver = null;
    this.interactionController = null;
    this.menuController = null;
    this.handsViewModel = null;
    this.player = null;
    this.playerSpawn = new THREE.Vector2(this.WORLD_W / 2, this.WORLD_H / 2);

    this.currentMap = null;
    this.currentMapGroup = null;

    this._running = false;
    this._lastTime = 0;
    this._onResize = null;
    this._isMapTransitioning = false;
    this._mapTransitionPromise = null;
    this._mapTransitionKind = null;
    this._lifecycleGeneration = 0;
    this._stopped = false;
    this._hasEnteredGameplay = false;

    this._frameCounter = null;
    this.status = null;

    this.ui = null;
    this._overworldRenderHandle = null;
    this._overworldModelMap = null;
    this._overworldMap = null;
    this._overworldGroup = null;
    this._overworldReturnState = null;

    this.weather = null;
    this._weatherEnabled = true;
    this._weatherMode = "rain";
    this._weatherIntensity = 4.0;
    this.tickManager = new TickManager(600);

    this.combatMgr = new CombatManager();
    this.combatMgr.onDeath = ({ winner, loser }) => {
      if (loser?.owner === this.player) {
        this._handlePlayerDeath();
        return;
      }
      console.log(`ENEMY ${loser} was slain by ${winner}`);
    };

    this._storageModal = null;
    this._storageSlots = null;
    this._storageClose = null;
    this._activeStorage = null;
    this._activeStorageMap = null;
    this._inventoryBound = false;
    this._disposeInventoryContext = null;
    this._deathModal = null;
    this._newCharBtn = null;
    this._npcModal = null;
    this._npcText = null;
    this._npcOptions = null;
    this._npcClose = null;
    this._activeNpc = null;

    this._changelogModal = null;
    this._openChangelog = null;
    this._changelogClose = null;

    this._overworldEditorBound = false;
    this._weatherControlsBound = false;
  }

  async start() {
    this._stopped = false;
    this._hasEnteredGameplay = false;
    this._lifecycleGeneration++;
    this._initThree();
    this._initLights();
    this._initResizeHandler();
    this.status = new StatusBar();
    this.ui = {
      addStatus: (msg) => this._addStatus(msg),
      openStorageModal: (storage, map) => this._openStorageModal(storage, map),
      renderInventory: (inv) => renderInventory(inv),
      setHealth: (hp) => this._setHealth(hp),
      openNpcDialog: (npc) => this._openNpcDialog(npc),
    };

    this._bindStorageModal();
    this._bindDeathModal();
    this._bindNpcModal();
    this._bindChangelogModal();
    this._bindWeatherControls();

    this.weather = new WeatherSystem({
      areaSize: 800,
      height: 260,
      intensity: this._weatherIntensity,
      mode: "none",
    });
    this.weather.addTo(this.scene);

    this._frameCounter = new FrameCounter({
      parent: document.getElementById("fpsMount") ?? document.body,
      position: "static",
    });

    await this.loadOverworld();

    this.input = new FirstPersonInput({
      domElement: this.renderer.domElement,
      onInteract: () => this.interactionController?.interact(),
      onLockChange: (locked) => this._handleInputLockChange(locked),
      onLockError: () => this.menuController?.handlePointerLockError(),
    });
    this.playerController = new FirstPersonController({
      camera: this.camera,
      input: this.input,
      getPlayer: () => this.player,
      getMap: () => this.currentMap,
    });
    this.menuController = new GameMenuController({
      input: this.input,
      onGameplayEntered: () => this._markGameplayEntered(),
      onInventoryOpen: () => {
        this.ui.renderInventory(this.player.inventory);
        this._setHealth(this.player.combat.hp);
        this.player.skills?.updateUI?.();
      },
      onSensitivityChange: (multiplier) => {
        this.playerController.setLookSensitivityMultiplier(multiplier);
      },
    });
    this.interactionTargetResolver = new InteractionTargetResolver({
      camera: this.camera,
      getMap: () => this.currentMap,
      getRoot: () => this.currentMapGroup,
      getPlayer: () => this.player,
      maxRangeTiles: 2,
    });
    this.interactionController = new FirstPersonInteractionController({
      resolver: this.interactionTargetResolver,
      getGame: () => this,
      isEnabled: () =>
        Boolean(
          this.input?.isLocked &&
          !this.menuController?.isSimulationPaused &&
          !this._isMapTransitioning,
        ),
      promptElement: document.getElementById("interactionPrompt"),
      crosshairElement: document.getElementById("crosshair"),
    });
    this.handsViewModel = new FirstPersonHandsViewModel({
      aspect: this.camera.aspect,
    });
    this.playerController.syncFromPlayer();

    this.tickManager.onTick((tickSeconds) => {
      this.currentMap?.updateTick?.(this, tickSeconds);
    });

    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x98c6ff);

    // this will need to be its own object pretty sure at some point
    const { width, height } = this._getViewportSize();
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

    this._resizeRendererToDisplaySize();

    const worldRadius = 50; // kind of a magic number but it works great for what we're trying to achive

    this.scene.fog = new THREE.Fog(
      0xa8c6ff,
      worldRadius * 1.2,
      worldRadius * 4,
    );

    initDamageDisplay(this.renderer, this.camera);
  }

  _initLights() {
    const mainDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainDirectionalLight.position.set(0, 100, 50);
    mainDirectionalLight.target.position.set(0, 0, 0);
    mainDirectionalLight.castShadow = true;
    this.scene.add(mainDirectionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
  }

  _initResizeHandler() {
    this._onResize = () => {
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this._resizeRendererToDisplaySize();
    };
    window.addEventListener("resize", this._onResize);
  }

  _getViewportSize() {
    const width = document.documentElement?.clientWidth ?? window.innerWidth;
    const height = document.documentElement?.clientHeight ?? window.innerHeight;
    return { width, height };
  }

  _resizeRendererToDisplaySize() {
    if (!this.renderer || !this.camera) return;
    const { width, height } = this._getViewportSize();
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.handsViewModel?.resize(width, height);
  }

  async loadOverworld() {
    const overwolrd = new Overworld(this.WORLD_W, this.WORLD_H, {
      tileSize: this.TILE_SIZE,
      status: this.status,
    });

    const modelMap = await overwolrd.loadModelMap();
    this._overworldModelMap = modelMap;

    const group = new THREE.Group();
    const renderHandle = buildOverworld(
      group,
      modelMap,
      overwolrd.denseMatrix,
      this.TILE_SIZE,
    );
    this._overworldRenderHandle = renderHandle;
    this._overworldMap = overwolrd;
    this._overworldGroup = group;

    this.setMap(overwolrd, group);

    if (!this.player) {
      const spawn = findNearestWalkable(
        overwolrd,
        this.playerSpawn.x,
        this.playerSpawn.y,
      );
      if (!spawn) throw new Error("Overworld has no walkable player spawn");

      this.playerSpawn.set(spawn.x, spawn.y);
      this.player = new Player(spawn.x, spawn.y);
    }
    await this.player.addTo(this.currentMapGroup, this.currentMap);

    this._wireInventoryUI();
    this.ui.renderInventory(this.player.inventory);
    this._setHealth(this.player.combat.hp);
    this._bindOverworldEditor();

    this.currentMap.spawnDungeonEntrances?.({ count: 6, minSpacing: 10 });
    this.currentMap.spawnNPCs?.({ count: 1 });

    for (const ent of this.currentMap.entities) {
      await ent.addTo(this.currentMapGroup, this.currentMap);
    }
  }

  setMap(map, group) {
    this._cancelInteractionAnimations(this.currentMap);
    this.interactionController?.clearTarget();
    clearLegacyCombatState(this.combatMgr, this.currentMap?.entities);
    if (this.currentMapGroup) {
      this.scene.remove(this.currentMapGroup);
    }

    this.currentMap = map;
    this.currentMapGroup = group;
    this.scene.add(group);
    this._updateOverworldEditorAvailability();

    this._applyEnvironmentFromMap(map);

    if (this.weather) {
      const allowWeather = this._weatherEnabled && !map?.isDungeon;
      this.weather.setIntensity(map?.isDungeon ? 0.0 : this._weatherIntensity);
      this.weather.setMode(allowWeather ? this._weatherMode : "none");
    }
  }

  _applyEnvironmentFromMap(map) {
    const env = map?.env ?? {};

    if (env.background != null) {
      this.scene.background = new THREE.Color(env.background);
    } else {
      this.scene.background = null; // this needs a default value rather than none
    }

    if (env.fog && env.fog.color != null) {
      this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    } else {
      this.scene.fog = null;
    }
  }

  enterDungeon(options = {}) {
    if (this._stopped) return Promise.resolve(false);
    if (this._mapTransitionPromise) {
      return this._mapTransitionKind === "enter-dungeon"
        ? this._mapTransitionPromise
        : Promise.resolve(false);
    }
    if (this._isMapTransitioning) return Promise.resolve(false);

    this._mapTransitionKind = "enter-dungeon";
    this._mapTransitionPromise = this._enterDungeon(options).finally(() => {
      this._mapTransitionPromise = null;
      this._mapTransitionKind = null;
    });
    return this._mapTransitionPromise;
  }

  exitDungeon(options = {}) {
    if (this._stopped) return Promise.resolve(false);
    if (this._mapTransitionPromise) {
      return this._mapTransitionKind === "exit-dungeon"
        ? this._mapTransitionPromise
        : Promise.resolve(false);
    }
    if (this._isMapTransitioning) return Promise.resolve(false);

    this._mapTransitionKind = "exit-dungeon";
    this._mapTransitionPromise = this._exitDungeon(options).finally(() => {
      this._mapTransitionPromise = null;
      this._mapTransitionKind = null;
    });
    return this._mapTransitionPromise;
  }

  async _enterDungeon({ width = 40, height = 30 } = {}) {
    const assertActive = this._makeMapTransitionGuard();
    this._dismissTransientDialogs();
    const previousMap = this.currentMap;
    const previousGroup = this.currentMapGroup;
    const previousCoords = this.player.coords.clone();
    const previousPosition = this.player.model?.position.clone() ?? null;
    const previousParent = this.player.model?.parent ?? null;
    let dungeon = null;

    if (!previousMap?.isDungeon && previousMap && previousGroup) {
      this._overworldMap = previousMap;
      this._overworldGroup = previousGroup;
      this._overworldReturnState = {
        coords: previousCoords.clone(),
        position: previousPosition?.clone() ?? null,
      };
    }

    this._isMapTransitioning = true;
    this._cancelInteractionAnimations(previousMap);

    try {
      assertActive();
      this._updateOverworldEditorAvailability();
      this.input?.resetTransientState?.();
      if (!this.interactionController?.isBusy) {
        this.interactionController?.clearTarget();
      }
      dungeon = new Dungeon(width, height, {
        tileSize: this.TILE_SIZE,
        status: this.status,
      });
      await dungeon.generateDungeon();
      assertActive();

      const modelMap = await dungeon.loadModelMap();
      assertActive();
      const group = new THREE.Group();
      buildDungeon(group, modelMap, dungeon.denseMatrix, dungeon.tileSize);

      // Build the new map completely off-scene. The live map changes only
      // after every entity is ready, so ticks and rendering never observe
      // a partially populated dungeon.
      for (const entity of dungeon.entities) {
        await entity.addTo(group, dungeon);
        assertActive();
      }

      dungeon.placePlayer(this.player);
      await this.player.addTo(group, dungeon);
      assertActive();
      this.setMap(dungeon, group);
      this.playerController?.syncFromPlayer();
      return dungeon;
    } catch (error) {
      if (this.currentMap === dungeon && previousMap && previousGroup) {
        this.setMap(previousMap, previousGroup);
      }
      this.player.coords.copy(previousCoords);
      if (this.player.model) {
        if (previousParent && this.player.model.parent !== previousParent) {
          previousParent.add(this.player.model);
        }
        if (previousPosition) this.player.model.position.copy(previousPosition);
      }
      if (error instanceof MapTransitionCancelledError) return false;
      this.playerController?.syncFromPlayer();
      throw error;
    } finally {
      this.input?.resetTransientState?.();
      this._isMapTransitioning = false;
      this._updateOverworldEditorAvailability();
    }
  }

  async _exitDungeon() {
    const assertActive = this._makeMapTransitionGuard();
    if (
      !this.currentMap?.isDungeon ||
      !this._overworldMap ||
      !this._overworldGroup ||
      !this.player
    )
      return false;

    this._dismissTransientDialogs();
    const dungeonMap = this.currentMap;
    const dungeonGroup = this.currentMapGroup;
    const previousCoords = this.player.coords.clone();
    const previousPosition = this.player.model?.position.clone() ?? null;
    const previousParent = this.player.model?.parent ?? null;
    const targetMap = this._overworldMap;
    const targetGroup = this._overworldGroup;

    this._isMapTransitioning = true;
    this._cancelInteractionAnimations(dungeonMap);
    try {
      assertActive();
      this._updateOverworldEditorAvailability();
      this.input?.resetTransientState?.();

      const requestedCoords =
        this._overworldReturnState?.coords ?? this.playerSpawn;
      const safeCoords = findNearestWalkable(
        targetMap,
        requestedCoords.x,
        requestedCoords.y,
      );
      if (!safeCoords) {
        throw new Error("The overworld has no walkable return tile");
      }

      this.player.coords.set(safeCoords.x, safeCoords.y);
      await this.player.addTo(targetGroup, targetMap);
      assertActive();

      const savedCoords = this._overworldReturnState?.coords;
      const savedPosition = this._overworldReturnState?.position;
      if (
        savedPosition &&
        savedCoords &&
        savedCoords.x === safeCoords.x &&
        savedCoords.y === safeCoords.y
      ) {
        this.player.model.position.copy(savedPosition);
      }

      this.setMap(targetMap, targetGroup);
      this.playerController?.syncFromPlayer();
      this._addStatus("Returned to the overworld.");
      return targetMap;
    } catch (error) {
      if (this.currentMap !== dungeonMap && dungeonMap && dungeonGroup) {
        this.setMap(dungeonMap, dungeonGroup);
      }
      this.player.coords.copy(previousCoords);
      if (this.player.model) {
        if (previousParent && this.player.model.parent !== previousParent) {
          previousParent.add(this.player.model);
        }
        if (previousPosition) {
          this.player.model.position.copy(previousPosition);
        }
      }
      if (error instanceof MapTransitionCancelledError) return false;
      this.playerController?.syncFromPlayer();
      throw error;
    } finally {
      this.input?.resetTransientState?.();
      this._isMapTransitioning = false;
      this._updateOverworldEditorAvailability();
    }
  }

  _loop = (now) => {
    if (!this._running) return;

    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    const simulationPaused =
      this.menuController?.isSimulationPaused || this._isMapTransitioning;
    let playerMoved = false;
    const entities = this.currentMap?.entities ?? [];

    for (const entity of entities) {
      entity.updateVisual?.(dt);
    }

    if (!simulationPaused) {
      playerMoved = this.playerController?.update(dt) ?? false;
      this.tickManager.update(dt * 1000);

      if (this.player?.mixer) {
        this.player.mixer.update(dt);
      }

      for (const ent of entities) {
        if (ent === this.player) continue;
        if (ent?.mixer) ent.mixer.update(dt);
        if (typeof ent.updateMovement === "function") {
          ent.updateMovement(dt, this.currentMap);
        }
      }

      if (
        !this.currentMap?.isDungeon &&
        this._overworldRenderHandle?.waterMaterial
      ) {
        this._overworldRenderHandle.waterMaterial.uniforms.uTime.value += dt;
      }

      if (
        this.weather &&
        this._weatherEnabled &&
        this.weather.mode !== "none"
      ) {
        const anchor = this.player?.model?.position ?? this.camera?.position;
        this.weather.update(dt, anchor);
      }

      this.interactionController?.update(dt);
    }

    const showHands = this._updateHandsVisibility();
    this.handsViewModel?.update(dt, playerMoved, showHands);

    this._frameCounter.update();
    //requestAnimationFrame(this._loop);
    this.renderer.render(this.scene, this.camera);
    this.handsViewModel?.render(this.renderer);
    requestAnimationFrame(this._loop);
  };

  stop() {
    this._running = false;
    this._stopped = true;
    this._lifecycleGeneration++;
    this._cancelInteractionAnimations();
    this._dismissTransientDialogs();
    this.interactionController?.dispose?.();
    this.handsViewModel?.dispose?.();
    this.handsViewModel = null;
    this.menuController?.dispose?.();
    this.input?.dispose?.();
    this._disposeInventoryContext?.();
    this._disposeInventoryContext = null;
    this._inventoryBound = false;
    this._frameCounter?.dispose?.();
    this.status?.dispose?.();
    this.status = null;
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
  }

  _cancelEntityVisuals(map = this.currentMap) {
    for (const entity of map?.entities ?? []) {
      entity.cancelVisuals?.();
    }
  }

  _cancelInteractionAnimations(map = this.currentMap) {
    this._cancelEntityVisuals(map);
    this.handsViewModel?.cancelAction?.();
  }

  playHandReach(options = {}) {
    try {
      const animation = this.handsViewModel?.playReach?.(options);
      if (!animation) return Promise.resolve(true);
      return Promise.resolve(animation).catch((error) => {
        console.error("First-person hand animation failed", error);
        return true;
      });
    } catch (error) {
      console.error("First-person hand animation failed", error);
      return Promise.resolve(true);
    }
  }

  _shouldShowHands() {
    return Boolean(
      this._hasEnteredGameplay &&
      this.player &&
      !this.player.isDead &&
      !this._isMapTransitioning &&
      !this._stopped,
    );
  }

  _handleInputLockChange(locked) {
    if (locked) return;
    this._cancelInteractionAnimations();
    this.playerController?.resetLookSmoothing();
    this.interactionController?.clearTarget();
  }

  _markGameplayEntered() {
    this._hasEnteredGameplay = true;
  }

  _updateHandsVisibility() {
    return this._shouldShowHands();
  }

  _makeMapTransitionGuard() {
    const generation = this._lifecycleGeneration;
    return () => {
      if (this._stopped || this._lifecycleGeneration !== generation) {
        throw new MapTransitionCancelledError();
      }
    };
  }

  canCompleteWorldInteraction(entity, ownerMap = this.currentMap) {
    if (
      !entity ||
      !ownerMap ||
      ownerMap !== this.currentMap ||
      !ownerMap.entities?.includes?.(entity) ||
      this._stopped ||
      this._isMapTransitioning ||
      this.player?.isDead
    )
      return false;

    if (this.input && !this.input.isLocked) return false;
    if (this.menuController?.isSimulationPaused) return false;

    const resolved = this.interactionTargetResolver?.resolve?.({
      game: this,
      map: ownerMap,
      player: this.player,
    });
    return !this.interactionTargetResolver || resolved?.entity === entity;
  }

  _setHealth(hp) {
    const hpEl = document.getElementById("hp");
    const maxHpEl = document.getElementById("maxHp");
    if (hpEl) hpEl.textContent = Math.max(0, Math.floor(hp)).toString();
    if (maxHpEl && this.player?.maxHealth != null) {
      maxHpEl.textContent = this.player.maxHealth.toString();
    }
  }

  _addStatus(message) {
    try {
      return this.status?.addStatus(message) ?? null;
    } catch (error) {
      console.error("Failed to display status message", error);
      return null;
    }
  }

  _bindStorageModal() {
    this._storageModal = document.getElementById("storageModal");
    this._storageSlots = document.querySelectorAll("#storageSlots .slot");
    this._storageClose = document.getElementById("storageClose");

    if (this._storageClose) {
      this._storageClose.onclick = () => this._closeStorageModal();
    }
  }

  _bindDeathModal() {
    this._deathModal = document.getElementById("deathModal");
    this._newCharBtn = document.getElementById("newCharBtn");

    if (this._newCharBtn) {
      this._newCharBtn.onclick = () => window.location.reload();
    }
  }

  _bindNpcModal() {
    this._npcModal = document.getElementById("npcModal");
    this._npcText = document.getElementById("npcDialogText");
    this._npcOptions = document.getElementById("npcDialogOptions");
    this._npcClose = document.getElementById("npcDialogClose");

    if (this._npcClose) {
      this._npcClose.onclick = () => this._closeNpcDialog();
    }
  }

  _openNpcDialog(npc) {
    if (!this._npcModal || !this._npcOptions || !this._npcText) return;
    const overlayOpened =
      this.menuController?.openBlockingOverlay({
        owner: OverlayOwner.NPC,
        pauseSimulation: false,
        onCancel: () => this._closeNpcDialog({ resumeGameplay: false }),
      }) ?? true;
    if (!overlayOpened) return false;

    npc?.pause?.();
    this._activeNpc = npc;
    this._npcText.textContent = "Hello traveler.";
    this._npcOptions.innerHTML = "";

    const options = this._pickNpcOptions(4);
    for (const { label, remark } of options) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.onclick = () => {
        this._addStatus(remark);
        this._closeNpcDialog();
      };
      this._npcOptions.appendChild(btn);
    }

    this._npcModal.classList.remove("hidden");
    this._npcModal.setAttribute("aria-hidden", "false");
    this._npcClose?.focus?.();
    return true;
  }

  _closeNpcDialog({ resumeGameplay = true } = {}) {
    if (!this._npcModal) return;
    const overlayClosed =
      this.menuController?.closeBlockingOverlay({
        owner: OverlayOwner.NPC,
        resumeGameplay,
      }) ?? true;
    if (!overlayClosed) return false;

    this._npcModal.classList.add("hidden");
    this._npcModal.setAttribute("aria-hidden", "true");
    this._activeNpc?.resume?.();
    this._activeNpc = null;
    return true;
  }

  _pickNpcOptions(count) {
    const pool = [
      { label: "Ask about the town", remark: "The wanderer shrugs." },
      { label: "Trade", remark: "They gesture toward a distant market." },
      {
        label: "Request directions",
        remark: "You are told to follow the river.",
      },
      { label: "Tell a joke", remark: "A small smile breaks the silence." },
      { label: "Ask about rumors", remark: "They whisper of a hidden grove." },
      { label: "Say farewell", remark: "The wanderer nods respectfully." },
      { label: "Ask for work", remark: "They mention a notice board nearby." },
      {
        label: "Compliment their armor",
        remark: "They tap the helm with pride.",
      },
    ];

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, count);
  }

  _bindChangelogModal() {
    this._changelogModal = document.getElementById("changelogModal");
    this._openChangelog = document.getElementById("openChangelog");
    this._changelogClose = document.getElementById("changelogClose");

    if (this._openChangelog) {
      this._openChangelog.onclick = () => {
        const overlayOpened =
          this.menuController?.openBlockingOverlay({
            owner: OverlayOwner.CHANGELOG,
            onCancel: () =>
              this._closeChangelogModal({
                resumeGameplay: false,
              }),
          }) ?? true;
        if (!overlayOpened) return;
        this._changelogModal?.classList.remove("hidden");
        this._changelogModal?.setAttribute("aria-hidden", "false");
        this._changelogClose?.focus?.();
      };
    }

    if (this._changelogClose) {
      this._changelogClose.onclick = () => this._closeChangelogModal();
    }
  }

  _closeChangelogModal({ resumeGameplay = true } = {}) {
    const overlayClosed =
      this.menuController?.closeBlockingOverlay({
        owner: OverlayOwner.CHANGELOG,
        resumeGameplay,
      }) ?? true;
    if (!overlayClosed) return false;

    this._changelogModal?.classList.add("hidden");
    this._changelogModal?.setAttribute("aria-hidden", "true");
    return true;
  }

  _handlePlayerDeath() {
    if (this.player) {
      this.player.isDead = true;
    }
    this.combatMgr.sessions = [];
    this._cancelInteractionAnimations();

    // Death supersedes dismissible dialogs and any pending pointer-lock
    // resume they own. A late lock confirmation is then rejected safely.
    this._dismissTransientDialogs();
    this.menuController?.openBlockingOverlay({ owner: OverlayOwner.DEATH });
    if (this._deathModal) {
      this._deathModal.classList.remove("hidden");
      this._deathModal.setAttribute("aria-hidden", "false");
      this._newCharBtn?.focus?.();
    }
  }

  _dismissTransientDialogs() {
    this._npcModal?.classList.add("hidden");
    this._npcModal?.setAttribute("aria-hidden", "true");
    this._activeNpc?.resume?.();
    this._activeNpc = null;
    this._storageModal?.classList.add("hidden");
    this._storageModal?.setAttribute("aria-hidden", "true");
    this._activeStorage = null;
    this._activeStorageMap = null;
    this._changelogModal?.classList.add("hidden");
    this._changelogModal?.setAttribute("aria-hidden", "true");
    this.menuController?.closeBlockingOverlay({
      resumeGameplay: false,
      force: true,
    });
  }

  _openStorageModal(storage, ownerMap = this.currentMap) {
    if (
      !storage?.contents?.length ||
      !this.canCompleteWorldInteraction(storage, ownerMap) ||
      !this._storageModal ||
      !this._storageSlots
    )
      return false;
    const overlayOpened =
      this.menuController?.openBlockingOverlay({
        owner: OverlayOwner.STORAGE,
        pauseSimulation: true,
        onCancel: () => this._closeStorageModal({ resumeGameplay: false }),
      }) ?? true;
    if (!overlayOpened) return false;

    this._activeStorage = storage;
    this._activeStorageMap = ownerMap;
    this._renderStorageSlots(storage);
    this._storageModal.classList.remove("hidden");
    this._storageModal.setAttribute("aria-hidden", "false");
    this._storageClose?.focus?.();
    return true;
  }

  _closeStorageModal({ resumeGameplay = true } = {}) {
    if (!this._storageModal) return;
    const overlayClosed =
      this.menuController?.closeBlockingOverlay({
        owner: OverlayOwner.STORAGE,
        resumeGameplay,
      }) ?? true;
    if (!overlayClosed) return false;

    this._storageModal.classList.add("hidden");
    this._storageModal.setAttribute("aria-hidden", "true");
    this._activeStorage = null;
    this._activeStorageMap = null;
    return true;
  }

  _renderStorageSlots(storage) {
    if (!this._storageSlots) return;
    this._storageSlots.forEach((slot, idx) => {
      slot.innerHTML = "";
      const item = storage.contents[idx];
      if (!item) return;

      const img = document.createElement("img");
      img.src = item.imagePath;
      img.alt = item.name;
      img.title = item.description;
      img.onclick = () => this._takeStorageItem(idx);

      slot.appendChild(img);

      if (item.quantity && item.quantity > 1) {
        const quantityDisplay = document.createElement("div");
        quantityDisplay.className = "item-quantity";
        quantityDisplay.textContent = item.quantity;
        slot.appendChild(quantityDisplay);
      }
    });
  }

  _takeStorageItem(slotIndex) {
    const storage = this._activeStorage;
    if (!storage) return;
    const item = storage.contents[slotIndex];
    if (!item) return;

    const amount = item.quantity ?? 1;
    const taken = this._addItemToPlayer(item, amount);
    if (taken <= 0) return;

    const remaining = amount - taken;
    if (remaining > 0) {
      item.quantity = remaining;
    } else {
      storage.contents.splice(slotIndex, 1);
    }

    if (storage.contents.length === 0) {
      this._activeStorageMap?.removeEntity?.(storage);
      storage.model?.removeFromParent?.();
      this._closeStorageModal();
    } else {
      this._renderStorageSlots(storage);
    }

    this._reportItemPickup(item, taken);
  }

  pickUpDroppedItem(entity, ownerMap = this.currentMap) {
    if (
      !ownerMap ||
      ownerMap !== this.currentMap ||
      !ownerMap.entities?.includes(entity)
    )
      return false;

    const item = entity?.item;
    if (!item) return false;

    const amount = item.quantity ?? 1;
    const taken = this._addItemToPlayer(item, amount);
    if (taken <= 0) return false;

    if (taken < amount) {
      item.quantity = amount - taken;
    } else {
      ownerMap.removeEntity?.(entity);
      entity.model?.removeFromParent?.();
    }

    this._reportItemPickup(item, taken);
    return true;
  }

  _addItemToPlayer(item, amount) {
    const numericAmount = Number(amount);
    const requested = Number.isFinite(numericAmount)
      ? Math.max(0, Math.floor(numericAmount))
      : 0;
    const accepted = this.player?.addItem?.(item, requested) ?? 0;
    const numericAccepted = Number(accepted);
    const taken = Number.isFinite(numericAccepted)
      ? Math.min(requested, Math.max(0, Math.floor(numericAccepted)))
      : 0;
    if (taken <= 0) {
      this._addStatus("Inventory is full.");
      return 0;
    }

    return taken;
  }

  _reportItemPickup(item, taken) {
    try {
      this.ui?.renderInventory?.(this.player.inventory);
    } catch (error) {
      console.error("Failed to refresh inventory after pickup", error);
    }
    const itemName = item?.name ?? item?.id ?? "item";
    const quantity = taken > 1 ? ` ×${taken}` : "";
    this._addStatus(`Picked up ${itemName}${quantity}.`);
  }

  _wireInventoryUI() {
    if (this._inventoryBound || !this.player) return;
    this._disposeInventoryContext = setupInventoryContext({
      player: this.player,
      getMap: () => this.currentMap,
      getScene: () => this.currentMapGroup,
      ui: this.ui,
    });
    this._inventoryBound = true;
  }

  _bindOverworldEditor() {
    if (this._overworldEditorBound) return;
    const button = document.getElementById("regenOverworld");
    if (!button) return;

    this._setOverworldEditorDefaults();

    button.onclick = async () => {
      this._setOverworldEditorFeedback("");
      const weights = this._collectOverworldWeights();
      if (!weights) return;
      button.disabled = true;
      await this._regenerateOverworld(weights);
    };

    this._overworldEditorBound = true;
    this._updateOverworldEditorAvailability();
  }

  _bindWeatherControls() {
    if (this._weatherControlsBound) return;
    const toggle = document.getElementById("weatherToggle");
    const intensity = document.getElementById("weatherIntensity");
    const intensityValue = document.getElementById("weatherIntensityValue");
    const rain = document.getElementById("weatherRain");
    const snow = document.getElementById("weatherSnow");
    if (!toggle || !intensity || !rain || !snow) return;

    toggle.checked = this._weatherEnabled;
    intensity.value = this._weatherIntensity.toString();
    if (intensityValue) {
      intensityValue.textContent = this._weatherIntensity.toFixed(1);
    }
    rain.checked = this._weatherMode === "rain";
    snow.checked = this._weatherMode === "snow";

    const applyWeather = () => {
      if (!this.weather) return;
      const allowWeather = this._weatherEnabled && !this.currentMap?.isDungeon;
      this.weather.setIntensity(
        this.currentMap?.isDungeon ? 0.0 : this._weatherIntensity,
      );
      this.weather.setMode(allowWeather ? this._weatherMode : "none");
    };

    toggle.onchange = () => {
      this._weatherEnabled = toggle.checked;
      applyWeather();
    };

    const updateIntensity = () => {
      const value = Number.parseFloat(intensity.value);
      if (!Number.isFinite(value)) return;
      this._weatherIntensity = Math.max(0, value);
      if (intensityValue) {
        intensityValue.textContent = this._weatherIntensity.toFixed(1);
      }
    };

    intensity.oninput = updateIntensity;
    intensity.onchange = () => {
      updateIntensity();
      applyWeather();
    };

    rain.onchange = () => {
      if (!rain.checked) return;
      this._weatherMode = "rain";
      applyWeather();
    };

    snow.onchange = () => {
      if (!snow.checked) return;
      this._weatherMode = "snow";
      applyWeather();
    };

    this._weatherControlsBound = true;
  }

  _setOverworldEditorDefaults() {
    const defaults = this._getOverworldWeights();

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value.toString();
    };

    setValue("weightWater", defaults[TileId.WATER]);
    setValue("weightSand", defaults[TileId.SAND]);
    setValue("weightGrass", defaults[TileId.GRASS]);
    setValue("weightDense", defaults[TileId.DENSE_GRASS]);
    setValue("weightForest", defaults[TileId.FOREST]);
  }

  _getOverworldWeights() {
    const map = this.currentMap;
    const fallback = {
      [TileId.WATER]: 20,
      [TileId.SAND]: 20,
      [TileId.GRASS]: 45,
      [TileId.DENSE_GRASS]: 25,
      [TileId.FOREST]: 25,
    };

    if (!map || map.isDungeon) return fallback;
    return {
      [TileId.WATER]: map.weights?.[TileId.WATER] ?? fallback[TileId.WATER],
      [TileId.SAND]: map.weights?.[TileId.SAND] ?? fallback[TileId.SAND],
      [TileId.GRASS]: map.weights?.[TileId.GRASS] ?? fallback[TileId.GRASS],
      [TileId.DENSE_GRASS]:
        map.weights?.[TileId.DENSE_GRASS] ?? fallback[TileId.DENSE_GRASS],
      [TileId.FOREST]: map.weights?.[TileId.FOREST] ?? fallback[TileId.FOREST],
    };
  }

  _collectOverworldWeights() {
    const readValue = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const value = Number.parseFloat(el.value);
      if (!Number.isFinite(value)) return null;
      return Math.max(0, value);
    };

    const weights = {
      [TileId.WATER]: readValue("weightWater"),
      [TileId.SAND]: readValue("weightSand"),
      [TileId.GRASS]: readValue("weightGrass"),
      [TileId.DENSE_GRASS]: readValue("weightDense"),
      [TileId.FOREST]: readValue("weightForest"),
    };

    if (Object.values(weights).some((value) => value == null)) {
      this._setOverworldEditorFeedback(
        "Enter a non-negative value for every terrain weight.",
      );
      this._addStatus("Invalid overworld weights.");
      return null;
    }

    return weights;
  }

  async _regenerateOverworld(weights) {
    if (this._isMapTransitioning) {
      this._setOverworldEditorFeedback(
        "A map transition is already in progress.",
      );
      return;
    }
    if (!this.currentMap || this.currentMap.isDungeon) {
      this._setOverworldEditorFeedback(
        "Overworld generation is unavailable inside dungeons.",
      );
      this._addStatus("Switch to the overworld to regenerate it.");
      return;
    }

    const map = this.currentMap;
    const group = this.currentMapGroup;
    this._isMapTransitioning = true;
    this._cancelInteractionAnimations(map);
    this._updateOverworldEditorAvailability();

    try {
      map.regenerate({ weights });
      const safePlayerCoords = findNearestWalkable(
        map,
        this.player.coords.x,
        this.player.coords.y,
      );
      if (!safePlayerCoords) {
        this._setOverworldEditorFeedback(
          "No walkable player tile was generated.",
        );
        this._addStatus(
          "The regenerated overworld has no walkable player tile.",
        );
        return;
      }
      this.player.coords.set(safePlayerCoords.x, safePlayerCoords.y);

      if (!this._overworldModelMap) {
        this._overworldModelMap = await map.loadModelMap();
      }

      this._overworldRenderHandle = buildOverworld(
        group,
        this._overworldModelMap,
        map.denseMatrix,
        this.TILE_SIZE,
      );

      map.spawnDungeonEntrances?.({ count: 6, minSpacing: 10 });
      map.spawnNPCs?.({ count: 1 });
      for (const entity of map.entities) {
        await entity.addTo(group, map);
      }

      await this.player.addTo(group, map);
      this.playerController?.syncFromPlayer();
      this.interactionController?.clearTarget();
      this._setOverworldEditorFeedback("Overworld regenerated.");
      this._addStatus("Overworld regenerated.");
    } catch (err) {
      console.error("Failed to regenerate overworld", err);
      this._setOverworldEditorFeedback("Overworld regeneration failed.");
      this._addStatus("Overworld regeneration failed.");
    } finally {
      this.input?.resetTransientState?.();
      this._isMapTransitioning = false;
      this._updateOverworldEditorAvailability();
    }
  }

  _updateOverworldEditorAvailability() {
    const button = document.getElementById("regenOverworld");
    if (!button) return;

    const dungeonMessage =
      "Overworld generation is unavailable inside dungeons.";
    const transitionMessage = "A map change is in progress.";
    const unavailableMessage = this._isMapTransitioning
      ? transitionMessage
      : dungeonMessage;
    const isAvailable = Boolean(
      this.currentMap &&
      !this.currentMap.isDungeon &&
      !this._isMapTransitioning,
    );
    button.disabled = !isAvailable;
    button.title = isAvailable
      ? "Regenerate the current overworld"
      : this._isMapTransitioning
        ? "Wait for the current map change to finish"
        : "Available only in the overworld";

    if (!isAvailable && this.currentMap) {
      this._setOverworldEditorFeedback(unavailableMessage);
    } else {
      const feedback = document.getElementById("overworldEditorFeedback");
      if (
        feedback?.textContent === dungeonMessage ||
        feedback?.textContent === transitionMessage
      ) {
        this._setOverworldEditorFeedback("");
      }
    }
  }

  _setOverworldEditorFeedback(message) {
    const feedback = document.getElementById("overworldEditorFeedback");
    if (feedback) feedback.textContent = message;
  }
}
