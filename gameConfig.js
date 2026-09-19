// ==============================================
// 1. 角色配置 - 复制模板即可新增角色
// ==============================================
const CHARACTERS = [
  // ===== 角色模板 开始 =====
  {
    id: 'warrior',
    name: '战士',
    maxHp: 35,
    maxAp: 3,
    startHandCount: 3,
    drawPerTurn: 1,
    // 角色独有技能，填技能ID，可填多个
    skills: ['warrior_slash', 'warrior_shield']
  },
  // ===== 角色模板 结束 =====

  {
    id: 'mage',
    name: '法师',
    maxHp: 26,
    maxAp: 4,
    startHandCount: 4,
    drawPerTurn: 1,
    skills: ['fireball', 'summon_imp']
  }
];

// ==============================================
// 2. 角色技能配置 - 复制模板即可新增技能
// ==============================================
const SKILLS = [
  // ===== 技能模板 开始 =====
  {
    id: 'warrior_slash',     // 唯一ID，角色配置里引用这个
    name: '猛力斩击',        // 显示名称
    cost: 2,                 // 行动点消耗
    cooldown: 2,             // 冷却回合数
    type: 'attack',          // 类型：attack伤害 / heal治疗 / summon召唤 / buff增益
    target: 'enemy',         // 目标：enemy敌方 / self自身 / enemy_minion敌方仆从
    value: 8,                // 数值
    desc: '对敌方造成8点伤害，冷却2回合'
  },
  // ===== 技能模板 结束 =====

  {
    id: 'warrior_shield',
    name: '铁壁护盾',
    cost: 1,
    cooldown: 3,
    type: 'buff',
    target: 'self',
    effect: { type: 'defense', value: 3, duration: 1 },
    desc: '获得3点护盾，持续1回合，冷却3回合'
  },

  {
    id: 'fireball',
    name: '火球术',
    cost: 3,
    cooldown: 1,
    type: 'attack',
    target: 'enemy',
    value: 10,
    desc: '对敌方造成10点伤害，冷却1回合'
  },

  {
    id: 'summon_imp',
    name: '召唤小鬼',
    cost: 2,
    cooldown: 4,
    type: 'summon',
    target: 'self',
    minionId: 'imp', // 召唤的仆从模板ID
    desc: '召唤1只小鬼仆从，冷却4回合'
  }
];

// ==============================================
// 3. 仆从模板配置 - 复制模板即可新增仆从类型
// ==============================================
const MINION_TEMPLATES = [
  // ===== 仆从模板 开始 =====
  {
    id: 'imp',             // 唯一ID，召唤技能引用
    name: '小鬼',
    maxHp: 5,              // 仆从血量
    attack: 2,             // 仆从攻击力
    desc: '脆弱但攻击迅速的小鬼'
  }
  // ===== 仆从模板 结束 =====
];

// ==============================================
// 4. 装备配置 - 复制模板即可新增装备
// ==============================================
const EQUIPMENTS = [
  // ===== 装备模板 开始 =====
  {
    id: 'iron_sword',      // 唯一ID
    name: '铁剑',
    slot: 'weapon',        // 槽位：weapon武器 / armor护甲 / trinket饰品
    stats: {
      attackBonus: 2,      // 攻击加成
      maxHpBonus: 0,       // 血量上限加成
      apBonus: 0           // 行动点加成
    },
    accessorySlots: 2,     // 配件槽数量（固定2即可）
    desc: '攻击力+2'
  },
  // ===== 装备模板 结束 =====

  {
    id: 'leather_armor',
    name: '皮甲',
    slot: 'armor',
    stats: { attackBonus: 0, maxHpBonus: 5, apBonus: 0 },
    accessorySlots: 2,
    desc: '最大生命值+5'
  }
];

// ==============================================
// 5. 配件配置 - 复制模板即可新增配件
// ==============================================
const ACCESSORIES = [
  // ===== 配件模板 开始 =====
  {
    id: 'sharp_gem',       // 唯一ID
    name: '锋利宝石',
    stats: { attackBonus: 1 },
    desc: '攻击力+1'
  },
  // ===== 配件模板 结束 =====

  {
    id: 'life_gem',
    name: '生命宝石',
    stats: { maxHpBonus: 3 },
    desc: '最大生命值+3'
  }
];

// ==============================================
// 6. 卡牌池配置（装备/配件卡混在卡池中）
// ==============================================
const CARDS = [
  // 攻击卡
  {
    id: 'strike', name: '打击', cost: 1, type: 'attack',
    target: 'enemy', value: 3, effect: null,
    desc: '造成3点伤害'
  },
  {
    id: 'heavy', name: '重击', cost: 2, type: 'attack',
    target: 'enemy', value: 6, effect: null,
    desc: '造成6点伤害'
  },

  // 持续伤害卡
  {
    id: 'burn', name: '灼烧', cost: 1, type: 'debuff',
    target: 'enemy', value: 0,
    effect: { type: 'player', name: '灼烧', damage: 2, duration: 2 },
    desc: '施加灼烧，每回合2点伤害，持续2回合'
  },

  // 治疗卡
  {
    id: 'heal', name: '治疗', cost: 2, type: 'heal',
    target: 'self', value: 5, effect: null,
    desc: '回复5点生命值'
  },

  // 环境卡
  {
    id: 'poison_fog', name: '毒雾', cost: 2, type: 'env',
    target: 'all', value: 0,
    effect: { type: 'env', name: '毒雾', damage: 2, duration: 2 },
    desc: '释放毒雾，全体每回合受2点伤害，持续2回合'
  },

  // ===== 装备卡模板（加入卡池抽取）=====
  {
    id: 'card_iron_sword', name: '装备：铁剑', cost: 1,
    type: 'equipment', target: 'self', equipmentId: 'iron_sword',
    desc: '装备一把铁剑，攻击力+2'
  },
  {
    id: 'card_leather_armor', name: '装备：皮甲', cost: 1,
    type: 'equipment', target: 'self', equipmentId: 'leather_armor',
    desc: '装备一件皮甲，最大生命+5'
  },

  // ===== 配件卡模板（加入卡池抽取）=====
  {
    id: 'card_sharp_gem', name: '配件：锋利宝石', cost: 0,
    type: 'accessory', target: 'self', accessoryId: 'sharp_gem',
    desc: '镶嵌到装备上，攻击力+1'
  }
];

// 默认角色
const DEFAULT_CHARACTER_ID = 'warrior';

module.exports = {
  CHARACTERS, SKILLS, MINION_TEMPLATES,
  EQUIPMENTS, ACCESSORIES, CARDS,
  DEFAULT_CHARACTER_ID
};
//（注：内容由AI生成）
