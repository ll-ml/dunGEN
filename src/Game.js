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
        this.tickManager = new TickManager(600);
    }


    async start() {
        this._initThree();
        this._initLights();
        this._initResizeHandler();
        this.ui = {
            ctxMenu: new ContextMenuUI(document.getElementById("ctxMenu")),
            addStatus: (msg) => console.log(msg),
            openStorageModal: (storage) => console.log("open storage", storage),
            renderInventory: (inv) => console.log("render inventory", inv),
        }

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

        const group = new THREE.Group();
        buildOverworld(group, modelMap, overwolrd.denseMatrix, this.TILE_SIZE);

        this.setMap(overwolrd, group);

        if (!this.player) {
            this.player = new Player(this.playerSpawn.x, this.playerSpawn.y);
            await this.player.addTo(this.currentMapGroup, this.currentMap);
            this.player.updatePosition(this.currentMap);
        } else {
            await this.player.addTo(this.currentMapGroup, this.currentMap);
            this.player.updatePosition(this.currentMap);
        }

        this.currentMap.spawnDungeonEntrances?.({ count: 6, minSpacing: 10 });

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
    }

    _loop = (now) => {
        if (!this._running) return;

        const dt = Math.min((now - this._lastTime) / 1000, 0.05);
        this._lastTime = now;

        // update game state here 

        // controls and render 
        this.camControls?.update();
        this.renderer.render(this.scene, this.camera);
        this.tickManager.update();

        if (this.player?.mixer) {
            this.player.mixer.update(dt);
        }

        this.player?.updateMovement?.(dt, this.currentMap);

         if (this.player?.model) {
            const p = this.player.model.position;

            const desired = new THREE.Vector3(p.x, 0, p.z);

            this._camTarget.lerp(desired, 1 - Math.pow(1 - this._camFollowLerp, dt * 60));

            this.camControls.setTarget?.(this._camTarget);
        }

        

        this._frameCounter.update();
        requestAnimationFrame(this._loop);
    }

    stop() {
        this._running = false;
    }

}