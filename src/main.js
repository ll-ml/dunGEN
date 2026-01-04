import { Game } from "./Game.js"


// default constuct this for now
const game = new Game({ tileSize: 11, worldW: 150, worldH: 100 });
await game.start().catch(console.error);
console.log(game.currentMap)
