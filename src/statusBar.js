export class StatusBar {
    constructor() {
        this.statusMessages = [];
        this.statusElm = document.getElementById('statusArea');
    }

    addStatus(message) {
        this.statusMessages.push(message);

        if (this.statusMessages.length > 10) {
            this.statusMessages.shift();
        }

        this.updateStatusArea();

        return;
    }

    updateStatusArea() {
        if (this.statusElm) {
            this.statusElm.innerHTML = this.statusMessages.join('<br>');
        }
    }

    removeStatus(message) {
        this.statusMessages = this.statusMessages.filter(m => m !== message);
        this.updateStatusArea();
    }
}
