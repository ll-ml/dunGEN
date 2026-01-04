import * as THREE from "three";

export class Camera {
  constructor(camera, domElement = window) {
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(0, 0, 0);

    this.phi = 0;
    this.theta = 1.0;
    this.radius = 100;

    this.minTheta = 0.35;
    this.maxTheta = Math.PI / 2 - 0.15;
    this.minRadius = 80;
    this.maxRadius = 100;

    this.rotationSpeed = 0.005;
    this.zoomSpeed = 0.25;

    this.isMiddleDown = false;
    this.lastX = 0;
    this.lastY = 0;

    this.isRightDown = false;
    this.panSpeed = 0.6;

    this._bindEvents();
    this.update();
  }

  setTarget(vec3) {
    this.target.copy(vec3);
  }

  _bindEvents() {
    this.domElement.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.isMiddleDown = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
      if (e.button === 2) {
        e.preventDefault();
        this.isRightDown = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    this.domElement.addEventListener("mouseup", (e) => {
      if (e.button === 1) this.isMiddleDown = false;
      if (e.button === 2) this.isRightDown = false;
    });

    this.domElement.addEventListener("mousemove", (e) => {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;

      if (this.isMiddleDown) {
        this.phi   -= dx * this.rotationSpeed;
        this.theta -= dy * this.rotationSpeed;
        this.theta = Math.max(this.minTheta, Math.min(this.maxTheta, this.theta));
      }

      if (this.isRightDown) {
        const right = new THREE.Vector3();
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const panScale = this.panSpeed * (this.radius / 300);
        this.target.addScaledVector(right,   -dx * panScale);
        this.target.addScaledVector(forward,  dy * panScale);
      }

      if (this.isMiddleDown || this.isRightDown) {
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    this.domElement.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.radius += e.deltaY * this.zoomSpeed;
      this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
    }, { passive: false });
    this.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  update() {
    const sinT = Math.sin(this.theta);
    const cosT = Math.cos(this.theta);
    const cosP = Math.cos(this.phi);
    const sinP = Math.sin(this.phi);

    const x = this.target.x + this.radius * sinT * cosP;
    const y = this.target.y + this.radius * cosT;
    const z = this.target.z + this.radius * sinT * sinP;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}
