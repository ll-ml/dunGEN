import * as THREE from "three";

export class WeatherSystem {
  constructor({
    areaSize = 600,
    height = 250,
    intensity = 1.0,
    mode = "none",
  } = {}) {
    this.areaSize = areaSize;
    this.height = height;
    this.intensity = intensity;
    this.mode = mode;

    this.group = new THREE.Group();
    this._snow = null;
    this._rain = null;

    this._followPos = new THREE.Vector3(0, 0, 0);
    this._followSpeed = 0.5; // increase here to have tigher follow lower it will lag behind a bit

    this._half = this.areaSize * 0.5;

    this._wind = new THREE.Vector3(8, 0, 2);
  }

  addTo(scene) {
    scene.add(this.group);
  }

  removeFrom(scene) {
    scene.remove(this.group);
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this._rebuild();
  }

  setAreaSize(v) {
    this.areaSize = v;
    this._half = v * 0.5;
    if (this.mode !== "none") this._rebuild();
  }


  setIntensity(v) {
    this.intensity = v;
  }

  _rebuild() {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this._snow = null;
    this._rain = null;

    if (this.mode === "snow") this._buildSnow();
    if (this.mode === "rain") this._buildRain();
  }

  _buildSnow() {
    const count = Math.floor(4000 * this.intensity);

    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      pos[ix + 0] = (Math.random() - 0.5) * this.areaSize;
      pos[ix + 1] = Math.random() * this.height;
      pos[ix + 2] = (Math.random() - 0.5) * this.areaSize;

      // slow fall, gentle drift
      vel[ix + 0] = (Math.random() - 0.5) * 2;
      vel[ix + 1] = -(6 + Math.random() * 8);
      vel[ix + 2] = (Math.random() - 0.5) * 2;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("_vel", new THREE.BufferAttribute(vel, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const points = new THREE.Points(geom, mat);
    points.raycast = () => null;
    this._snow = points;
    this.group.add(points);
  }

  _buildRain() {
    const drops = Math.floor(3000 * this.intensity);

    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(drops * 2 * 3);
    const vel = new Float32Array(drops * 3);

    for (let i = 0; i < drops; i++) {
      const base = i * 6;
      const vbase = i * 3;

      const x = (Math.random() - 0.5) * this.areaSize;
      const y = Math.random() * this.height;
      const z = (Math.random() - 0.5) * this.areaSize;

      const len = 8 + Math.random() * 10;

      //top
      pos[base + 0] = x;
      pos[base + 1] = y;
      pos[base + 2] = z;
      //bottom
      pos[base + 3] = x;
      pos[base + 4] = y - len;
      pos[base + 5] = z;

      vel[vbase + 0] = this._wind.x * 0.2;
      vel[vbase + 1] = -(60 + Math.random() * 80);
      vel[vbase + 2] = this._wind.z * 0.2;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("_vel", new THREE.BufferAttribute(vel, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(geom, mat);
    lines.raycast = () => null;
    this._rain = lines;
    this.group.add(lines);
  }

  update(dt, cameraTarget) {
    if (cameraTarget) {
      const desired = new THREE.Vector3(cameraTarget.x, 0, cameraTarget.z);

      const t = 1.0 - Math.exp(-this._followSpeed * dt);

      this._followPos.lerp(desired, t);
      this.group.position.set(this._followPos.x, 0, this._followPos.z);
    }

    if (this.mode === "snow" && this._snow) this._updateSnow(dt);
    if (this.mode === "rain" && this._rain) this._updateRain(dt);
  }

  _updateSnow(dt) {
    const geom = this._snow.geometry;
    const pos = geom.getAttribute("position");
    const vel = geom.getAttribute("_vel");

    const half = this._half;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;

      pos.array[ix + 0] += (vel.array[ix + 0] + this._wind.x * 0.15) * dt;
      pos.array[ix + 1] += vel.array[ix + 1] * dt;
      pos.array[ix + 2] += (vel.array[ix + 2] + this._wind.z * 0.15) * dt;


      if (pos.array[ix + 1] < -20) pos.array[ix + 1] = this.height;

      if (pos.array[ix + 0] > half) pos.array[ix + 0] -= this.areaSize;
      else if (pos.array[ix + 0] < -half) pos.array[ix + 0] += this.areaSize;

      if (pos.array[ix + 2] > half) pos.array[ix + 2] -= this.areaSize;
      else if (pos.array[ix + 2] < -half) pos.array[ix + 2] += this.areaSize;
    }

    pos.needsUpdate = true;
  }


  _updateRain(dt) {
    const geom = this._rain.geometry;
    const pos = geom.getAttribute("position");
    const vel = geom.getAttribute("_vel");

    for (let d = 0; d < vel.count; d++) {
      const vbase = d * 3;
      const base = d * 6;

      const vx = vel.array[vbase + 0];
      const vy = vel.array[vbase + 1];
      const vz = vel.array[vbase + 2];

      pos.array[base + 0] += vx * dt;
      pos.array[base + 1] += vy * dt;
      pos.array[base + 2] += vz * dt;

      pos.array[base + 3] += vx * dt;
      pos.array[base + 4] += vy * dt;
      pos.array[base + 5] += vz * dt;

      if (pos.array[base + 4] < -30) {
        const x = (Math.random() - 0.5) * this.areaSize;
        const y = this.height;
        const z = (Math.random() - 0.5) * this.areaSize;
        const len = 8 + Math.random() * 10;

        pos.array[base + 0] = x;
        pos.array[base + 1] = y;
        pos.array[base + 2] = z;

        pos.array[base + 3] = x;
        pos.array[base + 4] = y - len;
        pos.array[base + 5] = z;
      }
    }

    pos.needsUpdate = true;
  }
}
