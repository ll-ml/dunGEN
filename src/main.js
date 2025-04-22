import * as THREE from 'three';
import { Dungeon } from './dungeon.js';
import { TickManager } from './tickManager.js';

const tickMager = new TickManager(600);
const clock = new THREE.Clock();

const WIDTH = 40;   // columns
const HEIGHT = 30;  // rows
const TILE_SIZE = 11;

const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

const dungeonPixelWidth = WIDTH * TILE_SIZE;
const dungeonPixelHeight = HEIGHT * TILE_SIZE;

const pixelWidth = TILE_SIZE * WIDTH;
const pixelHeight = TILE_SIZE * HEIGHT;


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0,1,0), 0)

const perspCam = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const halfH = dungeonPixelHeight / 2;
const aspect = window.innerWidth / window.innerHeight;
const halfW = halfH * aspect;

const orthoCam = new THREE.OrthographicCamera(
  -halfW,  halfW,
   halfH, -halfH,
   1, 1000     // near/far
);

//looking down:
orthoCam.position.set(0, 200, 0);

// point along –Z, not +Y
orthoCam.up.set(0, 0, -1);

// Now look at the center of the floor
orthoCam.lookAt(0, 0, 0);
orthoCam.updateProjectionMatrix();


const target = new THREE.Vector3(0, 0, 0);

// Spherical coordinates for the camera
let phi = 0;            // horizontal angle
let theta = 1;          // vertical angle (in radians)
let radius = 100;       // distance from the target

// Variables for mouse drag control
let isMiddleMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

const clickables = [];


// Set up mousedown listener for the middle mouse button
window.addEventListener("mousedown", (e) => {
  if (e.button === 1) { // 1 is middle mosue
    e.preventDefault();
    isMiddleMouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});


window.addEventListener("mouseup", (e) => {
  if (e.button === 1) {
    isMiddleMouseDown = false;
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    dungeon.generateDungeon();
    dungeon.loadModelMap().then((modelMap) => {
      buildDungeonWithModels(modelMap);
      addDebugObjects();
      const playerObj = dungeon.sparseMatrix[0];
      if (playerObj.model) {
        target.copy(playerObj.model.position);
      } else {
        console.error("Could not readjust camera")
      }
    });
  }
});

// Update camera angles when moving the mouse (only if middle button is held)
window.addEventListener("mousemove", (e) => {
  if (!isMiddleMouseDown) return;
  
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  
  const rotationSpeed = 0.005;
  const verticalSpeed = 0.005;
  phi -= deltaX * rotationSpeed;
  theta -= deltaY * verticalSpeed;
  
  // Clamp theta so that the camera doesn't flip over
  const minTheta = 0.1;  
  const maxTheta = Math.PI / 2 - 0.1;
  theta = Math.max(minTheta, Math.min(maxTheta, theta));
});

window.addEventListener("wheel", (e) => {
  const zoomSpeed = 0.2;
  radius += e.deltaY * zoomSpeed;
  radius = Math.max(50, Math.min(1000, radius));
});

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
//renderer.setClearColor(0x222222, 1)
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222, 1);
document.body.appendChild(renderer.domElement);

const dungeon = new Dungeon(WIDTH, HEIGHT);

await dungeon.generateDungeon();
dungeon.loadModelMap().then((modelMap) => {
  buildDungeonWithModels(modelMap);
  addDebugObjects();
});

await Promise.all(
  dungeon.sparseMatrix.map(obj => obj._loadPromise)
);


window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  perspCam.aspect = window.innerWidth / window.innerHeight;
  perspCam.updateProjectionMatrix();
});

function buildDungeonWithModels(modelMap) {
  // clear out both scene children _and_ clickables
  while (scene.children.length) scene.remove(scene.children[0]);
  clickables.length = 0;

  const offsetX = -dungeonPixelWidth / 2;
  const offsetZ = -dungeonPixelHeight/ 2;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const tile = dungeon.denseMatrix[y][x];
      const baseModel = modelMap[tile];
      if (baseModel) {
        const modelInstance = baseModel.clone();
        modelInstance.position.set(
          offsetX + x*TILE_SIZE + TILE_SIZE/2,
          0,
          offsetZ + y*TILE_SIZE + TILE_SIZE/2
        );
        modelInstance.scale.setScalar(11);
        scene.add(modelInstance);
      }

      // Now make an invisible plane at the same spot for clicks:
      const planeGeo  = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        opacity: 0.25,
        transparent: true
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      // rotate X so it lies flat on the floor
      planeMesh.rotation.x = -Math.PI/2;
      planeMesh.position.set(
        offsetX + x*TILE_SIZE + TILE_SIZE/2,
        0.1,  // small Y offset to avoid z-fighting
        offsetZ + y*TILE_SIZE + TILE_SIZE/2
      );
      // store grid coords
      planeMesh.userData = { gridX: x, gridZ: y };
      scene.add(planeMesh);
      clickables.push(planeMesh);
    }
  }
}

// Kepp debug for now
function addDebugObjects() {
  // Add directional light and its helper
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(0, 100, 50);
  directionalLight.target.position.set(0, 0, 0);
  scene.add(directionalLight);
  scene.add(directionalLight.target);

  const dirLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
  scene.add(dirLightHelper);
  
  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // Add the debug sphere
  const sphereGeometry = new THREE.SphereGeometry(2, 32, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  debugSphere.position.set(0, 5, 0);
  // Optionally, scale it if required (or remove the scaling if too large)
  debugSphere.scale.set(1, 1, 1);
  scene.add(debugSphere);

  dungeon.sparseMatrix.forEach(obj => {
    if (obj.model) {
      // actually put the player/enemy into the scene
      scene.add(obj.model);
    }
  });

  //const playerCoods = dungeon.sparseMatrix[0].coords;
  //target = playerCoods;
}

const playerObj = dungeon.sparseMatrix[0];


/*
window.addEventListener('click', e => {
  mouse.x = ( e.clientX / innerWidth ) * 2 - 1;
  mouse.y = ( e.clientY / innerHeight) * 2 - 1;
  raycaster.setFromCamera(mouse, perspCam);
  let gridX = 0;
  let gridZ = 0;

  const hitsOnPlayer = raycaster.intersectObject(playerObj.model, true);
  if (hitsOnPlayer.length > 0) {
    gridX = playerObj.coords.x; 
    gridZ = playerObj.coords.y;
    console.log(`Clicked on player so stay at ${gridX}, ${gridZ}`);
    return;
  }
  console.log(playerObj.coords)

  const worldPt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(ground, worldPt)) return;

  const offsetX = -dungeonPixelWidth/2;
  const offsetZ = -dungeonPixelHeight/2;

  const fx = (worldPt.x - offsetX) / TILE_SIZE;
  const fz = (worldPt.z -offsetZ) / TILE_SIZE; 
  gridX = Math.floor(fx + 0.5);
  gridZ = Math.floor(fz + 0.5);

  console.log('clicked tile:', gridX, gridZ);
  
  const newPath = playerObj.computePath(
    new THREE.Vector2(gridX, gridZ), 
    dungeon.denseMatrix
  );

  if (newPath.length === 0) {
    console.warn(`No valid path to (${gridX}, ${gridZ})- maybe it's blocked.`);
  } else {
    console.log(`Starting from ${playerObj.coords.x}, ${playerObj.coords.y}`);
    console.log(newPath);
  }

  if (
    gridX < 0 || gridZ < 0|| gridX >= WIDTH|| gridZ >= HEIGHT ||
    !playerObj.canWalk(dungeon.denseMatrix[gridZ][gridX])
  ) return;
  //playerObj.moveTo(new THREE.Vector2(gridX,gridZ), dungeon.denseMatrix);
});
*/
// after you’ve defined `playerObj`, `raycaster`, `mouse`, `perspCam`, etc.
// pre‑computed constants:
const halfWpx = dungeonPixelWidth  / 2;
const halfHpz = dungeonPixelHeight / 2;

// reuse your existing raycaster, mouse, perspCam, ground, playerObj, etc.
renderer.domElement.addEventListener('click', e => {
  // 1) NDC coords relative to canvas
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left)  / rect.width )  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)   / rect.height) * 2 + 1;

  // 2) shoot that ray from your perspective camera
  raycaster.setFromCamera(mouse, perspCam);

  // 3) intersect the ground plane at y=0
  const worldPt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(ground, worldPt)) return;

  // 4) shift origin by +half‑dungeon, then divide by TILE_SIZE
  const gridX = Math.floor( (worldPt.x + halfWpx) / TILE_SIZE );
  const gridZ = Math.floor( (worldPt.z + halfHpz) / TILE_SIZE );

  console.log(`Clicked at world (${worldPt.x.toFixed(1)},${worldPt.z.toFixed(1)}) → tile [${gridX},${gridZ}]`);
  console.log(`Player at ${playerObj.coords.x}`)

  // 5) bounds‑check & teleport
  if (
    gridX < 0 || gridZ < 0 ||
    gridX >= WIDTH || gridZ >= HEIGHT
  ) {
    console.warn("Out of dungeon!");
    return;
  }
  playerObj.setPosition(gridX, gridZ);
});

tickMager.onTick(() => {
  playerObj.updatePathStep();
});

function animate() {
  requestAnimationFrame(animate);

  // 1) compute delta
  const deltaSeconds = clock.getDelta();
  const deltaMS      = deltaSeconds * 1000;

  // 2) drive your tick‑based logic
  tickMager.update(deltaMS);

  // 3) advance any mixers for smooth bone animation
  playerObj.mixer?.update(deltaSeconds);
  dungeon.sparseMatrix.forEach(obj => obj.mixer?.update(deltaSeconds));

  if (playerObj.model) {
    target.copy(playerObj.model.position);
  }

  // 4) update camera (your existing code)
  const sinTheta = Math.sin(theta);
  const camX = target.x + radius * sinTheta * Math.cos(phi);
  const camZ = target.z + radius * sinTheta * Math.sin(phi);
  const camY = target.y + radius * Math.cos(theta);
  perspCam.position.set(camX, camY, camZ);
  perspCam.lookAt(target);

  // 5) finally render
  renderer.render(scene, perspCam);
}
animate();