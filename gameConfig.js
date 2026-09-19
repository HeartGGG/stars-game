// =============================================================
//  游戏总配置文件 (gameConfig.js)
//  —— 你只需要改这一个文件, 就能新增角色 / 阵营 / 技能 / 仆从 / 装备 / 配件 / 卡牌
//  —— 每个模块都带"模板"注释, 照着复制一段、改改 id 和数值即可
// =============================================================

// =============================================================
// 1. 阵营配置 (父级分类)
//    新增阵营: 复制下面一段, 改 id / name 即可
// =============================================================
const FACTIONS = [
  // ===== 阵营模板 开始 =====
  {
    id: 'human',           // 唯一ID (英文, 不能重复)
    name: '人类阵营'       // 显示名
  },
  // ===== 阵营模板 结束 =====

  { id: 'demon', name: '恶魔阵营' },
  { id: 'nature', name: '自然阵营' }
];

// =============================================================
// 2. 角色配置 (子级, 归属某个阵营)
//    新增角色: 复制下面一段, 改 id / name / faction / 数值 / skills 即可
// =============================================================
const CHARACTERS = [
  // ===== 角色模板 开始 =====
  {
    id: 'warrior',
    faction: 'human',       // 必须和 FACTIONS 里的 id 对应
    name: '战士',
    desc: '高血量, 近战强力',
    maxHp: 35,
    maxAp: 3,
    startHandCount: 3,
    drawPerTurn: 1,
    skills: ['warrior_slash', 'warrior_shield']
  },
  // ===== 角色模板 结束 =====

  {
    id: 'mage',
    faction: 'human',
    name: '法师',
    desc: '高行动点, 擅长法术与召唤',
    maxHp: 26,
    maxAp: 4,
    startHandCount: 4,
    drawPerTurn: 1,
    skills: ['fireball', 'summon_imp']
  },

  {
    id: 'imp_lord',
    faction: 'demon',
    name: '恶魔领主',
    desc: '以仆从为主的恶魔',
    maxHp: 30,
    maxAp: 3,
    startHandCount: 3,
    drawPerTurn: 1,
    skills: ['summon_imp', 'fireball']
  },

  {
    id: 'druid',
    faction: 'nature',
    name: '德鲁伊',
    desc: '擅长环境与治疗',
    maxHp: 32,
    maxAp: 3,
    startHandCount: 3,
    drawPerTurn: 1,
    skills: ['heal_root', 'poison_cloud']
  }
];

// =============================================================
// 3. 技能配置
//    新增技能: 复制模板, 改 id / cost / cooldown / type / value 即可
// =============================================================
const SKILLS = [
  // ===== 技能模板 开始 =====
  {
    id: 'warrior_slash',
    name: '猛力斩击',
    cost: 2,
    cooldown: 2,            // 冷却单位: 大回合(轮), 即所有玩家都行动过一次算一轮
    type: 'attack',         // attack / heal / summon / buff
    target: 'enemy',        // enemy / self / enemy_minion
    value: 8,
    desc: '对敌方造成8点伤害, 冷却2回合'
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
    desc: '获得3点护盾, 持续1回合'
  },
  {
    id: 'fireball',
    name: '火球术',
    cost: 3,
    cooldown: 1,
    type: 'attack',
    target: 'enemy',
    value: 10,
    desc: '对敌方造成10点伤害'
  },
  {
    id: 'summon_imp',
    name: '召唤小鬼',
    cost: 2,
    cooldown: 4,
    type: 'summon',
    target: 'self',
    minionId: 'imp',
    desc: '召唤1只小鬼仆从'
  },
  {
    id: 'heal_root',
    name: '荆棘治愈',
    cost: 2,
    cooldown: 2,
    type: 'heal',
    target: 'self',
    value: 6,
    desc: '回复6点生命'
  },
  {
    id: 'poison_cloud',
    name: '毒雾术',
    cost: 2,
    cooldown: 3,
    type: 'env',
    target: 'all',
    effect: { name: '毒雾', damage: 2, duration: 2 },
    desc: '释放毒雾, 全场每轮受2点伤害'
  }
];

// =============================================================
// 3.5 阵营技能配置 (每个阵营可以有任意多个被动 + 任意多个主动)
//     被动在每个玩家主回合前自动结算
//     主动技能所有该阵营角色都能用
//     新增技能: 复制下面一段, 改 id 和数值即可
// =============================================================
const FACTION_SKILLS = [
  {
    faction: 'human',        // 对应 FACTIONS 里的 id
    // ===== 被动技能数组 (想加几个加几个) =====
    passives: [
      {
        id: 'human_vigor',
        name: '人类韧性',
        desc: '每轮开始自动回复2点生命',
        onRoundStart: { heal: 2 }
      },
      // 复制这一段就能加第二个被动
      {
        id: 'human_courage',
        name: '人类勇气',
        desc: '每轮开始对敌方造成1点伤害',
        onRoundStart: { damage: 1, target: 'enemies' }
      }
    ],
    // ===== 主动技能数组 (想加几个加几个) =====
    actives: [
      {
        id: 'human_rally',
        name: '鼓舞士气',
        cost: 1,
        cooldown: 2,               // 单位: 轮
        type: 'buff',
        target: 'self',
        value: 3,
        desc: '本回合攻击+3',
        roll: null
      },
      // 复制这一段就能加第二个主动
      {
        id: 'human_smite',
        name: '神圣打击',
        cost: 2,
        cooldown: 2,
        type: 'attack',
        target: 'enemy',
        value: 6,
        desc: '造成6点伤害, 掷骰>=12则双倍',
        roll: { min: 12, double: true }
      }
    ]
  },

  {
    faction: 'demon',
    passives: [
      {
        id: 'demon_bloodlust',
        name: '恶魔嗜血',
        desc: '每轮开始对敌方全体造成1点伤害',
        onRoundStart: { damage: 1, target: 'enemies' }
      }
    ],
    actives: [
      {
        id: 'demon_crush',
        name: '恶魔粉碎',
        cost: 2,
        cooldown: 2,
        type: 'attack',
        target: 'enemy',
        value: 5,
        desc: '造成5点伤害, 掷骰>=15则双倍',
        roll: { min: 15, double: true }
      }
    ]
  },

  {
    faction: 'nature',
    passives: [
      {
        id: 'nature_regrowth',
        name: '自然再生',
        desc: '每轮开始回复1点生命, 并对敌方造成1点伤害',
        onRoundStart: { heal: 1, damage: 1, target: 'enemies' }
      }
    ],
    actives: [
      {
        id: 'nature_thorns',
        name: '荆棘护甲',
        cost: 1,
        cooldown: 2,
        type: 'buff',
        target: 'self',
        value: 3,
        desc: '获得3点护盾',
        roll: null
      }
    ]
  }
];

// =============================================================
// 4. 仆从模板
// =============================================================
const MINION_TEMPLATES = [
  { id: 'imp', name: '小鬼', maxHp: 5, attack: 2, desc: '脆弱但迅捷' },
  { id: 'wolf', name: '森林狼', maxHp: 8, attack: 3, desc: '野性的猎手' }
];

// =============================================================
// 5. 装备配置 (每件带描述, 前端会展示在悬浮窗里)
// =============================================================
const EQUIPMENTS = [
  {
    id: 'iron_sword',
    name: '铁剑',
    slot: 'weapon',
    stats: { attackBonus: 2, maxHpBonus: 0, apBonus: 0 },
    accessorySlots: 2,
    desc: '攻击力+2'
  },
  {
    id: 'leather_armor',
    name: '皮甲',
    slot: 'armor',
    stats: { attackBonus: 0, maxHpBonus: 5, apBonus: 0 },
    accessorySlots: 2,
    desc: '最大生命+5'
  },
  {
    id: 'power_ring',
    name: '力量戒指',
    slot: 'trinket',
    stats: { attackBonus: 1, maxHpBonus: 2, apBonus: 0 },
    accessorySlots: 2,
    desc: '攻击+1, 生命+2'
  }
];

// =============================================================
// 6. 配件配置
// =============================================================
const ACCESSORIES = [
  { id: 'sharp_gem',  name: '锋利宝石', stats: { attackBonus: 1 },       desc: '攻击+1' },
  { id: 'life_gem',   name: '生命宝石', stats: { maxHpBonus: 3 },       desc: '生命+3' },
  { id: 'power_gem',  name: '法力宝石', stats: { apBonus: 1 },          desc: '行动点+1' }
];

// =============================================================
// 7. 卡牌池 (装备/配件卡也混在这里抽取)
// =============================================================
const CARDS = [
  { id: 'strike', name: '打击', cost: 1, type: 'attack', target: 'enemy',
    value: 3, effect: null, desc: '造成3点伤害' },
  { id: 'heavy', name: '重击', cost: 2, type: 'attack', target: 'enemy',
    value: 6, effect: null, desc: '造成6点伤害' },
  { id: 'burn', name: '灼烧', cost: 1, type: 'debuff', target: 'enemy',
    value: 0, effect: { type: 'player', name: '灼烧', damage: 2, duration: 2 },
    desc: '施加灼烧, 每回合2点伤害' },
  { id: 'heal', name: '治疗', cost: 2, type: 'heal', target: 'self',
    value: 5, effect: null, desc: '回复5点生命' },
  { id: 'poison_fog', name: '毒雾', cost: 2, type: 'env', target: 'all',
    value: 0, effect: { type: 'env', name: '毒雾', damage: 2, duration: 2 },
    desc: '释放毒雾, 全场每轮受2点伤害' },

  // 装备卡
  { id: 'card_iron_sword',   name: '装备:铁剑', cost: 1, type: 'equipment',
    target: 'self', equipmentId: 'iron_sword',   desc: '装备一把铁剑' },
  { id: 'card_leather_armor',name: '装备:皮甲', cost: 1, type: 'equipment',
    target: 'self', equipmentId: 'leather_armor',desc: '装备一件皮甲' },
  { id: 'card_power_ring',  name: '装备:力量戒指', cost: 1, type: 'equipment',
    target: 'self', equipmentId: 'power_ring',   desc: '装备一枚力量戒指' },

  // 配件卡
  { id: 'card_sharp_gem', name: '配件:锋利宝石', cost: 0, type: 'accessory',
    target: 'self', accessoryId: 'sharp_gem', desc: '镶嵌到装备上' },
  { id: 'card_life_gem',  name: '配件:生命宝石', cost: 0, type: 'accessory',
    target: 'self', accessoryId: 'life_gem',  desc: '镶嵌到装备上' },
  { id: 'card_power_gem', name: '配件:法力宝石', cost: 1, type: 'accessory',
    target: 'self', accessoryId: 'power_gem', desc: '镶嵌到装备上' }
];

module.exports = {
  FACTIONS, CHARACTERS, SKILLS, FACTION_SKILLS, MINION_TEMPLATES,
  EQUIPMENTS, ACCESSORIES, CARDS
};
//（注：内容由AI生成）
