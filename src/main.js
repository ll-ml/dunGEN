import * as THREE from 'three';
import { Dungeon } from './dungeon.js';
import { TickManager } from './tickManager.js';
import { Enemy } from './enemy.js';
import { TileType } from './types.js';
import { CombatManager } from './combat.js';
import { buildDungeon } from './render.js';
import { FrameCounter } from './fpsCounter.js';
import { renderInventory, setupInventoryContext } from './inventory.js';
import { DroppedItem, StorageItem } from './storageItem.js'
import { initDamageDisplay } from './damageDisplay.js';


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
let phi = 0;
let theta = 1;
let radius = 50;

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
  radius = Math.max(50, Math.min(100, radius));
});

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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

initDamageDisplay(renderer, perspCam);
await Promise.all(
  dungeon.sparseMatrix.map(obj => obj._loadPromise)
);

let combatMgr = new CombatManager();
combatMgr.onDeath = ({ winner, loser, hit, damage}) => {
  const deadObj = loser.owner; 
  if (deadObj instanceof Enemy) {
    const { x, y } = deadObj.coords;
    const lootChest = new StorageItem(
      "Wooden Chest",
      x, 
      y,
      [],
      {
        glbPath: './public/chest.glb'
      }
    );
    dungeon.sparseMatrix.push(lootChest);
    lootChest.addTo(scene);
  }
}

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
      obj.inScene = true;
    }
  });
}

let player = dungeon.player;
player.skills.initDungeon(dungeon);
//updateSkillsUI(player);

const deathModal = document.getElementById('deathModal');
const newCharBtn = document.getElementById('newCharBtn');

newCharBtn.onclick = async () => {
  deathModal.classList.add('hidden');

  await dungeon.generateDungeon();

  player = dungeon.player;
  player.combat.onDie = () => {
    player._playAction('die');
    deathModal.classList.remove('hidden');
  };

  const modelMap = await dungeon.loadModelMap();
  buildDungeon(scene, modelMap, dungeon.denseMatrix);
  addAddtionalItems();

  setupInventoryContext(player, dungeon, scene);
  renderInventory(player.inventory);

  target.copy(player.model.position);
  const sinT = Math.sin(theta);
  const camX = target.x + radius * sinT * Math.cos(phi);
  const camZ = target.z + radius * sinT * Math.sin(phi);
  const camY = target.y + radius * Math.cos(theta);
  perspCam.position.set(camX, camY, camZ);
  perspCam.lookAt(target);

  combatMgr = new CombatManager(dungeon.sparseMatrix, scene);
  combatMgr.onDeath = ({ winner, loser, hit, damage }) => {
    const deadObj = loser.owner;
    if (deadObj instanceof Enemy) {
      const { x, y } = deadObj.coords;
      const lootChest = new StorageItem(
        "Wooden Chest",
        x, y,
        [],
        { glbPath: './public/chest.glb' }
      );
      dungeon.sparseMatrix.push(lootChest);
      lootChest.addTo(scene);
    }
  };
};

player.combat.onDie = () => {
  player._playAction('die');
  deathModal.classList.remove('hidden');
};

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

function renderStorage(chest) {
  const slots = document.querySelectorAll('#storageSlots .slot');
  slots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const item = chest.contents[idx];
    if (!item) return;
    const img = document.createElement('img');
    img.src   = item.imagePath;
    img.title = item.name;
    img.onclick = () => {
      // take the item
      player.inventory.push(item);
      dungeon.addStatus(`You take ${item.name}.`);
      chest.contents.splice(idx,1);
      renderStorage(chest);
      renderInventory(player.inventory);
      
    };
    slot.appendChild(img);
  });
}

// show / hide our stoageModal
const modal      = document.getElementById('storageModal');
const closeBtn   = document.getElementById('storageClose');
closeBtn.onclick = () => modal.classList.add('hidden');

function openStorageModal(chest) {
  renderStorage(chest);
  modal.classList.remove('hidden');
}

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

  let storage; 
  for (const obj of dungeon.sparseMatrix) {
    if (!(obj instanceof StorageItem) || !obj.hitbox) continue;
    obj.hitbox.setFromObject(obj.model);
    if (raycaster.ray.intersectBox(obj.hitbox, new THREE.Vector3())) {
      storage = obj;
      break;
    }
  }
  if (storage) {
    const searchStorage = document.createElement('li');
    searchStorage.textContent = 'Search ' + storage.id;
    searchStorage.onclick = async () => {
      ctxMenu.style.display = 'none';
      // TODO make this better and not buggy
      player.skills.gainXp("Looting", 100);
      const barrelLoc = new THREE.Vector2(storage.coords.x, storage.coords.y);
      if (player.coords.manhattanDistanceTo(barrelLoc) <= 2) {
        openStorageModal(storage);
        return;
      }
      await player.moveToAsync(
        barrelLoc.subScalar(1), // this works
        dungeon.denseMatrix
      );
      openStorageModal(storage);

    }

    ctxMenu.append(searchStorage);
  }

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

      await dungeon.generateDungeon(player);

      const modelMap = await dungeon.loadModelMap();

      buildDungeon(scene, modelMap, dungeon.denseMatrix);
      addAddtionalItems();
      player = dungeon.player;
      target.copy(player.model.position);
      setupInventoryContext(player, dungeon, scene);
      renderInventory(player.inventory);
      combatMgr = new CombatManager();
      combatMgr.onDeath = ({ winner, loser, hit, damage}) => {
        const deadObj = loser.owner; 
        if (deadObj instanceof Enemy) {
          const { x, y } = deadObj.coords;
          const lootChest = new StorageItem(
            "Wooden Chest",
            x, 
            y,
            [],
            {
              glbPath: './public/chest.glb'
            }
          );
          dungeon.sparseMatrix.push(lootChest);
          lootChest.addTo(scene);
        }
      }
    };
    ctxMenu.append(openDoor);
  }

 let enemy = null;
 let droppedItem = null;
 for (const obj of dungeon.sparseMatrix) {
  if (obj instanceof Enemy && obj.hitbox) {
    obj.hitbox.setFromObject(obj.model);
    if (raycaster.ray.intersectBox(obj.hitbox, new THREE.Vector3())) {
      enemy = obj;
      break;
    }
  } else if (obj instanceof DroppedItem && obj.hitbox) {
    obj.hitbox.setFromObject(obj.model);
    if (raycaster.ray.intersectBox(obj.hitbox, new THREE.Vector3())) {
      droppedItem = obj;
      break;
    }
  }
 }

  if (hits.length > 0) {
    if (droppedItem) {
      const pickItem = document.createElement('li');
      pickItem.textContent = `Pick up ${droppedItem.id}`;
      ctxMenu.append(pickItem);
    }

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

      ctxMenu.append(inspect);
    }
  }

  ctxMenu.style.left = `${e.clientX}px`;
  ctxMenu.style.top  = `${e.clientY}px`;
  ctxMenu.style.display = 'block';
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') ctxMenu.style.display = 'none'; });

setupInventoryContext(player, dungeon, scene);



const health = document.getElementById('hp');
const maxHealth = document.getElementById('maxHp');
maxHealth.textContent = player.maxHealth;

tickManager.onTick(() => {

  health.textContent = player.combat.hp;
  player.skills.updateUI();

  for (const e of dungeon.sparseMatrix) {
    if (!(e instanceof Enemy)) continue;

    e.think(player.coords, dungeon.denseMatrix);
    const dist =
      Math.abs(e.coords.x - player.coords.x)
      + Math.abs(e.coords.y - player.coords.y);

    if (dist === 1 && !e.inCombat) {
      e.inCombat = true;
      combatMgr.engage(e.combat, player.combat); // fix comabt api call
    }
    else if (dist !== 1 && e.inCombat) {
      e.inCombat = false;
      combatMgr.disengage(e.combat);
    }
  }

  combatMgr.update();

  for (let i = dungeon.sparseMatrix.length - 1; i >= 0; i--) {
    const obj = dungeon.sparseMatrix[i];
    if (obj instanceof Enemy && obj.readyToRemove) {
      scene.remove(obj.model);
      dungeon.sparseMatrix.splice(i, 1);
    }
  }
});

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  tickManager.update(dt * 1000);

  player.updateMovement(dt);
  player.mixer?.update(dt);

  for (const obj of dungeon.sparseMatrix) {
    if (obj instanceof Enemy) {
      obj.think(player.coords, dungeon.denseMatrix); // this is a problem

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