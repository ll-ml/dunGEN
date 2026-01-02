import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


export class Overworld {
    constructor(width, height, { seed = null, weights = null } = {}) {
        this.width = width;
        this.height = height;
        this.seed = seed;
        this.weights = weights;

        
    }
}