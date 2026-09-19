const socket = io();
let myIndex = -1;
let selectedCard = null;
let selectedSkill = null;
let selectedMinion = null;

const enemyName = document.getElementById('enemyName');
const enemyHp = document.getElementById('enemyHp');
const enemyEffects = document.getElementById('enemyEffects');
const enemyInfo = document.getElementById('enemyInfo');
const enemyMinions = document.getElementById('enemyMinions');
const enemyEquipTip = document.getElementById('enemyEquipTip');

const playerName = document.getElementById('playerName');
const playerHp = document.getElementById('playerHp');
const playerMaxHp = document.getElementById('playerMaxHp');
const playerAp = document.getElementById('playerAp');
const playerMaxAp = document.getElementById('playerMaxAp');
const playerEffects = document.getElementById('playerEffects');
const skillBar = document.getElementById('skillBar');
const playerMinions = document.getElementById('playerMinions');

const handArea = document.getElementById('handArea');
const endMainBtn = document.getElementById('endMainBtn');
const endMinionBtn = document.getElementById('endMinionBtn');
const logArea = document.getElementById('logArea');
const phaseTip = document.getElementById('phaseTip');
const equipList = document.getElementById('equipList');

socket.on('init', data => {
  myIndex = data.playerIndex;
  playerName.textContent = data.name;
});

socket.on('state', room => {
  const me = room.players[myIndex];
  const enemy = room.players[1 - myIndex];

  // 敌方信息
  if (enemy) {
    enemyName.textContent = enemy.name;
    enemyHp.textContent = `${enemy.hp}/${enemy.maxHp}`;
    enemyEffects.innerHTML = enemy.effects.map(e => `${e.name}(${e.duration})`).join(' ');
    renderMinions(enemyMinions, enemy.minions, 'enemy');
    renderEquipTooltip(enemy.equipment);
  }

  // 自身信息
  playerHp.textContent = me.hp;
  playerMaxHp.textContent = me.maxHp;
  playerAp.textContent = me.ap;
  playerMaxAp.textContent = me.maxAp;
  playerEffects.innerHTML = me.effects.map(e => `${e.name}(${e.duration})`).join(' ');
  renderSkills(me.skills, room.phase === 'main' && room.turn === myIndex);
  renderMinions(playerMinions, me.minions, 'self');
  renderEquipList(me.equipment);
  renderHand(me.hand);

  // 阶段显示
  if (room.phase === 'env') {
    phaseTip.textContent = '⏳ 环境阶段';
    endMainBtn.disabled = true;
    endMinionBtn.disabled = true;
  } else if (room.phase === 'main') {
    const myTurn = room.turn === myIndex;
    phaseTip.textContent = myTurn ? '🎯 你的主回合' : '⏳ 对手主回合';
    endMainBtn.disabled = !myTurn;
    endMinionBtn.disabled = true;
  } else if (room.phase === 'minion') {
    const myTurn = room.turn === myIndex;
    phaseTip.textContent = myTurn ? '🐾 你的仆从回合' : '⏳ 对手仆从回合';
    endMainBtn.disabled = true;
    endMinionBtn.disabled = !myTurn;
  }

  if (room.envEffects.length) {
    phaseTip.textContent += ` | 场地: ${room.envEffects.map(e => e.name).join(' ')}`;
  }
});

function renderSkills(skills, canUse) {
  skillBar.innerHTML = '';
  skills.forEach(s => {
    const tpl = SKILLS.find(sk => sk.id === s.id);
    const btn = document.createElement('button');
    btn.className = 'skill-btn';
    btn.textContent = `${tpl.name}(${tpl.cost})`;
    btn.disabled = !canUse || s.currentCd > 0;
    btn.title = s.currentCd > 0 ? `冷却${s.currentCd}回合` : tpl.desc;
    btn.onclick = () => {
      selectedSkill = s.id;
      selectedCard = null;
      selectedMinion = null;
      clearSelect();
      btn.classList.add('selected');
      if (tpl.target === 'enemy') enemyInfo.classList.add('targetable');
      else if (tpl.target === 'self') socket.emit('useSkill', s.id, 'self', null);
    };
    skillBar.appendChild(btn);
  });
}

function renderMinions(container, minions, type) {
  container.innerHTML = '';
  minions.forEach(m => {
    const div = document.createElement('div');
    div.className = 'minion-card';
    div.innerHTML = `<div>${m.name}</div><div class="mhp">${m.hp}/${m.maxHp}</div>`;
    if (type === 'enemy') {
      div.onclick = () => {
        if (selectedCard) socket.emit('playCard', selectedCard.uid, 'minion', m.uid);
        else if (selectedSkill) socket.emit('useSkill', selectedSkill, 'minion', m.uid);
        else if (selectedMinion) socket.emit('minionAttack', selectedMinion, 'minion', m.uid);
        clearTarget();
      };
    } else {
      div.onclick = () => {
        if (selectedMinion === m.uid) {
          selectedMinion = null;
          div.classList.remove('selected');
        } else {
          selectedMinion = m.uid;
          document.querySelectorAll('.player-minions .minion-card').forEach(el => el.classList.remove('selected'));
          div.classList.add('selected');
        }
      };
    }
    container.appendChild(div);
  });
}

function renderEquipList(equipment) {
  equipList.innerHTML = '';
  equipment.forEach(eq => {
    const slot = document.createElement('div');
    slot.className = 'equip-slot' + (eq.id ? ' has-equip' : '');
    if (eq.id) {
      const tpl = EQUIPMENTS.find(e => e.id === eq.id);
      let accHtml = '';
      eq.accessories.forEach(acc => {
        if (acc) {
          const accTpl = ACCESSORIES.find(a => a.id === acc.id);
          accHtml += `<div class="acc-item">• ${accTpl.name}</div>`;
        }
      });
      slot.innerHTML = `<div class="equip-name">${tpl.name}</div><div class="acc-list">${accHtml || '<div class="acc-item">空槽位</div>'}</div>`;
    } else {
      slot.innerHTML = '<div class="equip-name">空装备槽</div>';
    }
    equipList.appendChild(slot);
  });
}

function renderEquipTooltip(equipment) {
  let html = '<b>对方装备</b><br>';
  let hasEquip = false;
  equipment.forEach(eq => {
    if (!eq.id) return;
    hasEquip = true;
    const tpl = EQUIPMENTS.find(e => e.id === eq.id);
    html += `<br>🔹 ${tpl.name}`;
    eq.accessories.forEach(acc => {
      if (acc) {
        const accTpl = ACCESSORIES.find(a => a.id === acc.id);
        html += `<br>&nbsp;&nbsp;• ${accTpl.name}`;
      }
    });
  });
  if (!hasEquip) html += '<br>暂无装备';
  enemyEquipTip.innerHTML = html;
}

function renderHand(hand) {
  handArea.innerHTML = '';
  hand.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (selectedCard?.uid === card.uid) cardEl.classList.add('selected');
    cardEl.innerHTML = `
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${card.desc}</div>
      <div class="card-cost">消耗: ${card.cost}</div>
    `;
    cardEl.onclick = () => {
      selectedCard = card;
      selectedSkill = null;
      selectedMinion = null;
      clearSelect();
      cardEl.classList.add('selected');
      if (card.target === 'enemy') enemyInfo.classList.add('targetable');
      else if (card.target === 'self') {
        socket.emit('playCard', card.uid, 'self', null);
        selectedCard = null;
      }
    };
    handArea.appendChild(cardEl);
  });
}

enemyInfo.onclick = () => {
  if (selectedCard) socket.emit('playCard', selectedCard.uid, 'player', 1 - myIndex);
  else if (selectedSkill) socket.emit('useSkill', selectedSkill, 'player', 1 - myIndex);
  else if (selectedMinion) socket.emit('minionAttack', selectedMinion, 'player', 1 - myIndex);
  clearTarget();
};

function clearSelect() {
  document.querySelectorAll('.card, .skill-btn, .minion-card').forEach(el => el.classList.remove('selected'));
}
function clearTarget() {
  enemyInfo.classList.remove('targetable');
  selectedCard = null;
  selectedSkill = null;
  selectedMinion = null;
  clearSelect();
}

endMainBtn.onclick = () => socket.emit('endMainTurn');
endMinionBtn.onclick = () => socket.emit('endMinionTurn');

socket.on('actionLog', data => {
  const log = document.createElement('div');
  log.textContent = data.message;
  logArea.appendChild(log);
  logArea.scrollTop = logArea.scrollHeight;
});

socket.on('gameOver', winner => {
  phaseTip.textContent = `🏆 ${winner} 获胜！`;
  endMainBtn.disabled = true;
  endMinionBtn.disabled = true;
});

// 配置数据注入（用于前端显示名称）
const SKILLS = [
  { id: 'warrior_slash', name: '猛力斩击' },
  { id: 'warrior_shield', name: '铁壁护盾' },
  { id: 'fireball', name: '火球术' },
  { id: 'summon_imp', name: '召唤小鬼' }
];
const EQUIPMENTS = [
  { id: 'iron_sword', name: '铁剑' },
  { id: 'leather_armor', name: '皮甲' }
];
const ACCESSORIES = [
  { id: 'sharp_gem', name: '锋利宝石' },
  { id: 'life_gem', name: '生命宝石' }
];
//（注：内容由AI生成）
