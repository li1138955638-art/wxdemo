/*
 * 《当你不在的世界》- 微信小游戏原型（第一季·重逢篇）
 * 功能：9关、色彩恢复、碎片收集、基础平台跳跃与关卡机制演示
 */

const WIDTH = 375;
const HEIGHT = 667;
const GROUND_Y = 600;

const LEVELS = [
  { id: 1, name: '启程', theme: '教学', colorGain: 11, mechanic: 'normal' },
  { id: 2, name: '距离', theme: '沟壑', colorGain: 11, mechanic: 'gaps' },
  { id: 3, name: '逆流', theme: '反向', colorGain: 11, mechanic: 'reverse' },
  { id: 4, name: '迷雾', theme: '视野', colorGain: 11, mechanic: 'fog' },
  { id: 5, name: '初遇', theme: '二段跳', colorGain: 11, mechanic: 'doubleJump' },
  { id: 6, name: '心跳', theme: '节奏', colorGain: 11, mechanic: 'rhythm' },
  { id: 7, name: '镜像', theme: '镜像', colorGain: 11, mechanic: 'mirror' },
  { id: 8, name: '暴雨', theme: '干扰', colorGain: 11, mechanic: 'rain' },
  { id: 9, name: '重逢', theme: '综合', colorGain: 12, mechanic: 'final' }
];

const FRAGMENTS = [
  '你的声音：那天你说，没有我的世界都是黑白。',
  '并肩的影子：即使疏离，也曾并肩而行。',
  '逆行的钟：时间倒流，心却向前。',
  '雾中的手：看不见时，仍想抓住你。',
  '初遇之地：你的笑让世界有了色彩。',
  '心跳声：越靠近你，越无法平静。',
  '镜中的我们：脆弱和坚定都是真的。',
  '雨中的承诺：暴雨落下，誓言仍在。',
  '门的另一边：我在这里，等你。'
];

function createGame() {
  const systemInfo = wx.getSystemInfoSync();
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');
  canvas.width = systemInfo.windowWidth;
  canvas.height = systemInfo.windowHeight;

  const state = {
    scene: 'menu',
    selectedRole: 0,
    levelIndex: 0,
    colorProgress: 0,
    unlockedDoubleJump: false,
    stars: Array(9).fill(false),
    fragments: Array(9).fill(false),
    levelStartTime: 0,
    winMessageTime: 0,
    player: {
      x: 40,
      y: GROUND_Y - 36,
      w: 24,
      h: 36,
      vx: 0,
      vy: 0,
      onGround: true,
      jumpCount: 0
    },
    controls: {
      left: false,
      right: false,
      jumpPressed: false
    }
  };

  const memory = {
    load() {
      try {
        const saved = wx.getStorageSync('reunion-save-v1');
        if (saved && typeof saved === 'object') {
          Object.assign(state, {
            colorProgress: saved.colorProgress || 0,
            levelIndex: saved.levelIndex || 0,
            unlockedDoubleJump: !!saved.unlockedDoubleJump,
            stars: saved.stars || state.stars,
            fragments: saved.fragments || state.fragments
          });
        }
      } catch (e) {
        console.warn('load storage failed', e);
      }
    },
    save() {
      try {
        wx.setStorageSync('reunion-save-v1', {
          colorProgress: state.colorProgress,
          levelIndex: state.levelIndex,
          unlockedDoubleJump: state.unlockedDoubleJump,
          stars: state.stars,
          fragments: state.fragments
        });
      } catch (e) {
        console.warn('save storage failed', e);
      }
    }
  };

  function levelObjects(idx) {
    const sx = canvas.width / WIDTH;
    const sy = canvas.height / HEIGHT;
    const base = [
      { x: 0, y: GROUND_Y, w: WIDTH, h: 80 },
      { x: 100, y: 530, w: 60, h: 14 },
      { x: 190, y: 500, w: 60, h: 14 },
      { x: 280, y: 470, w: 60, h: 14 }
    ];

    if (idx === 1) {
      base[1].x = 130; base[2].x = 235; base[3].x = 320;
    }
    if (idx === 2) {
      base.push({ x: 240, y: 560, w: 90, h: 12, conveyor: -1 });
    }
    if (idx === 3) {
      base.push({ x: 150, y: 430, w: 80, h: 12, fogBeacon: true });
    }
    if (idx >= 4) {
      base.push({ x: 120, y: 430, w: 50, h: 12 });
      base.push({ x: 205, y: 390, w: 50, h: 12 });
    }
    if (idx === 5) {
      base.forEach((p, i) => { if (i > 0) p.rhythm = true; });
    }
    if (idx === 6) {
      base.forEach((p, i) => { if (i > 0) p.mx = WIDTH - p.x - p.w; });
    }

    const fragment = { x: 210, y: 350, r: 10, taken: state.fragments[idx] };
    const goal = { x: 340, y: 420, w: 26, h: 48 };

    return {
      platforms: base.map(p => ({
        ...p,
        x: p.x * sx,
        y: p.y * sy,
        w: p.w * sx,
        h: p.h * sy,
        mx: p.mx !== undefined ? p.mx * sx : undefined
      })),
      fragment: { ...fragment, x: fragment.x * sx, y: fragment.y * sy, r: fragment.r * sx },
      goal: { x: goal.x * sx, y: goal.y * sy, w: goal.w * sx, h: goal.h * sy }
    };
  }

  function resetPlayer() {
    state.player.x = 30;
    state.player.y = canvas.height * 0.78;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.onGround = false;
    state.player.jumpCount = 0;
    state.levelStartTime = Date.now();
  }

  function startLevel(idx) {
    state.scene = 'playing';
    state.levelIndex = idx;
    state.current = levelObjects(idx);
    resetPlayer();
  }

  function physics(dt) {
    const p = state.player;
    const level = LEVELS[state.levelIndex];
    const speed = canvas.width * 0.4;

    p.vx = 0;
    if (state.controls.left) p.vx -= speed;
    if (state.controls.right) p.vx += speed;

    if (level.mechanic === 'reverse') p.vx *= -1;

    p.vy += 1800 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < 0) p.x = 0;
    if (p.x + p.w > canvas.width) p.x = canvas.width - p.w;

    p.onGround = false;
    for (const plat of state.current.platforms) {
      const hit = p.x < plat.x + plat.w && p.x + p.w > plat.x && p.y + p.h > plat.y && p.y + p.h < plat.y + plat.h + 20 && p.vy >= 0;
      if (hit) {
        p.y = plat.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpCount = 0;
        if (plat.conveyor) p.x += plat.conveyor * 60 * dt;
      }
    }

    if (p.y > canvas.height + 50) {
      resetPlayer();
    }

    const frag = state.current.fragment;
    if (!frag.taken) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if ((cx - frag.x) ** 2 + (cy - frag.y) ** 2 < (frag.r + 12) ** 2) {
        frag.taken = true;
        state.fragments[state.levelIndex] = true;
        if (state.levelIndex >= 4) state.unlockedDoubleJump = true;
        memory.save();
      }
    }

    const g = state.current.goal;
    if (p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y) {
      completeLevel();
    }
  }

  function jump() {
    const p = state.player;
    const canDouble = state.unlockedDoubleJump;
    if (p.onGround) {
      p.vy = -700;
      p.onGround = false;
      p.jumpCount = 1;
      return;
    }
    if (canDouble && p.jumpCount < 2) {
      p.vy = -640;
      p.jumpCount += 1;
    }
  }

  function completeLevel() {
    const idx = state.levelIndex;
    const level = LEVELS[idx];
    state.colorProgress = Math.min(100, state.colorProgress + level.colorGain);

    const useSec = (Date.now() - state.levelStartTime) / 1000;
    if (useSec <= 25) state.stars[idx] = true;

    state.winMessageTime = Date.now();
    state.scene = idx === LEVELS.length - 1 ? 'ending' : 'map';
    memory.save();
  }

  function drawBackground() {
    const sat = state.colorProgress / 100;
    const gray = 220 - Math.floor(sat * 110);
    const c1 = `rgb(${gray},${gray},${gray})`;
    const c2 = sat > 0.5 ? `rgb(${90 + sat * 80},${120 + sat * 70},${160 + sat * 50})` : c1;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (LEVELS[state.levelIndex]?.mechanic === 'rain') {
      ctx.strokeStyle = 'rgba(180,180,200,0.5)';
      for (let i = 0; i < 40; i += 1) {
        const x = (i * 17 + Date.now() * 0.2) % canvas.width;
        const y = (i * 39 + Date.now() * 0.5) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 14);
        ctx.stroke();
      }
    }
  }

  function drawMenu() {
    drawBackground();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('当你不在的世界', 30, 80);
    ctx.font = '16px sans-serif';
    ctx.fillText('第一季·重逢篇', 30, 110);
    ctx.fillText('点击选择角色开始', 30, 140);

    drawRoleButton(40, 210, '男孩', state.selectedRole === 0);
    drawRoleButton(210, 210, '女孩', state.selectedRole === 1);

    drawButton(40, 320, 280, 46, '开始追寻');
  }

  function drawRoleButton(x, y, text, active) {
    ctx.fillStyle = active ? '#ffd66b' : 'rgba(255,255,255,0.75)';
    ctx.fillRect(x, y, 120, 60);
    ctx.fillStyle = '#222';
    ctx.font = '18px sans-serif';
    ctx.fillText(text, x + 38, y + 36);
  }

  function drawMap() {
    drawBackground();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('记忆拼图地图', 30, 60);
    ctx.font = '14px sans-serif';
    ctx.fillText(`色彩恢复 ${state.colorProgress}%`, 30, 85);

    for (let i = 0; i < 9; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = 40 + col * 100;
      const y = 120 + row * 100;
      const unlocked = i <= state.levelIndex;
      ctx.fillStyle = unlocked ? '#f4efe5' : 'rgba(40,40,40,0.3)';
      ctx.fillRect(x, y, 80, 80);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(x, y, 80, 80);
      ctx.fillStyle = '#111';
      ctx.font = '13px sans-serif';
      ctx.fillText(`关${i + 1}`, x + 25, y + 24);
      if (state.fragments[i]) ctx.fillText('碎片✓', x + 18, y + 46);
      if (state.stars[i]) ctx.fillText('★', x + 35, y + 68);
    }

    const idx = Math.min(state.levelIndex, 8);
    const fragText = FRAGMENTS[idx];
    ctx.fillStyle = '#222';
    ctx.fillText('当前记忆：', 30, 450);
    wrapText(fragText, 30, 475, canvas.width - 60, 20);
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

  function drawPlaying() {
    drawBackground();
    const level = LEVELS[state.levelIndex];

    if (level.mechanic === 'fog') {
      ctx.fillStyle = 'rgba(220,220,220,0.65)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const p = state.player;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(p.x + 12, p.y + 18, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#444';
    state.current.platforms.forEach((plat, i) => {
      let drawX = plat.x;
      if (level.mechanic === 'rhythm' && i > 0) {
        const t = Math.floor(Date.now() / 500) % 2;
        if (t === 0) return;
      }
      if (level.mechanic === 'mirror' && i > 0 && plat.mx !== undefined) drawX = plat.mx;
      ctx.fillRect(drawX, plat.y, plat.w, plat.h);
    });

    const frag = state.current.fragment;
    if (!frag.taken) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(frag.x, frag.y, frag.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const goal = state.current.goal;
    ctx.fillStyle = '#8dd3ff';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);

    const p = state.player;
    ctx.fillStyle = state.selectedRole === 0 ? '#5b7fff' : '#ff7ab8';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.fillStyle = '#111';
    ctx.font = '14px sans-serif';
    ctx.fillText(`关卡${level.id} ${level.name} | 色彩 ${state.colorProgress}%`, 16, 28);
    ctx.fillText('← → 移动，点击右下角跳跃', 16, 48);

    drawTouchHints();
  }

  function drawTouchHints() {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#111';
    ctx.fillRect(10, canvas.height - 120, 120, 100);
    ctx.fillRect(canvas.width - 130, canvas.height - 120, 120, 100);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#111';
    ctx.fillText('左/右', 52, canvas.height - 62);
    ctx.fillText('跳', canvas.width - 74, canvas.height - 62);
  }

  function drawEnding() {
    drawBackground();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('重逢', 30, 90);
    ctx.font = '16px sans-serif';
    ctx.fillText('拼图已完整，世界恢复色彩。', 30, 130);
    ctx.fillText('“我找回了色彩，也找回了你。”', 30, 160);
    ctx.fillText(`已收集碎片 ${state.fragments.filter(Boolean).length}/9`, 30, 200);

    drawButton(30, 260, 300, 46, '分享结局文案');
    drawButton(30, 320, 300, 46, '回到地图');
  }

  function drawButton(x, y, w, h, text) {
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#222';
    ctx.font = '16px sans-serif';
    ctx.fillText(text, x + 16, y + 29);
  }

  function onTouchStart(e) {
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    const y = touch.clientY;

    if (state.scene === 'menu') {
      if (hit(x, y, 40, 210, 120, 60)) state.selectedRole = 0;
      if (hit(x, y, 210, 210, 120, 60)) state.selectedRole = 1;
      if (hit(x, y, 40, 320, 280, 46)) {
        state.levelIndex = 0;
        state.scene = 'map';
      }
      return;
    }

    if (state.scene === 'map') {
      for (let i = 0; i <= state.levelIndex && i < 9; i += 1) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        if (hit(x, y, 40 + col * 100, 120 + row * 100, 80, 80)) {
          startLevel(i);
          return;
        }
      }
      return;
    }

    if (state.scene === 'playing') {
      if (x < canvas.width * 0.35) {
        state.controls.left = true;
      } else if (x < canvas.width * 0.7) {
        state.controls.right = true;
      } else {
        jump();
      }
      return;
    }

    if (state.scene === 'ending') {
      if (hit(x, y, 30, 260, 300, 46)) {
        wx.shareAppMessage({
          title: '我找回了色彩，也找回了你。',
          imageUrl: '',
          query: 'from=reunion-ending'
        });
      }
      if (hit(x, y, 30, 320, 300, 46)) {
        state.scene = 'map';
        state.levelIndex = 8;
      }
    }
  }

  function onTouchEnd() {
    state.controls.left = false;
    state.controls.right = false;
  }

  function hit(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  let last = Date.now();
  function loop() {
    const now = Date.now();
    const dt = Math.min((now - last) / 1000, 0.03);
    last = now;

    if (state.scene === 'playing') physics(dt);

    if (state.scene === 'menu') drawMenu();
    if (state.scene === 'map') drawMap();
    if (state.scene === 'playing') drawPlaying();
    if (state.scene === 'ending') drawEnding();

    requestAnimationFrame(loop);
  }

  memory.load();
  wx.onTouchStart(onTouchStart);
  wx.onTouchEnd(onTouchEnd);
  loop();
}

module.exports = { createGame };
