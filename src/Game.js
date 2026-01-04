import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Overworld } from "../overworld/overworld.js";
import { buildOverworld } from "../overworld/renderOverworld.js";

export class Game {
    constructor( { tileSize = 11, worldW = 150, wolrdH = 100 } = {}) {
        this.TILE_SIZE = tileSize;
        this.WOLRD_W = worldW;
        this.WORLD_H = wolrdH;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null; 


        this.input = null;
        this.player = null;

        this.currentMap = null;
        this.currentMapGroup = null;

        this._running = false; 
        this._lastTime = 0;
    }


    async start() {

    }

    _initThree() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        document.body.appendChild(this.renderer.domElement);

        this.scene = new THREE.scene();
        this.scene.background = new THREE.Color(0x98c6ff);

        // this will need to be its own object pretty sure at some point
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
          );

          const wolrdSizeX = this.WOLRD_W * this.TILE_SIZE;
          const worldSizeY = this.WORLD_H * this.TILE_SIZE;
          
          //const worldRadius = Math.max(worldSizeX, worldSizeY); yeah this is old code im going to leave here 

          const worldRadius = 50; // kind of a magic number but it works great for what we're trying to achive 

          this.camera.position(0, wolrdSizeX * 0.9, worldSizeY * 0.9);
          this.camera.lookAt(0, 0, 0); // just hardcode the origin for now.

          this.controls = new OrbitControls(this.camera, this.renderer.domElement);

          this.controls.minDistance = TILE_SIZE * 5;
          this.controls.maxDistance = worldRadius * 1.5;
          this.controls.minPolarAngle = Math.PI * 0.15;
          this.controls.maxPolarAngle = Math.PI * 0.49;
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

}