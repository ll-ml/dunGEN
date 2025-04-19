import * as THREE from 'three';
import { Dungeon } from './dungeon.js';
import { TickManager } from './tickManager.js';


const WIDTH = 40;   // columns
const HEIGHT = 30;  // rows
const TILE_SIZE = 11;

const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

const pixelWidth = TILE_SIZE * WIDTH;
const pixelHeight = TILE_SIZE * HEIGHT;




const perspCam = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const target = new THREE.Vector3(0, 0, 0);

// Spherical coordinates for the camera
let phi = 0;            // horizontal angle
let theta = 1;          // vertical angle (in radians)
let radius = 100;       // distance from the target

// Variables for mouse drag control
let isMiddleMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;


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
    });
  }
})

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


function animate() {
  requestAnimationFrame(animate);
  
  // Convert spherical coordinates to Cartesian coordinates
  const sinTheta = Math.sin(theta);
  const camX = target.x + radius * sinTheta * Math.cos(phi);
  const camZ = target.z + radius * sinTheta * Math.sin(phi);
  const camY = target.y + radius * Math.cos(theta);
  
  perspCam.position.set(camX, camY, camZ);
  perspCam.lookAt(target);
  
  renderer.render(scene, perspCam);
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  perspCam.aspect = window.innerWidth / window.innerHeight;
  perspCam.updateProjectionMatrix();
});

function buildDungeonWithModels(modelMap) {
  while (scene.children.length) {
    scene.remove(scene.children[0]);
  }

  const dungeonPixelWidth = WIDTH * TILE_SIZE;
  const dungeonPixelHeight = HEIGHT * TILE_SIZE;

  const offsetX = -dungeonPixelWidth / 2;
  const offsetZ = -dungeonPixelHeight / 2;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const tile = dungeon.denseMatrix[y][x];
      const baseModel = modelMap[tile];

      if (!baseModel) {
        continue;
      }

      const modelInstance = baseModel.clone();
      modelInstance.position.set(
        offsetX + x * TILE_SIZE + TILE_SIZE / 2,
        0, // Y
        offsetZ + y * TILE_SIZE + TILE_SIZE / 2
      );
      modelInstance.scale.set(11, 11, 11); // 11 seems to be them magick number

      scene.add(modelInstance);
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

  const playerCoods = dungeon.sparseMatrix[0].coords;
  target = playerCoods;
}
/*

// Orthographic camera: top-left is (0, 0)
const camera = new THREE.OrthographicCamera(
  0,
  window.innerWidth,
  window.innerHeight,
  0,
  -100,
  100
);

camera.position.set(0, 0, 0);
camera.zoom = Math.min(screenWidth / pixelWidth, screenHeight / pixelHeight);
camera.updateProjectionMatrix();
camera.lookAt(0, 0, 0);

const dungeon = new Dungeon(WIDTH, HEIGHT);
dungeon.generateDungeon();

const tickManager = new TickManager(600);

tickManager.onTick(() => {
  dungeon.updateEnemies(scene);
});

const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

function renderSparseObjects() {
  for (const obj of dungeon.sparseMatrix) {
    if (obj && obj.mesh) {
      scene.add(obj.mesh);
    }
  }
}

function getWallMaterial(wallMaterials) {
  const roll = Math.random();
  if (roll < 0.78) {
    return wallMaterials[0];
  } else if (roll < 0.98) {
    return wallMaterials[1];
  } else {
    if (wallMaterials.length > 2) {
      const rareIndex = Math.floor(Math.random() * (wallMaterials.length - 2)) + 2;
      return wallMaterials[rareIndex];
    } else {
      return wallMaterials[1];
    }
  }
}

function buildDungeon() {
  // clear previous
  while (scene.children.length) {
    scene.remove(scene.children[0]);
  }

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Dungeon size in pixels
  const dungeonPixelWidth = WIDTH * TILE_SIZE;
  const dungeonPixelHeight = HEIGHT * TILE_SIZE;

  // offsets
  const offsetX = (screenWidth - dungeonPixelWidth) / 2;
  const offsetY = (screenHeight - dungeonPixelHeight) / 2;

  const tileGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const tile = dungeon.denseMatrix[y][x];
      let material = dungeon.materialMap[tile] || fallbackMaterial;

      if (Array.isArray(material)) {
        material = getWallMaterial(material);
      }

      const mesh = new THREE.Mesh(tileGeometry, material);
      mesh.position.x = offsetX + x * TILE_SIZE + TILE_SIZE / 2;
      mesh.position.y = screenHeight - (offsetY + y * TILE_SIZE + TILE_SIZE / 2);
      scene.add(mesh);
    }
  }

  renderSparseObjects();
}

// Render loop
let lastTime = performance.now();
function animate(currentTime) {
  requestAnimationFrame(animate);
  
  const delta = currentTime - lastTime;
  lastTime = currentTime;

  tickManager.update(delta);

  renderer.render(scene, camera);
}

buildDungeon();
requestAnimationFrame(animate);

// TODO: Fix
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.right = window.innerWidth;
  camera.top = window.innerHeight;
  camera.updateProjectionMatrix();
  buildDungeon();
});


let player = dungeon.player;

// can move this around later
function updateInventoryDisplay() {
  const inventoryDiv = document.getElementById('inventoryItems');
  inventoryDiv.innerHTML = '';

  player.inventory.forEach(item => {
    const img = document.createElement('img');
    img.src = item.imagePath;
    img.style.width = '50px';
    img.style.height = '50px';
    img.style.margin = '5px';
    img.style.imageRendering = 'pixelated';
    img.style.imageRendering = 'crisp-edges';

    img.alt = item.name;
    img.title = item.description;
    inventoryDiv.appendChild(img);

  });
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.key === ' ') {
    if (player && player.isAdjacentToPool(dungeon.denseMatrix, dungeon.sparseMatrix)) {
      //dungeon.addStatus("You search the oasis... Nothing interesting happens.")
      dungeon.addStatus("You manage to pull something out of the clear blue water...");
      player.addTestItem();
      updateInventoryDisplay();
      // call player.interact();
    }
  }
  if (event.key === 'Enter') {
    dungeon.generateDungeon();
    buildDungeon();
    player = dungeon.player;
    updateInventoryDisplay();
    //dungeon.showCurrentState();
    return;
  }
  let direction = new THREE.Vector2(0, 0);
  switch (event.key.toLowerCase()) {
    case 'w':
      direction.set(0, -1);
      break;
    case 's':
      direction.set(0, 1);
      break;
    case 'a':
      direction.set(-1, 0);
      break;
    case 'd':
      direction.set(1, 0);
      break
  }

  if (direction.lengthSq() > 0) {
    player.setDesiredMove(direction, dungeon.denseMatrix);
    player.applyMove();
  }
});

*/