/**
 * 联机卡牌对战 v3 - 服务端 (多人版)
 * 支持: 最多7人 / 最少2人 / 房主手动开始 / 全员准备校验 / 多人轮流
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  FACTIONS, CHARACTERS, SKILLS, FACTION_SKILLS, MINION_TEMPLATES,
  EQUIPMENTS, ACCESSORIES, CARDS
} = require('./gameConfig');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

const MAX_PLAYERS = 7;
const MIN_PLAYERS = 2;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ---------- 工具 ----------
const byId = (arr, id) => arr.find(x => x.id === id);
function drawCards(count) {
  const hand = [];
  for (let i = 0; i < count; i++) {
    const c = CARDS[Math.floor(Math.random() * CARDS.length)];
    hand.push({ ...c, uid: Date.now() + Math.random() + Math.random() });
  }
  return hand;
}
function calcBonus(player) {
  let b = { attack: 0, maxHp: 0, ap: 0 };
  (player.equipment || []).forEach(eq => {
    if (!eq || !eq.id) return;
    const tpl = byId(EQUIPMENTS, eq.id);
    if (tpl && tpl.stats) {
      b.attack += tpl.stats.attackBonus || 0;
      b.maxHp  += tpl.stats.maxHpBonus  || 0;
      b.ap     += tpl.stats.apBonus     || 0;
    }
    (eq.accessories || []).forEach(acc => {
      if (!acc || !acc.id) return;
      const aTpl = byId(ACCESSORIES, acc.id);
      if (aTpl && aTpl.stats) {
        b.attack += aTpl.stats.attackBonus || 0;
        b.maxHp  += aTpl.stats.maxHpBonus  || 0;
        b.ap     += aTpl.stats.apBonus     || 0;
      }
    });
  });
  b.attack += player.tempAttack || 0;  // buff 技能的临时攻击加成
  return b;
}

// ---------- 房间 ----------
const rooms = {};
let waitingRoom = null;

function newRoom() {
  return {
    id: 'room-' + Math.random().toString(36).slice(2, 8),
    players: [],
    phase: 'lobby',   // lobby(大厅) → select(选角) → main/minion/env(战斗) → over
    turn: 0,
    envEffects: [],
    roundCounter: 0,
    winner: null
  };
}
function joinRoom(socket) {
  // 找一个仍在大厅阶段、还没满人的房间
  let room = waitingRoom;
  if (!room || room.phase !== 'lobby' || room.players.length >= MAX_PLAYERS) {
    room = newRoom();
    rooms[room.id] = room;
    waitingRoom = room;
  }
  const index = room.players.length;
  const player = {
    id: socket.id,
    index,
    isHost: index === 0,
    charId: null,
    ready: false,
    name: `玩家${index + 1}`,
    hp: 0, maxHp: 0,
    ap: 0, maxAp: 0,
    drawPerTurn: 1,
    hand: [],
    effects: [],
    skills: [],
    equipment: [null, null, null].map(() => ({ id: null, accessories: [null, null] })),
    minions: [],
    alive: true
  };
  room.players.push(player);
  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.index = index;
  return { room, player };
}
function snapshot(room) {
  return {
    id: room.id,
    phase: room.phase,
    turn: room.turn,
    envEffects: room.envEffects,
    winner: room.winner,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    players: room.players.map(p => ({
      index: p.index,
      isHost: p.isHost,
      charId: p.charId,
      ready: p.ready,
      name: p.name,
      hp: p.hp, maxHp: p.maxHp,
      ap: p.ap, maxAp: p.maxAp,
      hand: p.hand,
      effects: p.effects,
      skills: p.skills,
      equipment: p.equipment,
      minions: p.minions,
      alive: p.alive
    }))
  };
}
function broadcast(roomId, event, data) { io.to(roomId).emit(event, data); }
function broadcastLog(roomId, text) { broadcast(roomId, 'actionLog', { message: text }); }

// ---------- 找下一个存活玩家 ----------
function nextAliveIndex(room, fromIndex) {
  const n = room.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (fromIndex + step) % n;
    if (room.players[idx].alive) return idx;
  }
  return -1;
}
function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

// ---------- 开始游戏 ----------
function startGame(room) {
  room.players.forEach(p => {
    const tpl = byId(CHARACTERS, p.charId);
    p.name = tpl.name;
    p.maxHp = tpl.maxHp; p.hp = tpl.maxHp;
    p.maxAp = tpl.maxAp; p.ap = tpl.maxAp;
    p.drawPerTurn = tpl.drawPerTurn;
    p.hand = drawCards(tpl.startHandCount);
    p.effects = [];
    // 角色自带技能 + 阵营所有主动技能
    const allSkillIds = [...(tpl.skills || [])];
    const factionSkill = FACTION_SKILLS.find(f => f.faction === tpl.faction);
    if (factionSkill && factionSkill.actives) {
      factionSkill.actives.forEach(a => allSkillIds.push(a.id));
    }
    p.skills = allSkillIds.map(sid => ({ id: sid, currentCd: 0 }));
    p.equipment = [null, null, null].map(() => ({ id: null, accessories: [null, null] }));
    p.minions = [];
    p.alive = true;
    p.ready = false;
  });
  room.turn = 0;
  room.roundCounter = 0;
  room.envEffects = [];
  room.winner = null;
  broadcastLog(room.id, `--- 游戏开始! 共 ${room.players.length} 名玩家 ---`);
  startNewTurn(room.id);
}

function startNewTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.phase = 'env';
  broadcast(roomId, 'state', snapshot(room));

  // 环境效果: 所有存活玩家都行动过一次后才结算
  if (room.roundCounter >= alivePlayers(room).length) {
    let totalDmg = 0;
    room.envEffects.forEach(e => { totalDmg += e.damage; e.duration--; });
    if (totalDmg > 0) {
      alivePlayers(room).forEach(p => {
        if (p.id !== room._lastEnvSource) {
          p.hp = Math.max(0, p.hp - totalDmg);
          p.minions.forEach(m => m.hp = Math.max(0, m.hp - totalDmg));
        }
      });
      broadcastLog(roomId, `环境效果【${room.envEffects.map(e => e.name).join('/')}】造成全场 ${totalDmg} 点伤害(释放者免疫)`);
    }
    room.envEffects = room.envEffects.filter(e => e.duration > 0);
    room.roundCounter = 0;

    // 所有玩家行动完一轮后, 全场技能冷却 -1 (按轮计算)
    alivePlayers(room).forEach(p => {
      p.skills.forEach(s => { if (s.currentCd > 0) s.currentCd--; });
    });
  }

  // 个人持续伤害
  setTimeout(() => {
    alivePlayers(room).forEach(p => {
      let dmg = 0;
      p.effects.forEach(e => { if (e.type === 'player') { dmg += e.damage; e.duration--; } });
      if (dmg > 0) {
        p.hp = Math.max(0, p.hp - dmg);
        broadcastLog(roomId, `${p.name} 受到持续伤害 ${dmg} 点`);
      }
      p.effects = p.effects.filter(e => e.duration > 0);
    });
    room.players.forEach(p => { if (p.hp <= 0) p.alive = false; });

    if (checkGameOver(roomId)) return;

    // 阵营被动技能结算: 只结算当前回合玩家的被动
    const curPlayer = room.players[room.turn];
    if (curPlayer && curPlayer.alive) {
      const charTpl = byId(CHARACTERS, curPlayer.charId);
      const fs = FACTION_SKILLS.find(f => f.faction === charTpl.faction);
      if (fs && fs.passives) {
        fs.passives.forEach(passive => {
          if (!passive.onRoundStart) return;
          const eff = passive.onRoundStart;
          if (eff.heal) {
            curPlayer.hp = Math.min(curPlayer.maxHp, curPlayer.hp + eff.heal);
            broadcastLog(roomId, `${curPlayer.name} 的【${passive.name}】回复了 ${eff.heal} 点生命`);
          }
          if (eff.damage) {
            alivePlayers(room).forEach(e => {
              if (e.id === curPlayer.id) return;
              e.hp = Math.max(0, e.hp - eff.damage);
            });
            broadcastLog(roomId, `${curPlayer.name} 的【${passive.name}】对敌方造成 ${eff.damage} 点伤害`);
          }
        });
      }
    }
    room.players.forEach(p => { if (p.hp <= 0) p.alive = false; });
    if (checkGameOver(roomId)) return;

    setTimeout(() => {
      room.phase = 'main';
      const cur = room.players[room.turn];
      const bonus = calcBonus(cur);
      cur.ap = cur.maxAp + bonus.ap;
      cur.maxHp = byId(CHARACTERS, cur.charId).maxHp + calcBonus(cur).maxHp;
      cur.hand.push(...drawCards(cur.drawPerTurn));
      broadcast(roomId, 'state', snapshot(room));
      broadcastLog(roomId, `--- ${cur.name} 的回合 ---`);
      broadcast(roomId, 'danhaku', { text: `${cur.name} 的回合!`, duration: 2000 });
    }, 600);
  }, 600);
}

function enterMinionPhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.phase = 'minion';
  broadcast(roomId, 'state', snapshot(room));
  const cur = room.players[room.turn];
  broadcastLog(roomId, `--- ${cur.name} 的仆从行动阶段 ---`);
  broadcast(roomId, 'danhaku', { text: '仆从行动阶段!', duration: 2000 });
}

function checkGameOver(roomId) {
  const room = rooms[roomId];
  if (!room) return false;
  const alive = alivePlayers(room);
  if (alive.length <= 1) {
    room.phase = 'over';
    room.winner = alive.length === 1 ? alive[0].name : '平局';
    broadcastLog(roomId, `游戏结束, ${room.winner} 获胜!`);
    broadcast(roomId, 'gameOver', { winner: room.winner });
    return true;
  }
  return false;
}

// ---------- Socket 事件 ----------
io.on('connection', (socket) => {
  console.log('[+]', socket.id);
  const { room, player } = joinRoom(socket);

  socket.emit('config', {
    factions: FACTIONS, characters: CHARACTERS, skills: SKILLS,
    factionSkills: FACTION_SKILLS,
    minionTemplates: MINION_TEMPLATES, equipments: EQUIPMENTS, accessories: ACCESSORIES
  });
  socket.emit('joined', { index: player.index, isHost: player.isHost });
  broadcast(room.id, 'state', snapshot(room));

  // 选角
  socket.on('selectCharacter', (charId) => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'select') return;
    const p = r.players[socket.data.index];
    if (!byId(CHARACTERS, charId)) return;
    p.charId = charId;
    broadcast(r.id, 'state', snapshot(r));
  });

  // 准备
  socket.on('toggleReady', () => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'select') return;
    const p = r.players[socket.data.index];
    if (!p.charId) return;
    p.ready = !p.ready;
    broadcast(r.id, 'state', snapshot(r));
  });

  // 房主: 从大厅进入选角
  socket.on('lobbyStartSelect', () => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'lobby') return;
    const p = r.players[socket.data.index];
    if (!p.isHost) return;
    r.phase = 'select';
    broadcastLog(r.id, '--- 进入选角阶段 ---');
    broadcast(r.id, 'state', snapshot(r));
  });

  // 房主开始游戏
  socket.on('hostStart', () => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'select') return;
    const p = r.players[socket.data.index];
    if (!p.isHost) return; // 只有房主能开始
    if (r.players.length < MIN_PLAYERS) {
      return socket.emit('errorMsg', { message: `至少需要 ${MIN_PLAYERS} 名玩家才能开始` });
    }
    const allReady = r.players.every(x => x.charId && x.ready);
    if (!allReady) {
      return socket.emit('errorMsg', { message: '还有玩家未选角或未准备' });
    }
    startGame(r);
  });

  // 出牌
  socket.on('playCard', ({ cardUid, targetType, targetId, equipmentSlot }) => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'main' || r.turn !== socket.data.index) return;
    const self = r.players[socket.data.index];
    const card = self.hand.find(c => c.uid === cardUid);
    if (!card || self.ap < card.cost) return;
    self.ap -= card.cost;
    self.hand = self.hand.filter(c => c.uid !== cardUid);

    let log = '';
    const bonus = calcBonus(self);

    switch (card.type) {
      case 'attack': {
        const t = r.players[targetId];
        if (!t || !t.alive) return;
        const dmg = (card.value || 0) + bonus.attack;
        t.hp = Math.max(0, t.hp - dmg);
        t.alive = t.hp > 0;
        log = `${self.name} 使用【${card.name}】, 对 ${t.name} 造成 ${dmg} 点伤害`;
        break;
      }
      case 'attack_minion': {
        // targetId 格式: "playerIndex:minionUid"
        const [pIdx, mUid] = String(targetId).split(':');
        const t = r.players[Number(pIdx)];
        const m = t && t.minions.find(x => x.uid === mUid);
        if (!m) return;
        m.hp = Math.max(0, m.hp - ((card.value || 0) + bonus.attack));
        t.minions = t.minions.filter(x => x.hp > 0);
        log = `${self.name} 使用【${card.name}】, 攻击 ${t.name} 的【${m.name}】`;
        break;
      }
      case 'debuff': {
        const t = r.players[targetId];
        if (!t || !t.alive) return;
        t.effects.push({ ...card.effect });
        log = `${self.name} 对 ${t.name} 施加【${card.effect.name}】`;
        break;
      }
      case 'heal':
        self.hp = Math.min(self.maxHp, self.hp + (card.value || 0));
        log = `${self.name} 使用【${card.name}】, 回复 ${card.value} 点生命`;
        break;
      case 'env':
        r.envEffects.push({ ...card.effect, sourceId: self.id });
        r._lastEnvSource = self.id;
        log = `${self.name} 释放环境效果【${card.effect.name}】`;
        break;
      case 'equipment': {
        const slot = self.equipment.findIndex(e => !e.id);
        if (slot !== -1) {
          self.equipment[slot] = { id: card.equipmentId, accessories: [null, null] };
          self.maxHp = byId(CHARACTERS, self.charId).maxHp + calcBonus(self).maxHp;
          log = `${self.name} 装备了【${byId(EQUIPMENTS, card.equipmentId).name}】`;
        }
        break;
      }
      case 'accessory': {
        // 指定装备槽位，装到对应装备上
        if (equipmentSlot !== undefined && equipmentSlot !== null) {
          const eq = self.equipment[equipmentSlot];
          if (eq && eq.id) {
            const accSlot = eq.accessories.findIndex(a => !a);
            if (accSlot !== -1) {
              eq.accessories[accSlot] = { id: card.accessoryId };
              self.maxHp = byId(CHARACTERS, self.charId).maxHp + calcBonus(self).maxHp;
              log = `${self.name} 在【${byId(EQUIPMENTS, eq.id).name}】上镶嵌配件【${byId(ACCESSORIES, card.accessoryId).name}】`;
            }
          }
        } else {
          // 没指定槽位，自动找第一个有空位的
          for (let i = 0; i < self.equipment.length; i++) {
            const eq = self.equipment[i];
            if (!eq.id) continue;
            const accSlot = eq.accessories.findIndex(a => !a);
            if (accSlot !== -1) {
              eq.accessories[accSlot] = { id: card.accessoryId };
              self.maxHp = byId(CHARACTERS, self.charId).maxHp + calcBonus(self).maxHp;
              log = `${self.name} 镶嵌配件【${byId(ACCESSORIES, card.accessoryId).name}】`;
              break;
            }
          }
        }
        break;
      }
    }
    broadcastLog(r.id, log);
    broadcast(r.id, 'state', snapshot(r));
    checkGameOver(r.id);
  });

  // 技能
  socket.on('useSkill', ({ skillId, targetType, targetId }) => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'main' || r.turn !== socket.data.index) return;
    const self = r.players[socket.data.index];
    const data = self.skills.find(s => s.id === skillId);
    // 找模板: 先从普通技能找, 再从阵营主动技能找
    let tpl = byId(SKILLS, skillId);
    if (!tpl) {
      for (const fs of FACTION_SKILLS) {
        if (!fs.actives) continue;
        tpl = fs.actives.find(a => a.id === skillId);
        if (tpl) break;
      }
    }
    if (!data || !tpl || data.currentCd > 0 || self.ap < tpl.cost) return;
    self.ap -= tpl.cost;
    data.currentCd = tpl.cooldown;

    // 掷骰判定 (所有技能类型通用)
    let rollResult = null;
    let multiplier = 1;
    if (tpl.roll) {
      rollResult = Math.floor(Math.random() * 20) + 1;
      if (rollResult >= tpl.roll.min) {
        multiplier = tpl.roll.double ? 2 : (tpl.roll.multiplier || 2);
      }
      broadcast(r.id, 'diceResult', {
        player: self.name,
        skill: tpl.name,
        roll: rollResult,
        min: tpl.roll.min,
        success: rollResult >= tpl.roll.min
      });
    }

    let log = '';
    const bonus = calcBonus(self);
    const effVal = (tpl.value || 0) * multiplier;
    const rollSuffix = rollResult ? ` (掷骰 ${rollResult}${multiplier > 1 ? ' ✨双倍!' : ''})` : '';
    switch (tpl.type) {
      case 'attack': {
        const t = r.players[targetId];
        if (!t || !t.alive) return;
        const dmg = effVal + bonus.attack;
        t.hp = Math.max(0, t.hp - dmg);
        t.alive = t.hp > 0;
        log = `${self.name} 释放技能【${tpl.name}】, 对 ${t.name} 造成 ${dmg} 点伤害${rollSuffix}`;
        break;
      }
      case 'heal':
        self.hp = Math.min(self.maxHp, self.hp + effVal);
        log = `${self.name} 释放技能【${tpl.name}】, 回复 ${effVal} 点生命${rollSuffix}`;
        break;
      case 'buff':
        self.tempAttack = (self.tempAttack || 0) + effVal;
        log = `${self.name} 释放技能【${tpl.name}】, 本回合攻击+${effVal}${rollSuffix}`;
        break;
      case 'summon': {
        const mtpl = byId(MINION_TEMPLATES, tpl.minionId);
        self.minions.push({ uid: Date.now() + Math.random(), ...mtpl, hp: mtpl.maxHp });
        log = `${self.name} 召唤了仆从【${mtpl.name}】`;
        break;
      }
      case 'env':
        r.envEffects.push({ ...tpl.effect, sourceId: self.id });
        r._lastEnvSource = self.id;
        log = `${self.name} 释放环境技能【${tpl.name}】`;
        break;
    }
    broadcastLog(r.id, log);
    broadcast(r.id, 'state', snapshot(r));
    checkGameOver(r.id);
  });

  // 仆从攻击
  socket.on('minionAttack', ({ minionUid, targetType, targetId }) => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'minion' || r.turn !== socket.data.index) return;
    const self = r.players[socket.data.index];
    const m = self.minions.find(x => x.uid === minionUid);
    if (!m || m.hasAttacked) return;
    m.hasAttacked = true;

    let log = '';
    if (targetType === 'player') {
      const t = r.players[targetId];
      if (!t || !t.alive) return;
      t.hp = Math.max(0, t.hp - m.attack);
      t.alive = t.hp > 0;
      log = `${self.name} 的仆从【${m.name}】攻击 ${t.name}, 造成 ${m.attack} 点伤害`;
    } else if (targetType === 'minion') {
      const [pIdx, mUid] = String(targetId).split(':');
      const t = r.players[Number(pIdx)];
      const tm = t && t.minions.find(x => x.uid === mUid);
      if (!tm) return;
      tm.hp = Math.max(0, tm.hp - m.attack);
      t.minions = t.minions.filter(x => x.hp > 0);
      log = `${self.name} 的仆从【${m.name}】攻击 ${t.name} 的仆从【${tm.name}】`;
    }
    broadcastLog(r.id, log);
    broadcast(r.id, 'state', snapshot(r));
    checkGameOver(r.id);
  });

  // 结束主回合 → 仆从阶段
  socket.on('endMainTurn', () => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'main' || r.turn !== socket.data.index) return;
    broadcastLog(r.id, `${r.players[socket.data.index].name} 结束主回合`);
    enterMinionPhase(r.id);
  });

  // 结束仆从阶段 → 下一个存活玩家
  socket.on('endMinionTurn', () => {
    const r = rooms[socket.data.roomId];
    if (!r || r.phase !== 'minion' || r.turn !== socket.data.index) return;
    const self = r.players[socket.data.index];
    self.minions.forEach(m => m.hasAttacked = false);
    self.tempAttack = 0;  // 回合结束清除临时攻击加成
    broadcastLog(r.id, `${self.name} 仆从行动结束`);
    r.roundCounter++;
    r.turn = nextAliveIndex(r, r.turn);
    startNewTurn(r.id);
  });

  // 重新开始 → 回到大厅
  socket.on('restart', () => {
    const r = rooms[socket.data.roomId];
    if (!r) return;
    r.phase = 'lobby';
    r.players.forEach(p => { p.charId = null; p.ready = false; });
    r.envEffects = [];
    r.roundCounter = 0;
    r.winner = null;
    broadcastLog(r.id, '--- 回到大厅 ---');
    broadcast(r.id, 'state', snapshot(r));
  });

  socket.on('disconnect', () => {
    if (rooms[socket.data.roomId]) {
      const r = rooms[socket.data.roomId];
      broadcastLog(socket.data.roomId, '有玩家断线');
      delete rooms[socket.data.roomId];
      waitingRoom = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 服务器启动 http://0.0.0.0:${PORT} (最多${MAX_PLAYERS}人, 最少${MIN_PLAYERS}人)`);
});
//（注：内容由AI生成）
