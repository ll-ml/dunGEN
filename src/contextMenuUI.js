export class ContextMenuUI {
  constructor(el) {
    this.el = el;
    this.hide();
    window.addEventListener("click", () => this.hide());
  }

  showContextMenu({ x, y, actions, onSelect }) {
    this.el.innerHTML = "";

    for (const action of actions) {
      const li = document.createElement("li");
      li.textContent = action.label;
      li.onclick = () => {
        this.hide();
        onSelect(action);
      };
      this.el.appendChild(li);
    }

    this.el.style.position = "fixed";
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.display = "block";
  }

  hide() {
    this.el.style.display = "none";
  }

  isUIEvent(e) {
    return this.el.contains(e.target);
  }
}
