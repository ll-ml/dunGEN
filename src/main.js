import { Game } from "./Game.js"

const game = new Game({ tileSize: 11, worldW: 150, worldH: 100 });
await game.start().catch(console.error);
