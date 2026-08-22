/**
 * Entity-owned contract for first-person interactions.
 *
 * Target selection stays in the controller, while each entity owns its label,
 * usable range, availability, and behavior. This keeps Space interaction free
 * of entity-kind switches and leaves the same target resolver reusable by M1.
 */
export class InteractionComponent {
  constructor({
    id,
    label,
    rangeTiles = 2,
    isAvailable = null,
    execute,
  } = {}) {
    if (typeof execute !== "function") {
      throw new Error("InteractionComponent requires an execute callback");
    }

    this.id = id ?? "interact";
    this.label = label ?? "Interact";
    this.rangeTiles = Math.max(
      0,
      Number.isFinite(rangeTiles) ? rangeTiles : 2
    );
    this._isAvailable = isAvailable;
    this._execute = execute;
    this.entity = null;
  }

  attach(entity) {
    this.entity = entity;
    entity.interaction = this;
  }

  getLabel(context = {}) {
    const value = typeof this.label === "function"
      ? this.label({ ...context, entity: this.entity })
      : this.label;
    return String(value || "Interact");
  }

  isAvailable(context = {}) {
    if (typeof this._isAvailable !== "function") return true;
    return Boolean(this._isAvailable({ ...context, entity: this.entity }));
  }

  execute(context = {}) {
    return this._execute({ ...context, entity: this.entity });
  }
}
