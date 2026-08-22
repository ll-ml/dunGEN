const DEFAULT_MAX_MESSAGES = 3;
const DEFAULT_HOLD_MS = 5000;
const DEFAULT_FADE_MS = 600;

export class StatusBar {
    constructor(
        documentRef = globalThis.document,
        {
            maxMessages = DEFAULT_MAX_MESSAGES,
            holdMs = DEFAULT_HOLD_MS,
            fadeMs = DEFAULT_FADE_MS,
            setTimeoutFn = null,
            clearTimeoutFn = null,
        } = {}
    ) {
        this.statusMessages = [];
        this.statusElm = documentRef?.getElementById?.('statusArea') ?? null;
        this.document = documentRef;
        this.maxMessages = Number.isFinite(maxMessages)
            ? Math.max(1, Math.floor(maxMessages))
            : DEFAULT_MAX_MESSAGES;
        this.holdMs = Number.isFinite(holdMs)
            ? Math.max(0, holdMs)
            : DEFAULT_HOLD_MS;
        this.fadeMs = Number.isFinite(fadeMs)
            ? Math.max(0, fadeMs)
            : DEFAULT_FADE_MS;
        const timerHost = documentRef?.defaultView ?? globalThis;
        this._setTimeout = typeof setTimeoutFn === "function"
            ? (callback, delay) => setTimeoutFn(callback, delay)
            : (callback, delay) => timerHost.setTimeout(callback, delay);
        this._clearTimeout = typeof clearTimeoutFn === "function"
            ? (timer) => clearTimeoutFn(timer)
            : (timer) => timerHost.clearTimeout(timer);
        this._entries = [];
        this._disposed = false;
    }

    addStatus(message) {
        if (this._disposed) return null;
        const text = String(message ?? "").trim();
        if (!text) return null;

        const entry = {
            text,
            element: this._createMessageElement(text),
            fadeTimer: null,
            removeTimer: null,
        };
        this._entries.push(entry);
        this.statusMessages.push(text);

        while (this._entries.length > this.maxMessages) {
            this._removeEntry(this._entries[0]);
        }

        if (entry.element) {
            entry.fadeTimer = this._schedule(() => {
                entry.element?.classList.add("is-fading");
            }, this.holdMs);
            entry.removeTimer = this._schedule(
                () => this._removeEntry(entry),
                this.holdMs + this.fadeMs
            );
        }

        return entry.element;
    }

    clear() {
        for (const entry of [...this._entries]) {
            this._removeEntry(entry);
        }
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.clear();
    }

    _createMessageElement(text) {
        if (!this.statusElm || !this.document?.createElement) return null;

        const element = this.document.createElement("div");
        element.className = "status-message";
        element.textContent = text;
        element.style.setProperty("--status-fade-duration", `${this.fadeMs}ms`);
        this.statusElm.appendChild(element);

        while (this.statusElm.children.length > this.maxMessages) {
            this.statusElm.firstElementChild?.remove?.();
        }

        return element;
    }

    _removeEntry(entry) {
        const index = this._entries.indexOf(entry);
        if (index < 0) return;

        this._entries.splice(index, 1);
        this.statusMessages.splice(index, 1);
        if (entry.fadeTimer != null) this._clearTimeout?.(entry.fadeTimer);
        if (entry.removeTimer != null) this._clearTimeout?.(entry.removeTimer);
        entry.element?.remove?.();
    }

    _schedule(callback, delay) {
        const timer = this._setTimeout?.(callback, delay);
        timer?.unref?.();
        return timer ?? null;
    }
}
