import * as THREE from "three";
import { Camera } from "./camera.js"
import { Overworld } from "./overworld/overworld.js";
import { buildOverworld } from "./overworld/renderOverworld.js";
import { FrameCounter } from "./fpsCounter.js";
import { ContextMenuUI } from "./contextMenuUI.js";
import { InputController } from "./InputController.js";
import { TickManager } from "./tickManager.js";
import { Dungeon } from "./dungeon.js";
import { buildDungeon } from "./render.js";
import { Player } from "./player.js";
import { WeatherSystem } from "./weather.js";
import { renderInventory, setupInventoryContext } from "./inventory.js";
import { initDamageDisplay } from "./damageDisplay.js";
import { TileId } from "./overworld/wfc.js";
import { CombatManager } from "./combat.js";

export class Game {
    constructor( { tileSize = 11, worldW = 150, wolrdH = 100 } = {}) {
        this.TILE_SIZE = tileSize;
        this.WORLD_W = worldW;
        this.WORLD_H = wolrdH;

        this.renderer = null;
        this.scene = null;
        this.camera = null;

        this.camControls = null;
        this._camTarget = new THREE.Vector3(0, 0, 0);
        this._camFollowLerp = 0.12;


        this.input = null;
        this.player = null;
        this.playerSpawn = new THREE.Vector2(this.WORLD_W / 2, this.WORLD_H / 2);

        this.currentMap = null;
        this.currentMapGroup = null;

        this._running = false; 
        this._lastTime = 0;

        this._frameCounter = null;

        this.ui = null;
        this._overworldRenderHandle = null;
        this._overworldModelMap = null;

        this.weather = null;
        this._weatherEnabled = true;
        this.tickManager = new TickManager(600);

        this.combatMgr = new CombatManager();
        this.combatMgr.onDeath = ({ winner, loser }) => {
            if (loser?.owner === this.player) {
                this._handlePlayerDeath();
                return;
            }
            console.log(`ENEMY ${loser} was slain by ${winner}`);
        }

        this._desired_player_path ??= new THREE.Vector3();

        this._storageModal = null;
        this._storageSlots = null;
        this._storageClose = null;
        this._activeStorage = null;
        this._inventoryBound = false;
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
    }


    async start() {
        this._initThree();
        this._initLights();
        this._initResizeHandler();
        this.ui = {
            ctxMenu: new ContextMenuUI(document.getElementById("ctxMenu")),
            addStatus: (msg) => this._addStatus(msg),
            openStorageModal: (storage) => this._openStorageModal(storage),
            renderInventory: (inv) => renderInventory(inv),
            setHealth: (hp) => this._setHealth(hp),
            openNpcDialog: (npc) => this._openNpcDialog(npc),
        }

        this._bindStorageModal();
        this._bindDeathModal();
        this._bindNpcModal();
        this._bindChangelogModal();

        this.weather = new WeatherSystem({
            areaSize: 800,
            height: 260,
            intensity: 4.0,
            mode: "none",
        });
        this.weather.addTo(this.scene);


        this._frameCounter = new FrameCounter();

        await this.loadOverworld();

        this.input = new InputController({
            domElement: this.renderer.domElement,
            camera: this.camera,
            getActiveMap: () => this.currentMap,
            ui: this.ui.ctxMenu,
            onActionSelected: async (action) => {
                await action.run(this);
            },
            onLeftClick: async ({ grid, map }) => {
                if (!map?.isWalkableAt?.(grid.x, grid.y)) return;
                await this.player.moveToAsync(new THREE.Vector2(grid.x, grid.y), map);
            },
        });

        this.tickManager.onTick((tickSeconds) => {
            this.currentMap?.updateTick?.(this, tickSeconds);
            this.combatMgr.update();
        });


        this._running = true; 
        this._lastTime = performance.now();
        requestAnimationFrame(this._loop);

    }

    _initThree() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        document.body.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x98c6ff);

        // this will need to be its own object pretty sure at some point
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
          );

          this.camControls = new Camera(this.camera, window);



          const worldSizeX = this.WORLD_W * this.TILE_SIZE;
          const worldSizeY = this.WORLD_H * this.TILE_SIZE;
          
          //const worldRadius = Math.max(worldSizeX, worldSizeY); yeah this is old code im going to leave here 

          const worldRadius = 50; // kind of a magic number but it works great for what we're trying to achive 

          this.camera.position.set(0, worldSizeX * 0.9, worldSizeY * 0.9);
          this.camera.lookAt(0, 0, 0); // just hardcode the origin for now.

          this.camControls.minDistance = this.TILE_SIZE * 5;
          this.camControls.maxDistance = worldRadius * 1.5;
          this.camControls.minPolarAngle = Math.PI * 0.15;
          this.camControls.maxPolarAngle = Math.PI * 0.49;


        this.scene.fog = new THREE.Fog(0xa8c6ff, worldRadius * 1.2, worldRadius * 4);

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
        window.addEventListener("resize", () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    async loadOverworld() {
        const overwolrd = new Overworld(this.WORLD_W, this.WORLD_H)

        const modelMap = await overwolrd.loadModelMap();
        this._overworldModelMap = modelMap;

        const group = new THREE.Group();
        const renderHandle = buildOverworld(group, modelMap, overwolrd.denseMatrix, this.TILE_SIZE);
        this._overworldRenderHandle = renderHandle;

        this.setMap(overwolrd, group);

        if (!this.player) {
            this.player = new Player(this.playerSpawn.x, this.playerSpawn.y);
            await this.player.addTo(this.currentMapGroup, this.currentMap);
            this.player.updatePosition(this.currentMap);
        } else {
            await this.player.addTo(this.currentMapGroup, this.currentMap);
            this.player.updatePosition(this.currentMap);
        }

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
        if (this.currentMapGroup) {
            this.scene.remove(this.currentMapGroup);
        }

        this.currentMap = map;
        this.currentMapGroup = group;
        this.scene.add(group);

        this._applyEnvironmentFromMap(map);

        if (this.weather) {
            //this.weather.setMode(map?.isDungeon ? "none" : "rain");
            this.weather.setMode("none");
            this.weather.setIntensity(map?.isDungeon ? 0.0 : 1.0);
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

    async enterDungeon({ width = 40, height = 30, regenerate = true } = {}) {
        const dungeon = new Dungeon(width, height, { tileSize: this.TILE_SIZE });


        await dungeon.generateDungeon(this.player);


        const modelMap = await dungeon.loadModelMap();

        const group = new THREE.Group();
        buildDungeon(group, modelMap, dungeon.denseMatrix, this.TILE_SIZE);

        this.setMap(dungeon, group);

        for (const e of dungeon.entities) {
            await e.addTo(this.currentMapGroup, this.currentMap);
        }

        await this.player.addTo(this.currentMapGroup, this.currentMap);
        this.player.updatePosition(this.currentMap);

        this._wireInventoryUI();
        this.ui.renderInventory(this.player.inventory);
        this._setHealth(this.player.combat.hp);
        this._bindOverworldEditor();

        //DEBUG: this is used for easy of use of stats need to remove when set
        console.log(this.currentMap);
    }

    _loop = (now) => {
        if (!this._running) return;

        const dt = Math.min((now - this._lastTime) / 1000, 0.05);
        this._lastTime = now;


        // controls and render 
        this.camControls?.update();
        //this.renderer.render(this.scene, this.camera);
        this.tickManager.update(dt * 1000);

        //player anims
        if (this.player?.mixer) {
            this.player.mixer.update(dt);
        }

        this.player?.updateMovement?.(dt, this.currentMap);

        const entities = this.currentMap?.entities ?? [];
        for (const ent of entities) {
            if (ent === this.player) continue;
            if (ent?.mixer) ent.mixer.update(dt);
            if (typeof ent.updateMovement === "function") {
                ent.updateMovement(dt, this.currentMap);
            }
        }


        //camera movement
         if (this.player?.model) {
            const p = this.player.model.position;

            //const desired = new THREE.Vector3(p.x, 0, p.z);
            this._desired_player_path.set(p.x, 0, p.z);

            this._camTarget.lerp(this._desired_player_path, 1 - Math.pow(1 - this._camFollowLerp, dt * 60));

            this.camControls.setTarget?.(this._camTarget);
        }

        //nice water anims
        if (this._overworldRenderHandle?.waterMaterial) {
            this._overworldRenderHandle.waterMaterial.uniforms.uTime.value += dt;
        }

        // dynamic weather 
        if (this.weather && this._weatherEnabled) {
            const anchor = this.player?.model?.position ?? this.camera?.position;
            this.weather.update(dt, anchor);
        }

        

        this._frameCounter.update();
        //requestAnimationFrame(this._loop);
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this._loop);
    }

    stop() {
        this._running = false;
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
        const map = this.currentMap;
        if (map?.addStatus) {
            map.addStatus(message);
            return;
        }
        map?.status?.addStatus?.(message);
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
    }

    _closeNpcDialog() {
        if (!this._npcModal) return;
        this._npcModal.classList.add("hidden");
        this._activeNpc?.resume?.();
        this._activeNpc = null;
    }

    _pickNpcOptions(count) {
        const pool = [
            { label: "Ask about the town", remark: "The wanderer shrugs." },
            { label: "Trade", remark: "They gesture toward a distant market." },
            { label: "Request directions", remark: "You are told to follow the river." },
            { label: "Tell a joke", remark: "A small smile breaks the silence." },
            { label: "Ask about rumors", remark: "They whisper of a hidden grove." },
            { label: "Say farewell", remark: "The wanderer nods respectfully." },
            { label: "Ask for work", remark: "They mention a notice board nearby." },
            { label: "Compliment their armor", remark: "They tap the helm with pride." },
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
                this._changelogModal?.classList.remove("hidden");
            };
        }

        if (this._changelogClose) {
            this._changelogClose.onclick = () => {
                this._changelogModal?.classList.add("hidden");
            };
        }
    }

    _handlePlayerDeath() {
        if (this.player) {
            this.player.isDead = true;
        }
        this.combatMgr.sessions = [];
        if (this._deathModal) {
            this._deathModal.classList.remove("hidden");
        }
    }

    _openStorageModal(storage) {
        if (!this._storageModal || !this._storageSlots) return;
        this._activeStorage = storage;
        this._renderStorageSlots(storage);
        this._storageModal.classList.remove("hidden");
    }

    _closeStorageModal() {
        if (!this._storageModal) return;
        this._storageModal.classList.add("hidden");
        this._activeStorage = null;
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
                slot.append(quantityDisplay);
            }
        });
    }

    _takeStorageItem(slotIndex) {
        const storage = this._activeStorage;
        if (!storage) return;
        const item = storage.contents[slotIndex];
        if (!item) return;

        const amount = item.quantity ?? 1;
        const taken = this.player.addItem(item, amount);
        if (taken <= 0) return;

        if (item.quantity && item.quantity > taken) {
            item.quantity -= taken;
        } else {
            storage.contents.splice(slotIndex, 1);
        }

        this.ui.renderInventory(this.player.inventory);

        if (storage.contents.length === 0) {
            this.currentMap?.removeEntity?.(storage);
            this.currentMapGroup?.remove(storage.model);
            this._closeStorageModal();
            return;
        }

        this._renderStorageSlots(storage);
    }

    _wireInventoryUI() {
        if (this._inventoryBound || !this.player) return;
        setupInventoryContext({
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

        button.onclick = () => {
            const weights = this._collectOverworldWeights();
            if (!weights) return;
            this._regenerateOverworld(weights);
        };

        this._overworldEditorBound = true;
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
            [TileId.DENSE_GRASS]: map.weights?.[TileId.DENSE_GRASS] ?? fallback[TileId.DENSE_GRASS],
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
            this._addStatus("Invalid overworld weights.");
            return null;
        }

        return weights;
    }

    async _regenerateOverworld(weights) {
        if (!this.currentMap || this.currentMap.isDungeon) {
            this._addStatus("Switch to the overworld to regenerate it.");
            return;
        }

        try {
            this.currentMap.regenerate({ weights });
        } catch (err) {
            console.error("Failed to regenerate overworld", err);
            this._addStatus("Overworld regeneration failed.");
            return;
        }

        if (!this._overworldModelMap) {
            this._overworldModelMap = await this.currentMap.loadModelMap();
        }

        this._overworldRenderHandle = buildOverworld(
            this.currentMapGroup,
            this._overworldModelMap,
            this.currentMap.denseMatrix,
            this.TILE_SIZE
        );

        this.currentMap.entities = [];
        this.currentMap.spawnDungeonEntrances?.({ count: 6, minSpacing: 10 });
        this.currentMap.spawnNPCs?.({ count: 1 });
        for (const ent of this.currentMap.entities) {
            await ent.addTo(this.currentMapGroup, this.currentMap);
        }

        await this.player.addTo(this.currentMapGroup, this.currentMap);
        this.player.updatePosition(this.currentMap);
        this._addStatus("Overworld regenerated.");
    }

}
