import { DroppedItem } from "./storageItem.js";

export class InventoryItem {
  /**
 * @param {string} id - Unique identifier for the item.
 * @param {string} name - The display name of the item.
 * @param {string} imagePath - Path to the item's image.
 * @param {string} description - A brief description of the item.
 * @param {string} type - Type qualifier for given item
 * @param {function} [onUse] - callback(player, dungeon): what happens when player “uses” it {
  
 }}
 */

  constructor(id, name, imagePath, description, type, onUse, stackConfig = {}) {
      this.id = id;
      this.name = name;
      this.imagePath = imagePath;
      this.description = description;
      this.type = type || 'default'; // I think having food default for now could work.

      this.stackable = stackConfig.stackable;
      this.maxStackSize = stackConfig.maxStackSize;
      this.quantity = stackConfig.quantity || 1; // should default to 1
      this.glbPath = stackConfig.glbPath || null;

      this.onUse = typeof onUse === "function"
        ? onUse
        : () => {
          console.warn(`InventoryItem(${this.id}) has no onUse callback.`);
        };
  }

  canStackWith(other) {
    return this.stackable && 
            other.stackable &&
            this.id === other.id;
  }
}

export function renderInventory(items) {
    const slots = document.querySelectorAll('#inventoryItems .slot');
    slots.forEach((slot, idx) => {

      slot.innerHTML = '';
  
      const item = items[idx];
      if (!item) return;
  
      // create an <img> for the item
      const img = document.createElement('img');
      img.src = item.imagePath;
      img.alt = item.name;
      img.title = item.description;        // hover shows description
      img.style.width  = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
  
      slot.appendChild(img);

      // Logic for showing num of stacked items
      if (item.quantity && item.quantity > 1) {
        const quantityDisplay = document.createElement('div');
        quantityDisplay.className = 'item-quantity';
        quantityDisplay.textContent = item.quantity;
        slot.append(quantityDisplay);
      }
    });
}

export function showCtxMenu(items, x, y) {
    const menu = document.getElementById('ctxMenu');
    menu.innerHTML = '';            // clear old entries
    items.forEach(({ label, onClick }) => {
      const li = document.createElement('li');
      li.textContent = label;
      li.onclick = () => {
        menu.style.display = 'none';
        onClick();
      };
      menu.appendChild(li);
    });
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.style.display = 'block';
}

export function setupInventoryContext({ player, getMap, getScene, ui }) {
  renderInventory(player.inventory);

  const slots = document.querySelectorAll("#inventoryItems .slot");
  slots.forEach((slot, idx) => {
    slot.oncontextmenu = (e) => {
      e.preventDefault();
      const map = getMap?.();
      const scene = getScene?.();
      const item = player.inventory[idx];
      if (!item) return;

      const actions = [
        {
          label: `Use ${item.name}`,
          onClick: () => {
            item.onUse(player, map);
            if (item.type === "food") {
              player.removeItem(idx, 1);
            }
            renderInventory(player.inventory);
            ui?.setHealth?.(player.combat.hp);
          },
        },
        {
          label: `Inspect ${item.name}`,
          onClick: () => {
            if (map?.addStatus) {
              map.addStatus(item.description);
            } else {
              map?.status?.addStatus?.(item.description);
            }
          },
        },
        {
          label: `Drop ${item.name}`,
          onClick: () => {
            if (!map || !scene) return;
            const glbPath = item.glbPath ||
              item.imagePath.substring(0, item.imagePath.lastIndexOf(".")) +
              ".glb";
            const itemModel = new DroppedItem(
              item.id,
              player.coords.x,
              player.coords.y,
              glbPath,
              item
            );
            map.entities?.push(itemModel);
            itemModel
              .addTo(scene, map)
              .then(() => {
                itemModel.inScene = true;
              })
              .catch((err) => {
                console.error("Failed to add dropped item into scene", err);
              });
            player.removeItem(idx, 1);
            renderInventory(player.inventory);
          },
        },
      ];

      showCtxMenu(actions, e.pageX, e.pageY);
    };
  });
}
