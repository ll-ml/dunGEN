import * as THREE from 'three';
import { Dungeon } from './dungeon.js';
import { TickManager } from './tickManager.js';
import { Enemy } from './enemy.js';
import { TileType } from './types.js';
import { CombatManager } from './combat.js';
import { buildDungeon } from './render.js';
import { FrameCounter } from './fpsCounter.js';
import { renderInventory, setupInventoryContext } from './inventory.js';

const tickManager = new TickManager(600);
const clock = new THREE.Clock();

const WIDTH = 40;   // columns
const HEIGHT = 30;  // rows
const TILE_SIZE = 11;


const dungeonPixelWidth = WIDTH * TILE_SIZE;
const dungeonPixelHeight = HEIGHT * TILE_SIZE;



const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0,1,0), 0)

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
  radius = Math.max(50, Math.min(250, radius));
});

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
//renderer.setClearColor(0x222222, 1)
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222, 1);
document.body.appendChild(renderer.domElement);
// DEBUG
const fpsCounter = new FrameCounter();

const dungeon = new Dungeon(WIDTH, HEIGHT);

await dungeon.generateDungeon();

const modelMap = await dungeon.loadModelMap();
buildDungeon(scene, modelMap, dungeon.denseMatrix);

addAddtionalItems();

await Promise.all(
  dungeon.sparseMatrix.map(obj => obj._loadPromise)
);

const combatMgr = new CombatManager();

function addAddtionalItems() {
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(0, 100, 50);
  directionalLight.target.position.set(0, 0, 0);
  scene.add(directionalLight);
  scene.add(directionalLight.target);

  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  dungeon.sparseMatrix.forEach(obj => {
    if (obj.model) {
      scene.add(obj.model);
    }
  });
}

let player = dungeon.player;

const halfWpx = dungeonPixelWidth  / 2;
const halfHpz = dungeonPixelHeight / 2;

const ctxMenu = document.getElementById('ctxMenu');

renderer.domElement.addEventListener('click', e => {
  ctxMenu.style.display = 'none';
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width)*2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height)*2 + 1;
  raycaster.setFromCamera(mouse, perspCam);

  const worldPt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(ground, worldPt)) return;

  const gridX = Math.floor((worldPt.x + halfWpx) / TILE_SIZE);
  const gridZ = Math.floor((worldPt.z + halfHpz) / TILE_SIZE);

  if (
    gridX < 0 || gridZ < 0 ||
    gridX >= WIDTH || gridZ >= HEIGHT ||
    !player.canWalk(dungeon.denseMatrix[gridZ][gridX])
  ) return;

  combatMgr.disengage(player.combat);

  player.moveTo(new THREE.Vector2(gridX, gridZ),
                dungeon.denseMatrix);
});

renderer.domElement.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top ) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, perspCam);
  const hits = raycaster.intersectObjects(scene.children, true);
  
  const worldPt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(ground, worldPt)) return;

  const gridX = Math.floor((worldPt.x + halfWpx) / TILE_SIZE);
  const gridZ = Math.floor((worldPt.z + halfHpz) / TILE_SIZE);

  if (gridX < 0 || gridZ < 0 || gridX >= WIDTH || gridZ >= HEIGHT) return;

  const tile = dungeon.denseMatrix[gridZ][gridX];

  ctxMenu.innerHTML = '';

  if (tile === TileType.DOOR) {
    const openDoor = document.createElement('li');
    openDoor.textContent = 'Open door'
    openDoor.onclick = async () => {
      //generate new dungeon
      ctxMenu.style.display = 'none';

      await player.moveToAsync(
        new THREE.Vector2(gridX, gridZ),
        dungeon.denseMatrix
      );

      await dungeon.generateDungeon();

      const modelMap = await dungeon.loadModelMap();

      buildDungeon(scene, modelMap, dungeon.denseMatrix);
      addAddtionalItems();
      player = dungeon.player;
      target.copy(player.model.position);
      player.inventory = [];
      setupInventoryContext(player, dungeon);
      renderInventory(player.inventory);

    };
    ctxMenu.append(openDoor);
  }

  const enemy = dungeon.sparseMatrix.find(
    o => o instanceof Enemy &&
    o.coords.x === gridX
    && o.coords.y === gridZ
  );

  if (hits.length > 0) {
    let pick = hits[0].object;

    if (enemy) {
      const fight = document.createElement('li');
      fight.textContent = `Fight ${enemy.id}`;
      fight.onclick = () => {
        ctxMenu.style.display = 'none';
       player.approachAndFight(enemy, dungeon.denseMatrix, combatMgr);
      }
      ctxMenu.append(fight);
      const inspectEnemy = document.createElement('li');
      inspectEnemy.textContent = `Inspect ${enemy.id}`;
      inspectEnemy.onclick = () => {
        ctxMenu.style.display = 'none';
        dungeon.addStatus(`You see a ${enemy.id}.`);
      }
      ctxMenu.append(inspectEnemy);
    } else {
      const inspect = document.createElement('li');
      inspect.textContent = 'Inspect';
      inspect.onclick = () => {
        ctxMenu.style.display = 'none';
        if (tile === TileType.DOOR) {
          dungeon.addStatus('This door leads to another dungeon...');
          return;
        }
        dungeon.addStatus('You inspect the ground... Nothing interesting happens.');
        // do something
      }

      const pickUpFoodEle = document.createElement('li');
      pickUpFoodEle.textContent = 'Pick up some food';
      pickUpFoodEle.onclick = () => {
        ctxMenu.style.display = 'none';
        dungeon.addStatus('You manage to somehow find a lobster in the dungeon.');
        player.addTestItem();
        renderInventory(player.inventory);
      }
      ctxMenu.append(inspect);
      ctxMenu.append(pickUpFoodEle);
    }
  }

  ctxMenu.style.left = `${e.clientX}px`;
  ctxMenu.style.top  = `${e.clientY}px`;
  ctxMenu.style.display = 'block';
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') ctxMenu.style.display = 'none'; });

setupInventoryContext(player, dungeon);



const health = document.getElementById('hp');
/*
let lastHp = player.combat.hp;
tickManager.onTick(() => {
  if (player.combat.hp !== lastHp) {
    hpEl.textContent = player.combat.hp;
    lastHp = player.combat.hp;
  }
});
This could be nice
*/

tickManager.onTick(() => {
  player.updateMovement(clock.getDelta());
  player.mixer?.update(clock.getDelta());

  health.textContent = player.combat.hp;

  for (const obj of dungeon.sparseMatrix) {
    if (!(obj instanceof Enemy)) continue;

    obj.think(player.coords, dungeon.denseMatrix);
    obj.updateMovement(clock.getDelta());
    obj.mixer?.update(clock.getDelta());

    const dist =
      Math.abs(obj.coords.x - player.coords.x) +
      Math.abs(obj.coords.y - player.coords.y);

    if (dist === 1 && player.currentAction !== player.actions.walk) { // This is ugly but works to some extent
      combatMgr.engage(player.combat, obj.combat);
    }

    // Instead of directly interacting with players actions like so should have some method of player to dealt with this
    if(player.currentAction === player.actions.walk) {
      combatMgr.disengage(obj.combat);
    }
  }

  combatMgr.update();

  for (let i = dungeon.sparseMatrix.length - 1; i >= 0; i--) {
    const o = dungeon.sparseMatrix[i];
    if (o instanceof Enemy && o.readyToRemove) {
      scene.remove(o.model);
      dungeon.sparseMatrix.splice(i, 1);
    }
  }
});


function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const dtMS = dt * 1000;

  tickManager.update(dtMS);

  player.updateMovement(dt);
  player.mixer?.update(dt);

  for (const obj of dungeon.sparseMatrix) {
    if (obj instanceof Enemy) {
      obj.think(player.coords, dungeon.denseMatrix);

      obj.updateMovement(dt);

      obj.mixer?.update(dt);
    }
  }
  fpsCounter.update();

  if (player.model) target.copy(player.model.position);
  const sinT = Math.sin(theta);
  const camX = target.x + radius*sinT*Math.cos(phi);
  const camZ = target.z + radius*sinT*Math.sin(phi);
  const camY = target.y + radius*Math.cos(theta);
  perspCam.position.set(camX, camY, camZ);
  perspCam.lookAt(target);

  renderer.render(scene, perspCam);
}

animate();