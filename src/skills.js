export class Skill {
  constructor(name) {
    this.name  = name;
    this.level = 1;
    this.xp    = 0;
  }

  xpForNextLevel() {
    return Math.floor(100 * Math.pow(1.2, this.level - 1));
  }
  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpForNextLevel()) {
      this.xp -= this.xpForNextLevel();
      this.level++;
      console.log(
        `[Skills] ${this.name} leveled up! → now level ${this.level}, next at ${this.xpForNextLevel()}xp`
      );
    }
  }
}

export class SkillManager {
  constructor(skillNames = []) {
    this.skills = {};
    skillNames.forEach(n => {
      this.skills[n] = new Skill(n);
    });
  }
  gainXp(skillName, amount = 1) {
    const skill = this.skills[skillName];
    if (!skill) {
      console.warn(`Unknown skill: ${skillName}`);
      return null;
    }
    skill.gainXp(amount);
    return skill;
  }
}

export const DEFAULT_SKILLS = [
  "Attack", "Defense", "Hitpoints",
  "Looting", "Crafting", "Magic",
  "Firemaking", "Ranged",  "Cooking"
];
