const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  CHARACTERS, SKILLS, MINION_TEMPLATES,
  EQUIPMENTS, ACCESSORIES, CARDS,
  DEFAULT_CHARACTER_ID
} = require('./gameConfig');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = 3001;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 工具函数
function getCharacterById(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}
function getSkillById(id) {
  return SKILLS.find(s => s.id === id);
}
function getMinionTemplateById(id) {
  return MINION_TEMPLATES.find(m => m.id === id);
}
function getEquipmentById(id) {
  return EQUIPMENTS.find(e => e.id === id);
}
function getAccessoryById(id) {
  return ACCESSORIES.find(a => a.id === id);
}
function drawCards(count) {
  const hand = [];
  for (let i = 0; i < count; i++) {
    const card = CARDS[Math.floor(Math.random() * CARDS.length)];
    hand.push({ ...card, uid: Date.now() + Math.random() });
  }
  return hand;
}
function calcPlayerStats(player) {
  let bonus = { attack: 0, maxHp: 0, ap: 0 };
  player.equipment.forEach(eq => {
    if (!eq) return;
    const tpl = getEquipmentById(eq.id);
    if (tpl?.stats) {
      bonus.attack += tpl.stats.attackBonus || 0;
      bonus.maxHp += tpl.stats.maxHpBonus || 0;
      bonus.ap += tpl.stats.apBonus || 0;
    }
    eq.accessories.forEach(acc => {
      if (!acc) return;
      const accTpl = getAccessoryById(acc.id);
      if (accTpl?.stats) {
        bonus.attack += accTpl.stats.attackBonus || 0;
        bonus.maxHp += accTpl.stats.maxHpBonus || 0;
        bonus.ap += accTpl.stats.apBonus || 0;
      }
    });
  });
  return bonus;
}

let rooms = {};

io.on('connection', (socket) => {
  console.log('玩家连接:', socket.id);
  let roomId = null;
  let playerIndex = -1;

  // 匹配房间
  for (const r in rooms) {
    if (rooms[r].players.length < 2) {
      roomId = r;
      break;
    }
  }
  if (!roomId) {
    roomId = `room_${Date.now()}`;
    rooms[roomId] = {
      players: [],
      turn: 0,
      phase: 'waiting',
      envEffects: [],
    };
  }

  socket.join(roomId);
  playerIndex = rooms[roomId].players.length;
  const charTpl = getCharacterById(DEFAULT_CHARACTER_ID);

  // 初始化玩家数据
  const player = {
    id: socket.id,
    charId: charTpl.id,
    name: `玩家${playerIndex + 1}`,
    hp: charTpl.maxHp,
    maxHp: charTpl.maxHp,
    ap: charTpl.maxAp,
    maxAp: charTpl.maxAp,
    drawPerTurn: charTpl.drawPerTurn,
    hand: drawCards(charTpl.startHandCount),
    effects: [],
    // 技能系统
    skills: charTpl.skills.map(sid => ({ id: sid, currentCd: 0 })),
    // 装备系统：3个装备槽，每个槽2个配件
    equipment: [null, null, null].map(() => ({ id: null, accessories: [null, null] })),
    // 仆从系统
    minions: []
  };
  rooms[roomId].players.push(player);

  socket.emit('init', { playerIndex, name: player.name });
  if (rooms[roomId].players.length === 2) startNewTurn(roomId);

  function broadcastState(roomId) {
    io.to(roomId).emit('state', rooms[roomId]);
  }
  function addLog(roomId, msg) {
    socket.to(roomId).emit('actionLog', { message: msg });
  }

  // 新回合流程：环境阶段 → 主回合 → 仆从回合
  function startNewTurn(roomId) {
    const room = rooms[roomId];
    room.phase = 'env';
    broadcastState(roomId);
    addLog(roomId, '--- 进入环境阶段 ---');

    // 1. 全局环境伤害（最高优先级）
    let envDamage = 0;
    room.envEffects.forEach(e => { envDamage += e.damage; e.duration--; });
    if (envDamage > 0) {
      room.players.forEach(p => {
        p.hp = Math.max(0, p.hp - envDamage);
        p.minions.forEach(m => { m.hp = Math.max(0, m.hp - envDamage); });
      });
      addLog(roomId, `环境效果造成全体 ${envDamage} 点伤害`);
    }
    room.envEffects = room.envEffects.filter(e => e.duration > 0);

    // 2. 玩家持续伤害
    setTimeout(() => {
      room.players.forEach(p => {
        let dmg = 0;
        p.effects.forEach(e => { if (e.type === 'player') { dmg += e.damage; e.duration--; } });
        if (dmg > 0) {
          p.hp = Math.max(0, p.hp - dmg);
          addLog(roomId, `${p.name} 受到持续伤害 ${dmg} 点`);
        }
        p.effects = p.effects.filter(e => e.duration > 0);
      });

      if (checkGameOver(roomId)) return;

      // 3. 进入主回合
      setTimeout(() => {
        const curr = room.players[room.turn];
        room.phase = 'main';
        curr.ap = curr.maxAp + calcPlayerStats(curr).ap;
        curr.hand.push(...drawCards(curr.drawPerTurn));
        // 技能冷却-1
        curr.skills.forEach(s => { if (s.currentCd > 0) s.currentCd--; });
        broadcastState(roomId);
        addLog(roomId, `--- ${curr.name} 的主回合 ---`);
      }, 800);
    }, 800);
  }

  // 进入仆从回合
  function enterMinionPhase(roomId) {
    const room = rooms[roomId];
    room.phase = 'minion';
    broadcastState(roomId);
    addLog(roomId, '--- 仆从行动阶段 ---');
  }

  // 出牌
  socket.on('playCard', (cardUid, targetType, targetId) => {
    const room = rooms[roomId];
    if (room.phase !== 'main' || room.turn !== playerIndex) return;
    const self = room.players[playerIndex];
    const card = self.hand.find(c => c.uid === cardUid);
    if (!card || self.ap < card.cost) return;

    self.ap -= card.cost;
    self.hand = self.hand.filter(c => c.uid !== cardUid);
    let log = '';
    const stats = calcPlayerStats(self);

    switch (card.type) {
      case 'attack':
        const target = room.players[targetId];
        const dmg = card.value + stats.attack;
        target.hp = Math.max(0, target.hp - dmg);
        log = `${self.name} 使用【${card.name}】，造成 ${dmg} 点伤害`;
        break;
      case 'attack_minion':
        const enemy = room.players[1 - playerIndex];
        const minion = enemy.minions.find(m => m.uid === targetId);
        if (minion) {
          minion.hp = Math.max(0, minion.hp - (card.value + stats.attack));
          log = `${self.name} 攻击仆从【${minion.name}】，造成 ${card.value + stats.attack} 点伤害`;
          enemy.minions = enemy.minions.filter(m => m.hp > 0);
        }
        break;
      case 'debuff':
        room.players[targetId].effects.push({ ...card.effect });
        log = `${self.name} 施加【${card.effect.name}】`;
        break;
      case 'heal':
        self.hp = Math.min(self.maxHp + stats.maxHp, self.hp + card.value);
        log = `${self.name} 使用【${card.name}】，回复 ${card.value} 点生命`;
        break;
      case 'env':
        room.envEffects.push({ ...card.effect });
        log = `${self.name} 释放环境【${card.effect.name}】`;
        break;
      case 'equipment':
        const eqTpl = getEquipmentById(card.equipmentId);
        const emptySlot = self.equipment.findIndex(e => !e.id);
        if (emptySlot !== -1) {
          self.equipment[emptySlot] = { id: card.equipmentId, accessories: [null, null] };
          // 更新血量上限
          self.maxHp = charTpl.maxHp + calcPlayerStats(self).maxHp;
          log = `${self.name} 装备了【${eqTpl.name}】`;
        }
        break;
      case 'accessory':
        const accTpl = getAccessoryById(card.accessoryId);
        // 找第一个有空配件槽的装备
        for (let eq of self.equipment) {
          if (!eq.id) continue;
          const accSlot = eq.accessories.findIndex(a => !a);
          if (accSlot !== -1) {
            eq.accessories[accSlot] = { id: card.accessoryId };
            self.maxHp = charTpl.maxHp + calcPlayerStats(self).maxHp;
            log = `${self.name} 镶嵌了配件【${accTpl.name}】`;
            break;
          }
        }
        break;
    }

    addLog(roomId, log);
    broadcastState(roomId);
    checkGameOver(roomId);
  });

  // 使用技能
  socket.on('useSkill', (skillId, targetType, targetId) => {
    const room = rooms[roomId];
    if (room.phase !== 'main' || room.turn !== playerIndex) return;
    const self = room.players[playerIndex];
    const skillData = self.skills.find(s => s.id === skillId);
    const skillTpl = getSkillById(skillId);
    if (!skillData || skillData.currentCd > 0 || self.ap < skillTpl.cost) return;

    self.ap -= skillTpl.cost;
    skillData.currentCd = skillTpl.cooldown;
    let log = '';
    const stats = calcPlayerStats(self);

    switch (skillTpl.type) {
      case 'attack':
        const target = room.players[targetId];
        target.hp = Math.max(0, target.hp - (skillTpl.value + stats.attack));
        log = `${self.name} 释放技能【${skillTpl.name}】，造成 ${skillTpl.value + stats.attack} 点伤害`;
        break;
      case 'summon':
        const minionTpl = getMinionTemplateById(skillTpl.minionId);
        self.minions.push({
          uid: Date.now() + Math.random(),
          ...minionTpl,
          hp: minionTpl.maxHp
        });
        log = `${self.name} 召唤了仆从【${minionTpl.name}】`;
        break;
      case 'heal':
        self.hp = Math.min(self.maxHp + stats.maxHp, self.hp + skillTpl.value);
        log = `${self.name} 使用【${skillTpl.name}】回复生命`;
        break;
    }

    addLog(roomId, log);
    broadcastState(roomId);
    checkGameOver(roomId);
  });

  // 仆从攻击
  socket.on('minionAttack', (minionUid, targetType, targetId) => {
    const room = rooms[roomId];
    if (room.phase !== 'minion' || room.turn !== playerIndex) return;
    const self = room.players[playerIndex];
    const minion = self.minions.find(m => m.uid === minionUid);
    if (!minion || minion.hasAttacked) return;

    minion.hasAttacked = true;
    let log = '';

    if (targetType === 'player') {
      const target = room.players[targetId];
      target.hp = Math.max(0, target.hp - minion.attack);
      log = `仆从【${minion.name}】攻击 ${target.name}，造成 ${minion.attack} 点伤害`;
    } else if (targetType === 'minion') {
      const enemy = room.players[1 - playerIndex];
      const targetMinion = enemy.minions.find(m => m.uid === targetId);
      if (targetMinion) {
        targetMinion.hp = Math.max(0, targetMinion.hp - minion.attack);
        log = `仆从【${minion.name}】攻击对方仆从【${targetMinion.name}】`;
        enemy.minions = enemy.minions.filter(m => m.hp > 0);
      }
    }

    addLog(roomId, log);
    broadcastState(roomId);
    checkGameOver(roomId);
  });

  // 结束主回合 → 进入仆从回合
  socket.on('endMainTurn', () => {
    const room = rooms[roomId];
    if (room.phase !== 'main' || room.turn !== playerIndex) return;
    addLog(roomId, `${room.players[playerIndex].name} 结束主回合`);
    // 重置仆从攻击状态
    room.players[playerIndex].minions.forEach(m => m.hasAttacked = false);
    enterMinionPhase(roomId);
  });

  // 结束仆从回合 → 下一位玩家
  socket.on('endMinionTurn', () => {
    const room = rooms[roomId];
    if (room.phase !== 'minion' || room.turn !== playerIndex) return;
    addLog(roomId, `${room.players[playerIndex].name} 仆从行动结束`);
    room.turn = room.turn === 0 ? 1 : 0;
    startNewTurn(roomId);
  });

  function checkGameOver(roomId) {
    const room = rooms[roomId];
    const dead = room.players.find(p => p.hp <= 0);
    if (dead) {
      const winner = room.players.find(p => p.hp > 0);
      io.to(roomId).emit('gameOver', winner.name);
      return true;
    }
    return false;
  }

  socket.on('disconnect', () => {
    if (rooms[roomId]) {
      socket.to(roomId).emit('actionLog', { message: '对手已断开' });
      delete rooms[roomId];
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ 服务器启动 http://localhost:${PORT}`);
});
//（注：内容由AI生成）
