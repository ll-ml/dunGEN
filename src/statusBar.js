export class StatusBar {
    constructor() {
        this.statusMessages = [];
        this.statusElm = document.getElementById('statusArea');
    }

    addStatus(message) {
        this.statusMessages.push(message);

        if (this.statusMessages.length > 3) {
            this.statusMessages.shift();
        }

        this.updateStatusArea();

        setTimeout(() => {
            this.removeStatus(message);
        }, 5000); // remove message after 5 seconds elapsed
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