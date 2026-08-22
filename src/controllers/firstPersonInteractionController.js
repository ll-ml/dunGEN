/**
 * Coordinates crosshair targeting, the Space prompt, and async activation.
 */
export class FirstPersonInteractionController {
  constructor({
    resolver,
    getGame,
    isEnabled,
    promptElement,
    crosshairElement = null,
    targetRefreshSeconds = 0.05,
    targetMissTolerance = 1,
  } = {}) {
    if (!resolver || typeof getGame !== "function" || typeof isEnabled !== "function") {
      throw new Error("FirstPersonInteractionController requires resolver and game state");
    }
    if (!promptElement) {
      throw new Error("FirstPersonInteractionController requires a prompt element");
    }

    this.resolver = resolver;
    this.getGame = getGame;
    this.isEnabled = isEnabled;
    this.promptElement = promptElement;
    this.crosshairElement = crosshairElement;
    this.targetRefreshSeconds = Math.max(
      0,
      Number.isFinite(targetRefreshSeconds) ? targetRefreshSeconds : 0.05
    );
    this.targetMissTolerance = Math.max(
      0,
      Number.isFinite(targetMissTolerance) ? Math.floor(targetMissTolerance) : 1
    );

    this.target = null;
    this._busy = false;
    this._renderedText = null;
    this._refreshRemaining = 0;
    this._consecutiveMisses = 0;
    this._disposed = false;
    this.clearTarget();
  }

  get isBusy() {
    return this._busy;
  }

  update(deltaSeconds = Number.POSITIVE_INFINITY) {
    if (this._disposed) return null;
    if (this._busy || !this.isEnabled()) {
      if (!this._busy) this.clearTarget();
      return this.target;
    }

    const elapsed = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : this.targetRefreshSeconds;
    this._refreshRemaining -= elapsed;
    if (this._refreshRemaining > 0) return this.target;
    this._refreshRemaining = this.targetRefreshSeconds;

    const context = this._makeContext();
    const resolvedTarget = this.resolver.resolve(context);
    if (
      !resolvedTarget &&
      this.target &&
      this._consecutiveMisses < this.targetMissTolerance
    ) {
      this._consecutiveMisses++;
      return this.target;
    }

    this._consecutiveMisses = 0;
    this.target = resolvedTarget;
    this._renderTarget();
    return this.target;
  }

  async interact() {
    if (this._disposed || this._busy || !this.isEnabled()) return false;

    const context = this._makeContext();
    const target = this.resolver.resolve(context);
    if (!target) {
      this.clearTarget();
      return false;
    }

    this._busy = true;
    try {
      this.target = target;
      this._setPrompt(`${target.interaction.getLabel(context)}…`, true);
      const result = await Promise.resolve(
        target.interaction.execute({ ...context, target })
      );
      return result !== false;
    } catch (error) {
      console.error("Interaction failed", error);
      try {
        context.game?.ui?.addStatus?.("That interaction could not be completed.");
      } catch (statusError) {
        console.error("Failed to report interaction error", statusError);
      }
      return false;
    } finally {
      this._busy = false;
      if (!this._disposed && this.isEnabled()) this.update();
      else this.clearTarget();
    }
  }

  clearTarget() {
    this.target = null;
    this._refreshRemaining = 0;
    this._consecutiveMisses = 0;
    this._setPrompt("", false);
  }

  dispose() {
    this._disposed = true;
    this._busy = false;
    this.clearTarget();
  }

  _makeContext() {
    const game = this.getGame();
    return {
      game,
      map: game?.currentMap ?? null,
      player: game?.player ?? null,
    };
  }

  _renderTarget() {
    if (!this.target) {
      this._setPrompt("", false);
      return;
    }

    const context = this._makeContext();
    this._setPrompt(
      `Space · ${this.target.interaction.getLabel(context)}`,
      true
    );
  }

  _setPrompt(text, active) {
    this.promptElement.classList.toggle("hidden", !active);
    this.crosshairElement?.classList?.toggle("interactable", active);
    if (text !== this._renderedText) {
      this.promptElement.textContent = text;
      this._renderedText = text;
    }
  }
}
