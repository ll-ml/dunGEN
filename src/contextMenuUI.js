export class ContextMenuUI {
  constructor(ulEl) {
    this.el = ulEl;
    this.hide();
    window.addEventListener("click", () => this.hide());
  }

  show(x, y, actions, onAction) {
    this.el.innerHTML = "";
    for (const a of actions) {
      const li = document.createElement("li");
      li.textContent = a.label;
      li.onclick = () => { this.hide(); onAction(a); };
      this.el.appendChild(li);
    }
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.display = "block";
  }

  hide() { this.el.style.display = "none"; }
}
