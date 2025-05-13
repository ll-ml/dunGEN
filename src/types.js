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