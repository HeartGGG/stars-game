/**
 * 联机卡牌对战 v3 - 客户端 (多人版)
 * 支持: 最多7人 / 房主开始 / 多人目标选择 / 房间准备列表
 */
const socket = io();

let CFG = {
  factions: [], characters: [], skills: [],
  minionTemplates: [], equipments: [], accessories: []
};

let myIndex = -1;
let myIsHost = false;
let myCharId = null;
let selectedCard = null;
let selectedSkill = null;
let selectedMinion = null;

const $ = id => document.getElementById(id);
const selectOverlay = $('selectOverlay');
const lobbyPanel = $('lobbyPanel');
const selectPanel = $('selectPanel');
const lobbyPlayers = $('lobbyPlayers');
const lobbyStartBtn = $('lobbyStartBtn');
const lobbyHint = $('lobbyHint');
const factionSelect = $('factionSelect');
const charList = $('charList');
const charInfo = $('charInfo');
const readyBtn = $('readyBtn');
const readyHint = $('readyHint');
const hostStartBtn = $('hostStartBtn');
const roomPlayers = $('roomPlayers');
const playerCount = $('playerCount');
const maxCount = $('maxCount');

const danhakuLayer = $('danhakuLayer');
const playersGrid = $('playersGrid');

const playerName = $('playerName');
const playerHp = $('playerHp');
const playerMaxHp = $('playerMaxHp');
const playerAp = $('playerAp');
const playerMaxAp = $('playerMaxAp');
const playerEffects = $('playerEffects');
const skillBar = $('skillBar');

const mainPanel = $('mainPanel');
const minionPanel = $('minionPanel');
const myMinions = $('myMinions');
const targetInfo = $('targetInfo');

const handArea = $('handArea');
const endMainBtn = $('endMainBtn');
const endMinionBtn = $('endMinionBtn');
const equipList = $('equipList');
const logArea = $('logArea');
const phaseTip = $('phaseTip');

const confirmModal = $('confirmModal');
const confirmTitle = $('confirmTitle');
const confirmDesc = $('confirmDesc');
const confirmOk = $('confirmOk');
const confirmCancel = $('confirmCancel');

const gameOverModal = $('gameOverModal');
const victoryText = $('victoryText');
const restartBtn = $('restartBtn');
const forceCloseBtn = $('forceCloseBtn');

// 启动时强制隐藏所有弹窗
confirmModal.style.display = 'none';
gameOverModal.style.display = 'none';

// 强制关闭按钮: 不管游戏状态, 直接关掉弹窗
forceCloseBtn.onclick = () => {
  gameOverModal.style.display = 'none';
};

const byId = (arr, id) => arr.find(x => x.id === id);

// ---------- 工具 ----------
function showDanhaku(text, duration = 2000) {
  const el = document.createElement('div');
  el.className = 'danhaku-text';
  el.textContent = text;
  danhakuLayer.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
function appendLog(text) {
  const div = document.createElement('div');
  div.textContent = text;
  logArea.appendChild(div);
  logArea.scrollTop = logArea.scrollHeight;
}
function resetTarget() {
  selectedCard = null;
  selectedSkill = null;
  selectedMinion = null;
  document.querySelectorAll('.card, .skill-btn, .pc-minion').forEach(el => el.classList.remove('selected', 'targetable'));
  document.querySelectorAll('.player-card').forEach(el => el.classList.remove('targetable'));
}

// ---------- 选角界面 ----------
socket.on('config', (cfg) => {
  CFG = cfg;
  factionSelect.innerHTML = '';
  CFG.factions.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.name;
    factionSelect.appendChild(opt);
  });
  renderCharList();
});
factionSelect.addEventListener('change', renderCharList);

function renderCharList() {
  const fid = factionSelect.value;
  charList.innerHTML = '';
  CFG.characters.filter(c => c.faction === fid).forEach(c => {
    const div = document.createElement('div');
    div.className = 'char-card' + (c.id === myCharId ? ' selected' : '');
    div.innerHTML = `<div class="cname">${c.name}</div><div class="cdesc">HP${c.maxHp}/AP${c.maxAp}</div>`;
    div.onclick = () => {
      myCharId = c.id;
      charInfo.textContent = `${c.name} —— ${c.desc || ''}`;
      socket.emit('selectCharacter', c.id);
      renderCharList();
    };
    charList.appendChild(div);
  });
}

readyBtn.addEventListener('click', () => {
  if (!myCharId) {
    charInfo.textContent = '⚠️ 请先选择一个角色';
    return;
  }
  socket.emit('toggleReady');
});
hostStartBtn.addEventListener('click', () => socket.emit('hostStart'));
lobbyStartBtn.addEventListener('click', () => socket.emit('lobbyStartSelect'));

// ---------- 状态渲染 ----------
socket.on('state', (room) => {
  const me = room.players[myIndex];
  if (!me) return;

  maxCount.textContent = room.maxPlayers;
  playerCount.textContent = room.players.length;

  // 大厅阶段
  if (room.phase === 'lobby') {
    selectOverlay.style.display = 'flex';
    lobbyPanel.style.display = 'block';
    selectPanel.style.display = 'none';
    gameOverModal.style.display = 'none';
    renderLobbyPlayers(room);
    lobbyStartBtn.style.display = myIsHost ? 'block' : 'none';
    if (myIsHost) {
      lobbyStartBtn.disabled = room.players.length < room.minPlayers;
      lobbyHint.textContent = room.players.length >= room.minPlayers
        ? '人数足够, 点击开始选角!'
        : `等待玩家加入 (${room.players.length}/${room.minPlayers})`;
    } else {
      lobbyHint.textContent = '等待房主开始选角…';
    }
    return;
  }

  // 选角阶段
  if (room.phase === 'select') {
    selectOverlay.style.display = 'flex';
    lobbyPanel.style.display = 'none';
    selectPanel.style.display = 'block';
    gameOverModal.style.display = 'none';
    renderRoomPlayers(room);
    hostStartBtn.style.display = myIsHost ? 'block' : 'none';
    if (myIsHost) {
      const enough = room.players.length >= room.minPlayers;
      const allReady = room.players.every(p => p.charId && p.ready);
      hostStartBtn.disabled = !(enough && allReady);
      readyHint.textContent = enough && allReady
        ? '全员就绪, 点击开始游戏!'
        : `等待玩家加入/准备 (${room.players.length}/${room.minPlayers}+)`;
    } else {
      readyHint.textContent = '等待房主开始游戏…';
    }
    return;
  }
  selectOverlay.style.display = 'none';

  // 我的信息
  playerName.textContent = me.name;
  playerHp.textContent = me.hp;
  playerMaxHp.textContent = me.maxHp;
  playerAp.textContent = me.ap;
  playerMaxAp.textContent = me.maxAp;
  playerEffects.innerHTML = me.effects.map(e => `${e.name}(${e.duration})`).join(' ');

  renderSkills(me.skills, room.phase === 'main' && room.turn === myIndex);
  renderHand(me.hand, room.phase === 'main' && room.turn === myIndex);
  renderMyEquip(me.equipment);
  renderMyMinions(me.minions);
  renderOtherPlayers(room);

  // 阶段
  const myTurn = room.turn === myIndex;
  if (room.phase === 'env') {
    phaseTip.textContent = '⏳ 环境阶段结算中…';
    mainPanel.style.display = 'none';
    minionPanel.style.display = 'none';
  } else if (room.phase === 'main') {
    const cur = room.players[room.turn];
    phaseTip.textContent = myTurn ? '🎯 你的主回合' : `⏳ ${cur.name} 行动中`;
    mainPanel.style.display = 'flex';
    minionPanel.style.display = 'none';
    endMainBtn.disabled = !myTurn;
  } else if (room.phase === 'minion') {
    const cur = room.players[room.turn];
    phaseTip.textContent = myTurn ? '🐾 你的仆从回合' : `⏳ ${cur.name} 仆从行动中`;
    mainPanel.style.display = 'none';
    minionPanel.style.display = 'flex';
    endMinionBtn.disabled = !myTurn;
  } else if (room.phase === 'over') {
    mainPanel.style.display = 'none';
    minionPanel.style.display = 'none';
  }
  if (room.envEffects.length) {
    phaseTip.textContent += ` | 场地: ${room.envEffects.map(e => `${e.name}(${e.duration})`).join(',')}`;
  }
});

// ---------- 房间玩家列表 ----------
function renderLobbyPlayers(room) {
  lobbyPlayers.innerHTML = '';
  room.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'room-player-row' + (p.isHost ? ' host' : '');
    div.innerHTML = `
      <span class="rp-name">
        ${p.isHost ? '<span class="rp-state host-tag">👑房主</span>' : ''}
        ${p.name}
      </span>
      <span class="rp-state ready">已加入</span>
    `;
    lobbyPlayers.appendChild(div);
  });
}

function renderRoomPlayers(room) {
  roomPlayers.innerHTML = '';
  room.players.forEach(p => {
    const tpl = byId(CFG.characters, p.charId);
    const div = document.createElement('div');
    div.className = 'room-player-row' + (p.isHost ? ' host' : '');
    const state = p.ready
      ? `<span class="rp-state ready">✔ 已准备</span>`
      : `<span class="rp-state wait">${p.charId ? '未准备' : '未选角'}</span>`;
    div.innerHTML = `
      <span class="rp-name">
        ${p.isHost ? '<span class="rp-state host-tag">👑房主</span>' : ''}
        ${p.name} ${tpl ? '· ' + tpl.name : ''}
      </span>
      ${state}
    `;
    roomPlayers.appendChild(div);
  });
}

// ---------- 其他玩家卡片 ----------
function renderOtherPlayers(room) {
  playersGrid.innerHTML = '';
  room.players.forEach(p => {
    if (p.index === myIndex) return;
    const tpl = byId(CFG.characters, p.charId);
    const card = document.createElement('div');
    card.className = 'player-card';
    if (!p.alive) card.classList.add('dead');
    if (room.turn === p.index) card.classList.add('current-turn');

    // 可被选为目标?
    const canTarget = (selectedCard || selectedSkill || selectedMinion) &&
                      p.alive &&
                      (room.phase === 'main' || room.phase === 'minion');
    if (canTarget) card.classList.add('targetable');

    const effectsHtml = p.effects.length
      ? p.effects.map(e => `${e.name}(${e.duration})`).join(' ')
      : '';
    const minionsHtml = p.minions.map(m =>
      `<div class="pc-minion${canTarget ? ' targetable' : ''}" data-owner="${p.index}" data-minion="${m.uid}">
         ${m.name} <span class="mhp">${m.hp}/${m.maxHp}</span>
       </div>`
    ).join('');

    card.innerHTML = `
      <div class="pc-name">${p.name}</div>
      <div class="pc-char">${tpl ? tpl.name : ''}</div>
      <div class="pc-hp">HP ${p.hp}/${p.maxHp}</div>
      <div class="pc-effects">${effectsHtml}</div>
      <div class="pc-minions">${minionsHtml}</div>
      <div class="equip-tooltip">${renderEquipTip(p.equipment)}</div>
    `;

    // 点击玩家本体
    card.onclick = (e) => {
      if (e.target.closest('.pc-minion')) return; // 点的是仆从
      onPlayerCardClick(p.index);
    };
    // 点击仆从
    card.querySelectorAll('.pc-minion').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        onEnemyMinionClick(Number(el.dataset.owner), el.dataset.minion);
      };
    });

    playersGrid.appendChild(card);
  });
}
function renderEquipTip(equipment) {
  let html = '<div class="t-title">装备</div>';
  let has = false;
  equipment.forEach(eq => {
    if (!eq.id) return;
    has = true;
    const tpl = byId(CFG.equipments, eq.id);
    html += `<div class="t-eq"><div class="t-eqname">${tpl.name}</div><div class="t-edesc">${tpl.desc}</div>`;
    eq.accessories.forEach(acc => {
      if (acc) {
        const aTpl = byId(CFG.accessories, acc.id);
        html += `<div class="t-edesc">↳ ${aTpl.name}: ${aTpl.desc}</div>`;
      }
    });
    html += '</div>';
  });
  if (!has) html += '<div class="t-edesc">暂无装备</div>';
  return html;
}

function onPlayerCardClick(targetIdx) {
  if (selectedCard) {
    askConfirm('攻击对手', '确定使用所选卡牌攻击该玩家?', () => {
      socket.emit('playCard', { cardUid: selectedCard.uid, targetType: 'player', targetId: targetIdx });
      resetTarget();
    });
  } else if (selectedSkill) {
    askConfirm('使用技能', '确定对该玩家使用所选技能?', () => {
      socket.emit('useSkill', { skillId: selectedSkill, targetType: 'player', targetId: targetIdx });
      resetTarget();
    });
  } else if (selectedMinion) {
    askConfirm('仆从攻击', '确定让你的仆从攻击该玩家?', () => {
      socket.emit('minionAttack', { minionUid: selectedMinion, targetType: 'player', targetId: targetIdx });
      resetTarget();
    });
  }
}
function onEnemyMinionClick(ownerIdx, minionUid) {
  const targetId = `${ownerIdx}:${minionUid}`;
  if (selectedCard || selectedSkill) {
    askConfirm('攻击仆从', '确定对该仆从使用所选卡牌/技能?', () => {
      if (selectedCard) socket.emit('playCard', { cardUid: selectedCard.uid, targetType: 'minion', targetId });
      if (selectedSkill) socket.emit('useSkill', { skillId: selectedSkill, targetType: 'minion', targetId });
      resetTarget();
    });
  } else if (selectedMinion) {
    askConfirm('仆从攻击', '确定让你的仆从攻击该仆从?', () => {
      socket.emit('minionAttack', { minionUid: selectedMinion, targetType: 'minion', targetId });
      resetTarget();
    });
  }
}

// ---------- 手牌 / 技能 ----------
function renderHand(hand, canPlay) {
  handArea.innerHTML = '';
  hand.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card' + (selectedCard && selectedCard.uid === card.uid ? ' selected' : '');
    el.innerHTML = `
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${card.desc}</div>
      <div class="card-cost">AP:${card.cost}</div>
    `;
    if (canPlay) el.onclick = () => onPickCard(card);
    handArea.appendChild(el);
  });
}
function onPickCard(card) {
  resetTarget();
  selectedCard = card;
  document.querySelectorAll('.card').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  if (card.target === 'self') {
    askConfirm(`使用【${card.name}】`, card.desc, () => {
      socket.emit('playCard', { cardUid: card.uid, targetType: 'self', targetId: null });
      resetTarget();
    });
  }
}

function renderSkills(skills, canUse) {
  skillBar.innerHTML = '';
  skills.forEach(s => {
    const tpl = byId(CFG.skills, s.id);
    if (!tpl) return;
    const btn = document.createElement('button');
    btn.className = 'skill-btn' + (selectedSkill === s.id ? ' selected' : '');
    btn.textContent = `${tpl.name}(${tpl.cost}AP)`;
    btn.disabled = !canUse || s.currentCd > 0;
    btn.title = s.currentCd > 0 ? `冷却 ${s.currentCd}` : tpl.desc;
    btn.onclick = () => onPickSkill(s, tpl);
    skillBar.appendChild(btn);
  });
}
function onPickSkill(s, tpl) {
  resetTarget();
  selectedSkill = s.id;
  document.querySelectorAll('.skill-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  if (tpl.target === 'self' || tpl.type === 'summon') {
    askConfirm(`释放技能【${tpl.name}】`, tpl.desc, () => {
      socket.emit('useSkill', { skillId: s.id, targetType: 'self', targetId: null });
      resetTarget();
    });
  }
}

// ---------- 我的仆从 ----------
function renderMyMinions(minions) {
  myMinions.innerHTML = '';
  minions.forEach(m => {
    const div = document.createElement('div');
    div.className = 'minion-card' + (selectedMinion === m.uid ? ' selected' : '');
    div.style.cssText = 'background:#2d3436;padding:6px 10px;border-radius:6px;font-size:12px;border:2px solid transparent;cursor:pointer;';
    div.innerHTML = `<div>${m.name}</div><div style="color:#ff6b6b">HP ${m.hp}/${m.maxHp} · 攻${m.attack}</div>`;
    div.onclick = () => {
      selectedMinion = selectedMinion === m.uid ? null : m.uid;
      targetInfo.textContent = selectedMinion
        ? `已选仆从【${m.name}】, 点击其他玩家/仆从攻击`
        : '选择一个仆从, 再点击其他玩家或仆从';
      renderMyMinions(minions);
    };
    myMinions.appendChild(div);
  });
}

// ---------- 我的装备 ----------
function renderMyEquip(equipment) {
  equipList.innerHTML = '';
  equipment.forEach(eq => {
    const slot = document.createElement('div');
    slot.className = 'equip-slot' + (eq.id ? ' has-equip' : '');
    if (eq.id) {
      const tpl = byId(CFG.equipments, eq.id);
      let accHtml = '';
      eq.accessories.forEach(acc => {
        if (acc) {
          const aTpl = byId(CFG.accessories, acc.id);
          accHtml += `<div class="acc-item">• ${aTpl.name} <small>(${aTpl.desc})</small></div>`;
        }
      });
      slot.innerHTML = `
        <div class="ename">${tpl.name}</div>
        <div class="edesc">${tpl.desc}</div>
        <div class="acc-list">${accHtml || '空配件槽'}</div>
      `;
    } else {
      slot.innerHTML = '<div class="ename">空装备槽</div>';
    }
    equipList.appendChild(slot);
  });
}

// ---------- 确认弹窗 ----------
let confirmCb = null;
function askConfirm(title, desc, cb) {
  confirmTitle.textContent = title;
  confirmDesc.textContent = desc;
  confirmModal.style.display = 'flex';
  confirmCb = cb;
}
confirmOk.onclick = () => {
  confirmModal.style.display = 'none';
  if (confirmCb) confirmCb();
  confirmCb = null;
};
confirmCancel.onclick = () => {
  confirmModal.style.display = 'none';
  confirmCb = null;
  resetTarget();
};

// ---------- 结束按钮 ----------
endMainBtn.onclick = () => socket.emit('endMainTurn');
endMinionBtn.onclick = () => {
  selectedMinion = null;
  socket.emit('endMinionTurn');
};

// ---------- 事件 ----------
socket.on('danhaku', d => showDanhaku(d.text, d.duration));
socket.on('actionLog', d => appendLog(d.message));
socket.on('joined', d => { myIndex = d.index; myIsHost = d.isHost; });
socket.on('errorMsg', e => alert(e.message));
socket.on('gameOver', d => {
  victoryText.textContent = d.winner === '平局' ? '🤝 平局' : `🏆 ${d.winner} 获胜!`;
  gameOverModal.style.display = 'flex';
});
restartBtn.onclick = () => {
  gameOverModal.style.display = 'none';
  socket.emit('restart');
};
//（注：内容由AI生成）
