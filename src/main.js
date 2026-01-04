import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Overworld } from "./overworld/overworld.js";
import { buildOverworld } from "./overworld/renderOverworld.js";
import { FrameCounter } from "./fpsCounter.js"

const TILE_SIZE = 11;
const WORLD_W = 150;
const WORLD_H = 100;

async function main() {

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x98c6ff);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  let phi = 0.0;
  let theta = 1;
  let radius = 50;
  console.log(window);

  // centers at (0,0,0))
  const worldSizeX = WORLD_W * TILE_SIZE;
  const worldSizeZ = WORLD_H * TILE_SIZE;
  //const worldRadius = Math.max(worldSizeX, worldSizeZ) * 0.5;
  const worldRadius = radius;

  camera.position.set(0, worldRadius * 0.9, worldRadius * 0.9);
  camera.lookAt(0, 0, 0);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);

  // Feel: top-down-ish but allow orbit


  // Limit how far you can zoom
  controls.minDistance = TILE_SIZE * 5;
  controls.maxDistance = worldRadius * 1.5;

  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.49;

  controls.zoomSpeed = 1.0;
  controls.panSpeed = 0.8;
  controls.rotateSpeed = 0.7;
  scene.fog = new THREE.Fog(0x98c6ff, worldRadius * 1.2, worldRadius * 4);

  const overworld = new Overworld(WORLD_W, WORLD_H);
  const modelMap = await overworld.loadModelMap();
  buildOverworld(scene, modelMap, overworld.denseMatrix, TILE_SIZE);

  addAddtionalItems(scene);

  const fpsCounter = new FrameCounter();


  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    fpsCounter.update();
    renderer.render(scene, camera);
  }
  animate();
}

main().catch(console.error);


function addAddtionalItems(scene) {
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(0, 100, 50);
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  //scene.add(directionalLight.target);

  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
}