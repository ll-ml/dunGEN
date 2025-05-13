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

export function setupInventoryContext(player, dungeon) {
    renderInventory(player.inventory);
  

  
    // attach handlers to each slot
    const slots = document.querySelectorAll('#inventoryItems .slot');
    slots.forEach((slot, idx) => {
      slot.addEventListener('contextmenu', e => {
        e.preventDefault();
        const item = player.inventory[idx];
        if (!item) return;
  
        const actions = [
          {
            label: `Use ${item.name}`,
            onClick: () => {
              // example:
              player.inventory.splice(idx, 1);
              renderInventory(player.inventory);
              player.combat.hp += 5;
              dungeon.addStatus(`You consume ${item.name} for +5 HP.`);
            }
          },
          {
            label: `Inspect ${item.name}`,
            onClick: () => {
              dungeon.addStatus(item.description);
            }
          },
          {
            label: `Drop ${item.name}`,
            onClick: () => {
              player.inventory.splice(idx, 1);
              renderInventory(player.inventory);
            }
          }
        ];
  
        showCtxMenu(actions, e.pageX, e.pageY);
      });
    });
}