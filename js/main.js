/*
 * 《当你不在的世界》- 微信小游戏可玩原型（第一季·重逢篇）
 * 改进版：完整主循环、9关卡数据、双视角叙事差异、拼图地图、设置面板、暂停与存档
 */

const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 667;
const GRAVITY = 1850;
const SAVE_KEY = 'reunion-save-v2';

const ROLES = [
  {
    id: 'boy',
    name: '男孩',
    color: '#5b7fff',
    endingTear: '蓝色泪滴',
    fragments: [
      '你的声音：没有你的世界，像被按下静音键。',
      '并肩的影子：我想再一次站到你左边。',
      '逆行的钟：时间后退，但我会向前。',
      '雾中的手：看不见你时，我更想抓紧。',
      '初遇之地：你笑起来，世界第一次变亮。',
      '心跳声：每一步都更接近你。',
      '镜中的我们：我不再逃避脆弱。',
      '雨中的承诺：就算暴雨，我也会赴约。',
      '门的另一边：我来了，像你相信的那样。'
    ]
  },
  {
    id: 'girl',
    name: '女孩',
    color: '#ff7ab8',
    endingTear: '粉色泪滴',
    fragments: [
      '你的声音：你说过，别怕，我会回来。',
      '并肩的影子：再远的路，也记得我们的步频。',
      '逆行的钟：时间乱了，我仍相信重逢。',
      '雾中的手：黑暗里，我把勇气留给你。',
      '初遇之地：那天风很轻，你眼里有光。',
      '心跳声：等你的每秒都在发烫。',
      '镜中的我们：我学会了和自己和解。',
      '雨中的承诺：雨会停，而你会来。',
      '门的另一边：我一直都在这扇门后。'
    ]
  }
];

const LEVELS = [
  { id: 1, name: '启程', mechanic: 'normal', colorGain: 11, starTime: 22 },
  { id: 2, name: '距离', mechanic: 'gaps', colorGain: 11, starTime: 24 },
  { id: 3, name: '逆流', mechanic: 'reverse', colorGain: 11, starTime: 26 },
  { id: 4, name: '迷雾', mechanic: 'fog', colorGain: 11, starTime: 28 },
  { id: 5, name: '初遇', mechanic: 'doubleJump', colorGain: 11, starTime: 30 },
  { id: 6, name: '心跳', mechanic: 'rhythm', colorGain: 11, starTime: 34 },
  { id: 7, name: '镜像', mechanic: 'mirror', colorGain: 11, starTime: 36 },
  { id: 8, name: '暴雨', mechanic: 'rain', colorGain: 11, starTime: 38 },
  { id: 9, name: '重逢', mechanic: 'final', colorGain: 12, starTime: 42 }
];

function createGame() {
  const sys = wx.getSystemInfoSync();
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');
  canvas.width = sys.windowWidth;
  canvas.height = sys.windowHeight;

  const scaleX = canvas.width / DESIGN_WIDTH;
  const scaleY = canvas.height / DESIGN_HEIGHT;
  const sx = v => v * scaleX;
  const sy = v => v * scaleY;

  const state = {
    scene: 'menu',
    roleIndex: 0,
    colorProgress: 0,
    highestUnlockedLevel: 0,
    completed: Array(9).fill(false),
    stars: Array(9).fill(false),
    fragmentsFound: Array(9).fill(false),
    unlockedDoubleJump: false,
    levelStartAt: 0,
    currentLevelIndex: 0,
    pause: false,
    settings: {
      musicOn: true,
      sfxOn: true,
      joystickMode: 'fixed'
    },
    controls: {
      left: false,
      right: false,
      leftTouchId: null,
      rightTouchId: null
    },
    player: {
      x: sx(26),
      y: sy(530),
      w: sx(22),
      h: sy(34),
      vx: 0,
      vy: 0,
      onGround: false,
      jumpCount: 0
    },
    world: null,
    uiToast: '',
    uiToastUntil: 0
  };

  const storage = {
    load() {
      try {
        const saved = wx.getStorageSync(SAVE_KEY);
        if (!saved || typeof saved !== 'object') return;
        state.roleIndex = Number(saved.roleIndex) || 0;
        state.colorProgress = Number(saved.colorProgress) || 0;
        state.highestUnlockedLevel = Number(saved.highestUnlockedLevel) || 0;
        state.completed = normalizeBoolArray(saved.completed, 9);
        state.stars = normalizeBoolArray(saved.stars, 9);
        state.fragmentsFound = normalizeBoolArray(saved.fragmentsFound, 9);
        state.unlockedDoubleJump = !!saved.unlockedDoubleJump;
        state.settings = {
          musicOn: saved.settings?.musicOn !== false,
          sfxOn: saved.settings?.sfxOn !== false,
          joystickMode: saved.settings?.joystickMode === 'dynamic' ? 'dynamic' : 'fixed'
        };
      } catch (err) {
        console.warn('load save failed', err);
      }
    },
    save() {
      try {
        wx.setStorageSync(SAVE_KEY, {
          roleIndex: state.roleIndex,
          colorProgress: state.colorProgress,
          highestUnlockedLevel: state.highestUnlockedLevel,
          completed: state.completed,
          stars: state.stars,
          fragmentsFound: state.fragmentsFound,
          unlockedDoubleJump: state.unlockedDoubleJump,
          settings: state.settings
        });
      } catch (err) {
        console.warn('save failed', err);
      }
    }
  };

  function normalizeBoolArray(input, len) {
    if (!Array.isArray(input)) return Array(len).fill(false);
    return Array.from({ length: len }, (_, i) => !!input[i]);
  }

  function role() {
    return ROLES[state.roleIndex] || ROLES[0];
  }

  function currentLevel() {
    return LEVELS[state.currentLevelIndex];
  }

  function buildLevelWorld(levelIndex) {
    const base = [
      { x: 0, y: 596, w: 375, h: 78, solid: true },
      { x: 95, y: 530, w: 65, h: 14, solid: true },
      { x: 188, y: 500, w: 66, h: 14, solid: true },
      { x: 284, y: 468, w: 64, h: 14, solid: true }
    ];

    if (levelIndex === 1) {
      base[1].x = 140;
      base[2].x = 242;
      base[3].x = 330;
    }
    if (levelIndex === 2) {
      base.push({ x: 230, y: 560, w: 96, h: 12, solid: true, conveyor: -1 });
    }
    if (levelIndex >= 4) {
      base.push({ x: 116, y: 432, w: 52, h: 12, solid: true });
      base.push({ x: 206, y: 392, w: 52, h: 12, solid: true });
    }
    if (levelIndex === 6) {
      base.forEach((p, i) => {
        if (i > 0) p.mirrorX = DESIGN_WIDTH - p.x - p.w;
      });
    }

    return {
      platforms: base.map(p => ({
        ...p,
        x: sx(p.x),
        y: sy(p.y),
        w: sx(p.w),
        h: sy(p.h),
        mirrorX: p.mirrorX !== undefined ? sx(p.mirrorX) : undefined
      })),
      fragment: {
        x: sx(210),
        y: sy(350),
        r: sx(10),
        taken: state.fragmentsFound[levelIndex]
      },
      goalDoor: {
        x: sx(340),
        y: sy(414),
        w: sx(24),
        h: sy(54)
      }
    };
  }

  function startLevel(index) {
    state.currentLevelIndex = index;
    state.world = buildLevelWorld(index);
    state.scene = 'playing';
    state.pause = false;
    resetPlayer();
    state.levelStartAt = Date.now();
  }

  function resetPlayer() {
    state.player.x = sx(25);
    state.player.y = sy(540);
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.onGround = false;
    state.player.jumpCount = 0;
  }

  function completeLevel() {
    const idx = state.currentLevelIndex;
    const lv = currentLevel();

    if (!state.completed[idx]) {
      state.colorProgress = Math.min(100, state.colorProgress + lv.colorGain);
      state.completed[idx] = true;
    }

    const usedSec = (Date.now() - state.levelStartAt) / 1000;
    if (usedSec <= lv.starTime) state.stars[idx] = true;

    state.highestUnlockedLevel = Math.max(state.highestUnlockedLevel, Math.min(8, idx + 1));
    if (idx >= 4) state.unlockedDoubleJump = true;

    showToast(`通关 ${lv.name} · 用时 ${usedSec.toFixed(1)}s`);
    storage.save();

    state.scene = idx === 8 ? 'ending' : 'map';
  }

  function showToast(text) {
    state.uiToast = text;
    state.uiToastUntil = Date.now() + 1800;
  }

  function jump() {
    const p = state.player;
    if (p.onGround) {
      p.vy = -sy(650);
      p.onGround = false;
      p.jumpCount = 1;
      return;
    }
    if (state.unlockedDoubleJump && p.jumpCount < 2) {
      p.vy = -sy(610);
      p.jumpCount += 1;
      showToast('情感迸发：二段跳');
    }
  }

  function updatePhysics(dt) {
    if (state.pause) return;

    const p = state.player;
    const lv = currentLevel();
    const runSpeed = sx(165);

    p.vx = 0;
    if (state.controls.left) p.vx -= runSpeed;
    if (state.controls.right) p.vx += runSpeed;
    if (lv.mechanic === 'reverse') p.vx *= -1;

    p.vy += GRAVITY * scaleY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < 0) p.x = 0;
    if (p.x + p.w > canvas.width) p.x = canvas.width - p.w;

    p.onGround = false;
    for (const platform of state.world.platforms) {
      const drawX = lv.mechanic === 'mirror' && platform.mirrorX !== undefined ? platform.mirrorX : platform.x;

      if (lv.mechanic === 'rhythm' && platform !== state.world.platforms[0]) {
        const visible = Math.floor(Date.now() / 500) % 2 === 1;
        if (!visible) continue;
      }

      const feet = p.y + p.h;
      const crossY = feet >= platform.y && feet <= platform.y + platform.h + sy(18);
      const crossX = p.x + p.w > drawX && p.x < drawX + platform.w;
      if (crossX && crossY && p.vy >= 0) {
        p.y = platform.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpCount = 0;
        if (platform.conveyor) p.x += platform.conveyor * sx(65) * dt;
      }
    }

    if (p.y > canvas.height + sy(80)) {
      resetPlayer();
      showToast('坠落重生');
    }

    const frag = state.world.fragment;
    if (!frag.taken) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if ((cx - frag.x) ** 2 + (cy - frag.y) ** 2 <= (frag.r + sx(12)) ** 2) {
        frag.taken = true;
        state.fragmentsFound[state.currentLevelIndex] = true;
        if (state.currentLevelIndex >= 4) state.unlockedDoubleJump = true;
        showToast('收集记忆碎片');
        storage.save();
      }
    }

    const g = state.world.goalDoor;
    if (p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y) {
      completeLevel();
    }
  }

  function drawBackground() {
    const sat = state.colorProgress / 100;
    const gray = 226 - Math.floor(sat * 108);
    const top = sat > 0.45 ? `rgb(${94 + sat * 70},${120 + sat * 68},${170 + sat * 40})` : `rgb(${gray},${gray},${gray})`;
    const bottom = `rgb(${gray},${gray},${gray})`;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mech = LEVELS[state.currentLevelIndex]?.mechanic;
    if (mech === 'rain') {
      ctx.strokeStyle = 'rgba(190,190,220,0.45)';
      for (let i = 0; i < 44; i += 1) {
        const x = (i * sx(14) + Date.now() * 0.24) % canvas.width;
        const y = (i * sy(33) + Date.now() * 0.5) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - sx(5), y + sy(13));
        ctx.stroke();
      }
    }
  }

  function drawMenu() {
    drawBackground();
    drawTitle('当你不在的世界', '第一季·重逢篇');
    ctx.fillStyle = '#111';
    ctx.font = `${Math.floor(sy(15))}px sans-serif`;
    ctx.fillText('在黑白世界中，找回你，也找回色彩。', sx(28), sy(140));

    drawRoleCard(sx(36), sy(185), ROLES[0], state.roleIndex === 0);
    drawRoleCard(sx(200), sy(185), ROLES[1], state.roleIndex === 1);

    drawButton(sx(32), sy(300), sx(310), sy(46), '开始追寻');
    drawButton(sx(32), sy(360), sx(310), sy(42), '设置');
  }

  function drawSettings() {
    drawBackground();
    drawTitle('设置', '偏好选项');

    drawButton(sx(30), sy(150), sx(315), sy(44), `音乐：${state.settings.musicOn ? '开' : '关'}`);
    drawButton(sx(30), sy(206), sx(315), sy(44), `音效：${state.settings.sfxOn ? '开' : '关'}`);
    drawButton(sx(30), sy(262), sx(315), sy(44), `摇杆模式：${state.settings.joystickMode === 'fixed' ? '固定' : '动态'}`);
    drawButton(sx(30), sy(318), sx(315), sy(44), '清空进度');
    drawButton(sx(30), sy(386), sx(315), sy(44), '返回主菜单');
  }

  function drawMap() {
    drawBackground();
    drawTitle('记忆拼图地图', `色彩恢复 ${state.colorProgress}%`);

    for (let i = 0; i < 9; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = sx(36 + col * 100);
      const y = sy(122 + row * 98);
      const unlocked = i <= state.highestUnlockedLevel;
      const done = state.completed[i];

      ctx.fillStyle = unlocked ? (done ? '#ffeecf' : '#f4f0e8') : 'rgba(40,40,40,0.28)';
      ctx.fillRect(x, y, sx(84), sy(78));
      ctx.strokeStyle = '#5a5a5a';
      ctx.strokeRect(x, y, sx(84), sy(78));
      ctx.fillStyle = '#101010';
      ctx.font = `${Math.floor(sy(13))}px sans-serif`;
      ctx.fillText(`关 ${i + 1}`, x + sx(24), y + sy(22));
      if (state.fragmentsFound[i]) ctx.fillText('碎片✓', x + sx(18), y + sy(43));
      if (state.stars[i]) ctx.fillText('★', x + sx(38), y + sy(62));
    }

    const viewed = Math.min(state.highestUnlockedLevel, 8);
    const fragmentText = role().fragments[viewed];
    ctx.fillStyle = '#1e1e1e';
    ctx.font = `${Math.floor(sy(14))}px sans-serif`;
    ctx.fillText('当前记忆：', sx(30), sy(442));
    wrapText(fragmentText, sx(30), sy(468), sx(314), sy(20));

    drawButton(sx(30), sy(538), sx(152), sy(38), '回主菜单');
    drawButton(sx(192), sy(538), sx(152), sy(38), '设置');
  }

  function drawPlaying() {
    drawBackground();
    const lv = currentLevel();

    if (lv.mechanic === 'fog') {
      ctx.fillStyle = 'rgba(225,225,225,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const p = state.player;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, sx(85), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#474747';
    state.world.platforms.forEach((platform, i) => {
      if (lv.mechanic === 'rhythm' && i > 0) {
        const visible = Math.floor(Date.now() / 500) % 2 === 1;
        if (!visible) return;
      }
      const drawX = lv.mechanic === 'mirror' && platform.mirrorX !== undefined ? platform.mirrorX : platform.x;
      ctx.fillRect(drawX, platform.y, platform.w, platform.h);
    });

    const frag = state.world.fragment;
    if (!frag.taken) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(frag.x, frag.y, frag.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const door = state.world.goalDoor;
    ctx.fillStyle = '#8bd4ff';
    ctx.fillRect(door.x, door.y, door.w, door.h);

    const p = state.player;
    ctx.fillStyle = role().color;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    drawHud(lv);
    drawControlHints();

    if (state.pause) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawButton(sx(96), sy(280), sx(180), sy(44), '继续');
      drawButton(sx(96), sy(334), sx(180), sy(44), '重开本关');
      drawButton(sx(96), sy(388), sx(180), sy(44), '返回地图');
    }
  }

  function drawEnding() {
    drawBackground();
    drawTitle('重逢', `泪滴：${role().endingTear}`);

    ctx.fillStyle = '#141414';
    ctx.font = `${Math.floor(sy(16))}px sans-serif`;
    ctx.fillText('拼图完整，色彩回归。', sx(30), sy(140));
    ctx.fillText('“我找回了色彩，也找回了你。”', sx(30), sy(168));
    ctx.fillText(`碎片 ${state.fragmentsFound.filter(Boolean).length}/9`, sx(30), sy(205));
    ctx.fillText(`星星 ${state.stars.filter(Boolean).length}/9`, sx(30), sy(230));

    drawButton(sx(30), sy(286), sx(315), sy(44), '分享重逢文案');
    drawButton(sx(30), sy(340), sx(315), sy(44), '回到地图');
    drawButton(sx(30), sy(394), sx(315), sy(44), '重置并重玩');
  }

  function drawTitle(main, sub) {
    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.floor(sy(24))}px sans-serif`;
    ctx.fillText(main, sx(28), sy(75));
    ctx.font = `${Math.floor(sy(15))}px sans-serif`;
    ctx.fillText(sub, sx(30), sy(102));
  }

  function drawHud(lv) {
    const used = ((Date.now() - state.levelStartAt) / 1000).toFixed(1);
    ctx.fillStyle = '#111';
    ctx.font = `${Math.floor(sy(13))}px sans-serif`;
    ctx.fillText(`关${lv.id} ${lv.name}`, sx(12), sy(24));
    ctx.fillText(`色彩 ${state.colorProgress}%`, sx(12), sy(42));
    ctx.fillText(`时间 ${used}s / ★${lv.starTime}s`, sx(12), sy(60));

    drawButton(sx(300), sy(12), sx(62), sy(28), state.pause ? '继续' : '暂停');

    if (Date.now() < state.uiToastUntil) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(sx(70), sy(78), sx(236), sy(30));
      ctx.fillStyle = '#fff';
      ctx.fillText(state.uiToast, sx(82), sy(98));
    }
  }

  function drawRoleCard(x, y, roleData, active) {
    ctx.fillStyle = active ? '#ffe39c' : 'rgba(255,255,255,0.72)';
    ctx.fillRect(x, y, sx(138), sy(72));
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, sx(138), sy(72));
    ctx.fillStyle = '#232323';
    ctx.font = `${Math.floor(sy(18))}px sans-serif`;
    ctx.fillText(roleData.name, x + sx(46), y + sy(29));
    ctx.fillStyle = roleData.color;
    ctx.fillRect(x + sx(16), y + sy(44), sx(106), sy(10));
  }

  function drawButton(x, y, w, h, label) {
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#363636';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#202020';
    ctx.font = `${Math.floor(sy(15))}px sans-serif`;
    ctx.fillText(label, x + sx(14), y + h * 0.65);
  }

  function drawControlHints() {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#111';
    ctx.fillRect(sx(8), canvas.height - sy(118), sx(125), sy(100));
    ctx.fillRect(canvas.width - sx(133), canvas.height - sy(118), sx(125), sy(100));
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#111';
    ctx.font = `${Math.floor(sy(15))}px sans-serif`;
    ctx.fillText('←/→', sx(52), canvas.height - sy(58));
    ctx.fillText('跳跃', canvas.width - sx(90), canvas.height - sy(58));
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    let line = '';
    let yy = y;
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth) {
        ctx.fillText(line, x, yy);
        line = ch;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function inRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  function handleMenuTap(x, y) {
    if (inRect(x, y, sx(36), sy(185), sx(138), sy(72))) state.roleIndex = 0;
    if (inRect(x, y, sx(200), sy(185), sx(138), sy(72))) state.roleIndex = 1;
    if (inRect(x, y, sx(32), sy(300), sx(310), sy(46))) state.scene = 'map';
    if (inRect(x, y, sx(32), sy(360), sx(310), sy(42))) state.scene = 'settings';
    storage.save();
  }

  function handleSettingsTap(x, y) {
    if (inRect(x, y, sx(30), sy(150), sx(315), sy(44))) state.settings.musicOn = !state.settings.musicOn;
    else if (inRect(x, y, sx(30), sy(206), sx(315), sy(44))) state.settings.sfxOn = !state.settings.sfxOn;
    else if (inRect(x, y, sx(30), sy(262), sx(315), sy(44))) {
      state.settings.joystickMode = state.settings.joystickMode === 'fixed' ? 'dynamic' : 'fixed';
    } else if (inRect(x, y, sx(30), sy(318), sx(315), sy(44))) {
      state.colorProgress = 0;
      state.highestUnlockedLevel = 0;
      state.completed = Array(9).fill(false);
      state.stars = Array(9).fill(false);
      state.fragmentsFound = Array(9).fill(false);
      state.unlockedDoubleJump = false;
      showToast('进度已重置');
    } else if (inRect(x, y, sx(30), sy(386), sx(315), sy(44))) {
      state.scene = 'menu';
    }
    storage.save();
  }

  function handleMapTap(x, y) {
    for (let i = 0; i <= state.highestUnlockedLevel && i < 9; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      if (inRect(x, y, sx(36 + col * 100), sy(122 + row * 98), sx(84), sy(78))) {
        startLevel(i);
        return;
      }
    }
    if (inRect(x, y, sx(30), sy(538), sx(152), sy(38))) state.scene = 'menu';
    if (inRect(x, y, sx(192), sy(538), sx(152), sy(38))) state.scene = 'settings';
  }

  function handlePlayingTap(touch) {
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, sx(300), sy(12), sx(62), sy(28))) {
      state.pause = !state.pause;
      return;
    }

    if (state.pause) {
      if (inRect(x, y, sx(96), sy(280), sx(180), sy(44))) state.pause = false;
      else if (inRect(x, y, sx(96), sy(334), sx(180), sy(44))) startLevel(state.currentLevelIndex);
      else if (inRect(x, y, sx(96), sy(388), sx(180), sy(44))) state.scene = 'map';
      return;
    }

    if (x < canvas.width * 0.38) {
      state.controls.left = true;
      state.controls.leftTouchId = touch.identifier;
    } else if (x < canvas.width * 0.72) {
      state.controls.right = true;
      state.controls.rightTouchId = touch.identifier;
    } else {
      jump();
    }
  }

  function handleEndingTap(x, y) {
    if (inRect(x, y, sx(30), sy(286), sx(315), sy(44))) {
      wx.shareAppMessage({
        title: '我找回了色彩，也找回了你。',
        query: `from=ending&role=${role().id}&color=${state.colorProgress}`
      });
      return;
    }
    if (inRect(x, y, sx(30), sy(340), sx(315), sy(44))) {
      state.scene = 'map';
      return;
    }
    if (inRect(x, y, sx(30), sy(394), sx(315), sy(44))) {
      state.colorProgress = 0;
      state.highestUnlockedLevel = 0;
      state.completed = Array(9).fill(false);
      state.stars = Array(9).fill(false);
      state.fragmentsFound = Array(9).fill(false);
      state.unlockedDoubleJump = false;
      storage.save();
      state.scene = 'menu';
    }
  }

  function onTouchStart(e) {
    const touches = e.touches || [];
    if (!touches.length) return;

    if (state.scene === 'playing') {
      handlePlayingTap(touches[touches.length - 1]);
      return;
    }

    const t = touches[0];
    const x = t.clientX;
    const y = t.clientY;

    if (state.scene === 'menu') handleMenuTap(x, y);
    else if (state.scene === 'settings') handleSettingsTap(x, y);
    else if (state.scene === 'map') handleMapTap(x, y);
    else if (state.scene === 'ending') handleEndingTap(x, y);
  }

  function onTouchEnd(e) {
    const changed = e.changedTouches || [];
    if (!changed.length) {
      state.controls.left = false;
      state.controls.right = false;
      state.controls.leftTouchId = null;
      state.controls.rightTouchId = null;
      return;
    }

    for (const t of changed) {
      if (t.identifier === state.controls.leftTouchId) {
        state.controls.left = false;
        state.controls.leftTouchId = null;
      }
      if (t.identifier === state.controls.rightTouchId) {
        state.controls.right = false;
        state.controls.rightTouchId = null;
      }
    }
  }

  function render() {
    if (state.scene === 'menu') drawMenu();
    else if (state.scene === 'settings') drawSettings();
    else if (state.scene === 'map') drawMap();
    else if (state.scene === 'playing') drawPlaying();
    else if (state.scene === 'ending') drawEnding();
  }

  let last = Date.now();
  function tick() {
    const now = Date.now();
    const dt = Math.min((now - last) / 1000, 0.03);
    last = now;

    if (state.scene === 'playing') updatePhysics(dt);
    render();
    requestAnimationFrame(tick);
  }

  storage.load();
  wx.onTouchStart(onTouchStart);
  wx.onTouchEnd(onTouchEnd);
  tick();
}

module.exports = { createGame };
