import { Vector3 } from 'three';

let _renderer, _camera, _overlay, _tmpV = new Vector3();

/**
 * Call once—wires up the DOM overlay and keeps a ref to your renderer & camera.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 */
export function initDamageDisplay(renderer, camera) {
  _renderer = renderer;
  _camera   = camera;

  // Creates div if not already there
  _overlay = document.getElementById('ui-overlay');
  if (!_overlay) {
    _overlay = document.createElement('div');
    _overlay.id = 'ui-overlay';
    Object.assign(_overlay.style, {
      position:       'absolute',
      top:            '0',
      left:           '0',
      width:          '100%',
      height:         '100%',
      pointerEvents:  'none',
      overflow:       'hidden',
    });
    document.body.appendChild(_overlay);
  }
}

/**
 * Spawns a little rising / fading text at a world position.
 * @param {number|string} amount
 * @param {THREE.Vector3} worldPosition
 */
export function showDamage(amount, worldPosition) {
  if (!(_renderer && _camera && _overlay)) return;

  _tmpV.copy(worldPosition).project(_camera);
  const x = (_tmpV.x * 0.5 + 0.5) * _renderer.domElement.clientWidth;
  const y = (-_tmpV.y * 0.5 + 0.5) * _renderer.domElement.clientHeight;

  const div = document.createElement('div');
  div.className = 'damage-bubble';
  div.textContent = `-${amount}`;
  _overlay.appendChild(div);

  div.style.left      = `${x}px`;
  div.style.top       = `${y}px`;

  requestAnimationFrame(() => {
    div.style.transform = 'translate(-50%, -30px)';
    div.style.opacity   = '0';
  });

  setTimeout(() => div.remove(), 2000);
}