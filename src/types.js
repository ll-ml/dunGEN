export const TileType = {
    WALL: '#',
    DIRT: '=',
    PEBBLE_DIRT: '+',
    ROCK_DIRT: '{',
    FLOOR: '.',
    ROCK: ':',
    PEBBLES: ';',
    DOOR: 'D',
    DOOR_WAY: 'd',
    WATER: '~',
};

export class Room {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width; 
        this.height = height;
    }
}

export class Pool {
    constructor(x, y, width, height) {
        this.x = x; 
        this.y = y; 
        this.width = width; 
        this.height = height;
    }
}

export class InventoryItem {
    /**
   * @param {string} id - Unique identifier for the item.
   * @param {string} name - The display name of the item.
   * @param {string} imagePath - Path to the item's image.
   * @param {string} description - A brief description of the item.
   */

    constructor(id, name, imagePath, description) {
        this.id = id;
        this.name = name;
        this.imagePath = imagePath;
        this.description = description;
    }
}