export class Skill {
  constructor(name) {
    this.name         = name;
    this.level        = 1;
    this.xp           = 0;
    this._justLeveled = false;
  }

  xpForNextLevel() {
    return Math.floor(100 * Math.pow(1.2, this.level - 1));
  }

  gainXp(amount = 1) {
    this.xp += amount;
    while (this.xp >= this.xpForNextLevel()) {
      this.xp -= this.xpForNextLevel();
      this.level++;
      this._justLeveled = true;
      if (this._dungeon) {
        this._dungeon.addStatus(
          `${this.name} advanced to level ${this.level}!`
        );
      }
    }
    return this;
  }
}

export class SkillManager {
  constructor() {
    this.skills  = {};
    this._slots  = {};
    this._dungeon = null;

    document
      .querySelectorAll("#skillsBar .skill")
      .forEach(el => {
        const name = el.dataset.skill;
        if (!name) return;
        this.skills[name] = new Skill(name);
        this._slots[name] = el;
      });
  }

  initDungeon(dungeon) {
    this._dungeon = dungeon;
    Object.values(this.skills).forEach(skill => {
      skill._dungeon = dungeon;
    });
  }

  gainXp(skillName, amount = 1) {
    const skill = this.skills[skillName];
    if (!skill) {
      console.warn(`Unknown skill "${skillName}"`);
      return null;
    }
    return skill.gainXp(amount);
  }

  updateUI() {
    for (const [name, skill] of Object.entries(this.skills)) {
      const slot = this._slots[name];
      if (!slot) continue;

      slot.querySelector(".skill-level").textContent = skill.level;
      slot.querySelector(".skill-xp").textContent =
        `${skill.xp}/${skill.xpForNextLevel()}`;

      if (skill._justLeveled) {
        slot.classList.add("level-up");
        setTimeout(() => slot.classList.remove("level-up"), 600);
        skill._justLeveled = false;
      }
    }
  }
}
