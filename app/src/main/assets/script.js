/**
 * ============================================================================
 * LUDO MASTER - Production Ready Game Engine
 * Features:
 * - 2 to 4 Players (Pass & Play + Local AI Bots)
 * - Exact Pathfinding, Yards, Home Runs, Safe Zones
 * - 3D Animated Dice with Bonus Rolls on 6 & Captures
 * - Opponent Token Capturing & Return to Yard
 * - Web Audio API Synthesizer (Zero External Dependencies)
 * - LocalStorage State Persistence
 * - Full Screen Confetti Particle Celebration
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Constants & Grid Coordinate Mapping ---
  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const COLOR_NAMES = {
    red: 'Red',
    green: 'Green',
    yellow: 'Yellow',
    blue: 'Blue'
  };

  // Safe zones (indices along the 52-cell main track)
  // 4 start positions: [0, 13, 26, 39]
  // 4 star cells: [8, 21, 34, 47]
  const SAFE_TRACK_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Main 52-cell track coordinates in 15x15 grid [row, col]
  const TRACK_COORDS = [
    [6, 1],  [6, 2],  [6, 3],  [6, 4],  [6, 5],   // 0..4 (Red Start is 0)
    [5, 6],  [4, 6],  [3, 6],  [2, 6],  [1, 6],  [0, 6], // 5..10 (8 is Star)
    [0, 7],                                              // 11
    [0, 8],  [1, 8],  [2, 8],  [3, 8],  [4, 8],  [5, 8], // 12..17 (13 is Green Start)
    [6, 9],  [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18..23 (21 is Star)
    [7, 14],                                             // 24
    [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 25..30 (26 is Yellow Start)
    [9, 8],  [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31..36 (34 is Star)
    [14, 7],                                             // 37
    [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 38..43 (39 is Blue Start)
    [8, 5],  [8, 4],  [8, 3],  [8, 2],  [8, 1],  [8, 0], // 44..49 (47 is Star)
    [7, 0],                                              // 50
    [6, 0]                                               // 51
  ];

  // Track start offset for each player along the 52-cell loop
  const PLAYER_START_OFFSETS = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39
  };

  // Colored Home corridor coordinates (steps 51 to 55) & Center Goal (step 56)
  const HOME_PATHS = {
    red: [
      [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6] // 7,6 is Red Goal
    ],
    green: [
      [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7] // 6,7 is Green Goal
    ],
    yellow: [
      [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8] // 7,8 is Yellow Goal
    ],
    blue: [
      [13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7] // 8,7 is Blue Goal
    ]
  };

  // Yard coordinates inside 6x6 base for 4 tokens
  const YARD_SLOT_COORDS = {
    red: [
      [1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]
    ],
    green: [
      [1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]
    ],
    yellow: [
      [10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]
    ],
    blue: [
      [10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]
    ]
  };

  const TOTAL_STEPS_TO_GOAL = 56; // 0 (start) to 56 (goal)

  // --- Web Audio API Synthesizer ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem('ludo_sound_muted') === 'true';
    }

    init() {
      if (!this.ctx && typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('ludo_sound_muted', this.muted);
      return this.muted;
    }

    playRoll() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Rattle sound sequence
      for (let i = 0; i < 6; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150 + Math.random() * 220, now + i * 0.06);
        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.05);
      }
    }

    playMove() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    playUnlock() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.18, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.15);
      });
    }

    playCapture() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.28);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }

    playGoal() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [659.25, 880, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.2, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.25);
      });
    }

    playVictory() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const fanfare = [
        { f: 523.25, d: 0.15 },
        { f: 659.25, d: 0.15 },
        { f: 783.99, d: 0.15 },
        { f: 1046.5, d: 0.45 }
      ];
      let t = now;
      fanfare.forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + note.d);
        t += note.d + 0.05;
      });
    }
  }

  // --- Confetti Canvas System ---
  class ConfettiSystem {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.particles = [];
      this.animId = null;
      this.resize = this.resize.bind(this);

      if (this.canvas) {
        window.addEventListener('resize', this.resize);
        this.resize();
      }
    }

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    start() {
      if (!this.canvas || !this.ctx) return;
      this.particles = [];
      const colors = ['#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
      for (let i = 0; i < 180; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height * 0.4,
          r: Math.random() * 6 + 4,
          d: Math.random() * 40 + 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          vx: (Math.random() - 0.5) * 6,
          vy: Math.random() * 4 + 2,
          tilt: Math.random() * 20 - 10,
          tiltAngle: 0,
          tiltAngleInc: (Math.random() * 0.07) + 0.05
        });
      }

      if (this.animId) cancelAnimationFrame(this.animId);
      this.animate();
    }

    animate() {
      if (!this.canvas || !this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.tiltAngle += p.tiltAngleInc;
        p.y += p.vy;
        p.x += p.vx;
        p.tilt = Math.sin(p.tiltAngle) * 15;

        this.ctx.beginPath();
        this.ctx.lineWidth = p.r;
        this.ctx.strokeStyle = p.color;
        this.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        this.ctx.stroke();

        if (p.y > this.canvas.height) {
          p.y = -10;
          p.x = Math.random() * this.canvas.width;
        }
      }

      this.animId = requestAnimationFrame(this.animate.bind(this));
    }

    stop() {
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
  }

  // --- Main Ludo Game State and Logic ---
  class LudoGame {
    constructor() {
      this.sound = new SoundEngine();
      this.confetti = new ConfettiSystem('confettiCanvas');

      // Default Players configuration
      this.playerCount = 4;
      this.players = {
        red: { name: 'Red', type: 'human', active: true, score: 0, tokens: [-1, -1, -1, -1] },
        green: { name: 'Green', type: 'bot', active: true, score: 0, tokens: [-1, -1, -1, -1] },
        yellow: { name: 'Yellow', type: 'bot', active: true, score: 0, tokens: [-1, -1, -1, -1] },
        blue: { name: 'Blue', type: 'bot', active: true, score: 0, tokens: [-1, -1, -1, -1] }
      };

      this.activeColors = ['red', 'green', 'yellow', 'blue'];
      this.currentTurnIndex = 0;
      this.diceValue = 1;
      this.hasRolled = false;
      this.isRolling = false;
      this.consecutiveSixes = 0;
      this.isProcessingMove = false;
      this.winner = null;
      this.stats = { totalTurns: 0, totalCaptures: 0 };

      // DOM Elements Cache
      this.dom = {};
      this.initDomReferences();
      this.renderBoardSkeleton();
      this.attachEventListeners();

      // Load Saved State if present
      if (!this.loadState()) {
        this.resetGame();
      } else {
        this.updateUi();
        this.renderTokens();
        // If it was a bot turn when saved, resume bot
        this.checkBotTurn();
      }
    }

    initDomReferences() {
      this.dom.ludoBoard = document.getElementById('ludoBoard');
      this.dom.diceCube = document.getElementById('diceCube');
      this.dom.rollDiceBtn = document.getElementById('rollDiceBtn');
      this.dom.diceValueText = document.getElementById('diceValueText');
      this.dom.statusInstruction = document.getElementById('statusInstruction');
      this.dom.turnText = document.getElementById('turnText');
      this.dom.turnPlayerName = document.getElementById('turnPlayerName');
      this.dom.turnColorDot = document.getElementById('turnColorDot');
      this.dom.turnGlow = document.getElementById('turnGlow');
      this.dom.consecutiveSixesBadge = document.getElementById('consecutiveSixesBadge');
      this.dom.gameLogList = document.getElementById('gameLogList');
      this.dom.soundToggleBtn = document.getElementById('soundToggleBtn');
      this.dom.clearLogBtn = document.getElementById('clearLogBtn');
      this.dom.newGameBtn = document.getElementById('newGameBtn');
      this.dom.rulesBtn = document.getElementById('rulesBtn');
      this.dom.setupModal = document.getElementById('setupModal');
      this.dom.closeSetupModalBtn = document.getElementById('closeSetupModalBtn');
      this.dom.startGameSubmitBtn = document.getElementById('startGameSubmitBtn');
      this.dom.victoryModal = document.getElementById('victoryModal');
      this.dom.winnerText = document.getElementById('winnerText');
      this.dom.statWinner = document.getElementById('statWinner');
      this.dom.statTurns = document.getElementById('statTurns');
      this.dom.statCaptures = document.getElementById('statCaptures');
      this.dom.rematchBtn = document.getElementById('rematchBtn');
      this.dom.closeVictoryModalBtn = document.getElementById('closeVictoryModalBtn');
      this.dom.rulesModal = document.getElementById('rulesModal');
      this.dom.closeRulesModalBtn = document.getElementById('closeRulesModalBtn');
      this.dom.understoodRulesBtn = document.getElementById('understoodRulesBtn');
    }

    // --- Board Skeleton Generation ---
    renderBoardSkeleton() {
      if (!this.dom.ludoBoard) return;
      this.dom.ludoBoard.innerHTML = '';

      // 1. Red Yard (Top Left: 0..5, 0..5)
      this.dom.ludoBoard.appendChild(this.createYardElement('red', '1 / 1 / 7 / 7'));

      // 2. Green Yard (Top Right: 0..5, 9..14)
      this.dom.ludoBoard.appendChild(this.createYardElement('green', '1 / 10 / 7 / 16'));

      // 3. Center Home (Rows 7..9, Cols 7..9 in 1-based CSS Grid)
      const centerHome = document.createElement('div');
      centerHome.style.gridArea = '7 / 7 / 10 / 10';
      centerHome.className = 'center-home';
      centerHome.innerHTML = `
        <div class="triangle-red"></div>
        <div class="triangle-green"></div>
        <div class="triangle-yellow"></div>
        <div class="triangle-blue"></div>
        <div class="home-center-icon">🏆</div>
      `;
      this.dom.ludoBoard.appendChild(centerHome);

      // 4. Blue Yard (Bottom Left: 9..14, 0..5)
      this.dom.ludoBoard.appendChild(this.createYardElement('blue', '10 / 1 / 16 / 7'));

      // 5. Yellow Yard (Bottom Right: 9..14, 9..14)
      this.dom.ludoBoard.appendChild(this.createYardElement('yellow', '10 / 10 / 16 / 16'));

      // 6. Track and Corridor Cells (15x15)
      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          // Check if this cell is inside a yard or center home
          const inRedYard = r < 6 && c < 6;
          const inGreenYard = r < 6 && c > 8;
          const inBlueYard = r > 8 && c < 6;
          const inYellowYard = r > 8 && c > 8;
          const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

          if (inRedYard || inGreenYard || inBlueYard || inYellowYard || inCenter) {
            continue; // Already handled by yards / center
          }

          const cell = document.createElement('div');
          cell.id = `cell_${r}_${c}`;
          cell.className = 'board-cell';
          cell.style.gridRow = `${r + 1}`;
          cell.style.gridColumn = `${c + 1}`;

          // Stylize based on coordinate
          this.applyCellStyle(cell, r, c);
          this.dom.ludoBoard.appendChild(cell);
        }
      }
    }

    createYardElement(color, gridArea) {
      const yard = document.createElement('div');
      yard.style.gridArea = gridArea;
      yard.className = `yard bg-${color === 'red' ? 'red-600' : color === 'green' ? 'emerald-600' : color === 'yellow' ? 'amber-500' : 'blue-600'}`;
      yard.id = `yard_${color}`;

      const inner = document.createElement('div');
      inner.className = 'yard-inner';

      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = `yard-slot slot-${color}`;
        slot.id = `yard_slot_${color}_${i}`;
        inner.appendChild(slot);
      }

      yard.appendChild(inner);
      return yard;
    }

    applyCellStyle(cell, r, c) {
      // Home Paths
      if (r === 7 && c >= 1 && c <= 5) {
        cell.classList.add('bg-red-500'); // Red Home Path
      } else if (c === 7 && r >= 1 && r <= 5) {
        cell.classList.add('bg-emerald-500'); // Green Home Path
      } else if (r === 7 && c >= 9 && c <= 13) {
        cell.classList.add('bg-amber-500'); // Yellow Home Path
      } else if (c === 7 && r >= 9 && r <= 13) {
        cell.classList.add('bg-blue-500'); // Blue Home Path
      }

      // Start Positions
      if (r === 6 && c === 1) {
        cell.classList.add('bg-red-500', 'cell-red-start', 'safe-zone');
      } else if (r === 1 && c === 8) {
        cell.classList.add('bg-emerald-500', 'cell-green-start', 'safe-zone');
      } else if (r === 8 && c === 13) {
        cell.classList.add('bg-amber-500', 'cell-yellow-start', 'safe-zone');
      } else if (r === 13 && c === 6) {
        cell.classList.add('bg-blue-500', 'cell-blue-start', 'safe-zone');
      }

      // Safe Stars
      if ((r === 2 && c === 6) || (r === 6 && c === 12) || (r === 12 && c === 8) || (r === 8 && c === 2)) {
        cell.classList.add('safe-zone');
      }
    }

    // --- Event Listeners ---
    attachEventListeners() {
      // Dice Roll Click
      if (this.dom.rollDiceBtn) {
        this.dom.rollDiceBtn.addEventListener('click', () => this.handleRollDice());
      }
      if (this.dom.diceCube) {
        this.dom.diceCube.addEventListener('click', () => this.handleRollDice());
      }

      // Keyboard space to roll
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !this.hasRolled && !this.isRolling && !this.isCurrentPlayerBot()) {
          e.preventDefault();
          this.handleRollDice();
        }
      });

      // Sound Toggle
      if (this.dom.soundToggleBtn) {
        this.dom.soundToggleBtn.addEventListener('click', () => {
          const isMuted = this.sound.toggleMute();
          this.dom.soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
        });
        if (this.sound.muted) this.dom.soundToggleBtn.textContent = '🔇';
      }

      // Clear Log
      if (this.dom.clearLogBtn && this.dom.gameLogList) {
        this.dom.clearLogBtn.addEventListener('click', () => {
          this.dom.gameLogList.innerHTML = '';
        });
      }

      // New Game Modal Triggers
      if (this.dom.newGameBtn && this.dom.setupModal) {
        this.dom.newGameBtn.addEventListener('click', () => {
          this.dom.setupModal.classList.remove('hidden');
        });
      }
      if (this.dom.closeSetupModalBtn && this.dom.setupModal) {
        this.dom.closeSetupModalBtn.addEventListener('click', () => {
          this.dom.setupModal.classList.add('hidden');
        });
      }

      // Player Count selection inside setup modal
      const countBtns = document.querySelectorAll('.player-count-btn');
      countBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          countBtns.forEach(b => {
            b.classList.remove('border-indigo-500', 'bg-indigo-600/20', 'text-white', 'active-count');
            b.classList.add('border-slate-700', 'bg-slate-800', 'text-slate-300');
          });
          const target = e.currentTarget;
          target.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-white', 'active-count');
          target.classList.remove('border-slate-700', 'bg-slate-800', 'text-slate-300');

          const count = parseInt(target.getAttribute('data-players'), 10);
          this.updateSetupModalRows(count);
        });
      });

      // Start Game Submit
      if (this.dom.startGameSubmitBtn) {
        this.dom.startGameSubmitBtn.addEventListener('click', () => this.applyNewGameSetup());
      }

      // Rules Modal
      if (this.dom.rulesBtn && this.dom.rulesModal) {
        this.dom.rulesBtn.addEventListener('click', () => this.dom.rulesModal.classList.remove('hidden'));
      }
      if (this.dom.closeRulesModalBtn && this.dom.rulesModal) {
        this.dom.closeRulesModalBtn.addEventListener('click', () => this.dom.rulesModal.classList.add('hidden'));
      }
      if (this.dom.understoodRulesBtn && this.dom.rulesModal) {
        this.dom.understoodRulesBtn.addEventListener('click', () => this.dom.rulesModal.classList.add('hidden'));
      }

      // Victory Modal Rematch
      if (this.dom.rematchBtn) {
        this.dom.rematchBtn.addEventListener('click', () => {
          this.dom.victoryModal.classList.add('hidden');
          this.confetti.stop();
          this.resetGame();
        });
      }
      if (this.dom.closeVictoryModalBtn) {
        this.dom.closeVictoryModalBtn.addEventListener('click', () => {
          this.dom.victoryModal.classList.add('hidden');
          this.confetti.stop();
        });
      }
    }

    updateSetupModalRows(count) {
      const rows = document.querySelectorAll('.setup-player-row');
      rows.forEach(row => {
        const color = row.getAttribute('data-color');
        if (count === 2) {
          // 2 players: Red & Yellow (Opposite sides)
          row.style.display = (color === 'red' || color === 'yellow') ? 'flex' : 'none';
        } else if (count === 3) {
          // 3 players: Red, Green, Yellow
          row.style.display = (color !== 'blue') ? 'flex' : 'none';
        } else {
          // 4 players: all
          row.style.display = 'flex';
        }
      });
    }

    applyNewGameSetup() {
      const activeCountBtn = document.querySelector('.player-count-btn.active-count');
      const count = activeCountBtn ? parseInt(activeCountBtn.getAttribute('data-players'), 10) : 4;

      this.playerCount = count;
      let activeColors = [];

      if (count === 2) {
        activeColors = ['red', 'yellow'];
      } else if (count === 3) {
        activeColors = ['red', 'green', 'yellow'];
      } else {
        activeColors = ['red', 'green', 'yellow', 'blue'];
      }

      this.activeColors = activeColors;

      COLORS.forEach(color => {
        const isActive = activeColors.includes(color);
        const nameInput = document.getElementById(`setupName-${color}`);
        const typeSelect = document.getElementById(`setupType-${color}`);

        this.players[color] = {
          name: nameInput && nameInput.value.trim() ? nameInput.value.trim() : COLOR_NAMES[color],
          type: typeSelect ? typeSelect.value : 'human',
          active: isActive,
          score: 0,
          tokens: [-1, -1, -1, -1]
        };
      });

      if (this.dom.setupModal) {
        this.dom.setupModal.classList.add('hidden');
      }

      this.currentTurnIndex = 0;
      this.diceValue = 1;
      this.hasRolled = false;
      this.isRolling = false;
      this.consecutiveSixes = 0;
      this.winner = null;
      this.stats = { totalTurns: 0, totalCaptures: 0 };

      this.logActivity(`🎮 New game started with ${count} players!`, 'text-indigo-400 font-bold');
      this.saveState();
      this.updateUi();
      this.renderTokens();
      this.checkBotTurn();
    }

    getCurrentColor() {
      return this.activeColors[this.currentTurnIndex];
    }

    getCurrentPlayer() {
      return this.players[this.getCurrentColor()];
    }

    isCurrentPlayerBot() {
      return this.getCurrentPlayer().type === 'bot';
    }

    // --- Dice Rolling Engine ---
    handleRollDice() {
      if (this.isRolling || this.hasRolled || this.winner || this.isProcessingMove) return;

      this.isRolling = true;
      this.sound.playRoll();

      if (this.dom.rollDiceBtn) this.dom.rollDiceBtn.disabled = true;
      if (this.dom.diceCube) this.dom.diceCube.classList.add('dice-rolling');
      if (this.dom.statusInstruction) this.dom.statusInstruction.textContent = 'Rolling...';

      // Animate for 650ms
      setTimeout(() => {
        const rolledValue = Math.floor(Math.random() * 6) + 1;
        this.diceValue = rolledValue;
        this.hasRolled = true;
        this.isRolling = false;

        if (this.dom.diceCube) {
          this.dom.diceCube.classList.remove('dice-rolling');
          this.dom.diceCube.setAttribute('data-face', rolledValue);
        }

        if (this.dom.diceValueText) {
          this.dom.diceValueText.textContent = `Rolled a ${rolledValue}!`;
        }

        this.stats.totalTurns++;
        this.logActivity(`${this.getCurrentPlayer().name} rolled a ${rolledValue}.`);

        // Check for 6
        if (rolledValue === 6) {
          this.consecutiveSixes++;
          if (this.dom.consecutiveSixesBadge) {
            this.dom.consecutiveSixesBadge.classList.remove('hidden');
          }

          // Anti-infinite rule: 3 consecutive 6s skips turn
          if (this.consecutiveSixes === 3) {
            this.logActivity(`⚠️ 3 consecutive sixes! Turn forfeit.`, 'text-rose-400');
            if (this.dom.statusInstruction) {
              this.dom.statusInstruction.textContent = '3 consecutive 6s! Turn forfeited.';
            }
            this.consecutiveSixes = 0;
            setTimeout(() => this.passTurn(), 1200);
            return;
          }
        } else {
          this.consecutiveSixes = 0;
          if (this.dom.consecutiveSixesBadge) {
            this.dom.consecutiveSixesBadge.classList.add('hidden');
          }
        }

        this.evaluateMoves();
      }, 650);
    }

    // --- Move Evaluation & Validation ---
    evaluateMoves() {
      const color = this.getCurrentColor();
      const player = this.getCurrentPlayer();
      const dice = this.diceValue;

      const validTokenIndices = [];

      player.tokens.forEach((step, tokenIdx) => {
        if (this.canTokenMove(color, step, dice)) {
          validTokenIndices.push(tokenIdx);
        }
      });

      this.saveState();

      if (validTokenIndices.length === 0) {
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = `No valid moves for rolled ${dice}. Passing turn...`;
        }
        setTimeout(() => this.passTurn(), 1200);
        return;
      }

      // If Bot: Execute intelligent AI choice
      if (this.isCurrentPlayerBot()) {
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = `${player.name} (Bot) is deciding...`;
        }
        setTimeout(() => {
          const chosenToken = this.chooseBestBotMove(color, validTokenIndices, dice);
          this.moveToken(color, chosenToken, dice);
        }, 750);
        return;
      }

      // If Human:
      if (validTokenIndices.length === 1) {
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = 'Tap your glowing token to move!';
        }
      } else {
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = `Select which of your ${validTokenIndices.length} movable tokens to advance.`;
        }
      }

      this.highlightMovableTokens(color, validTokenIndices);
    }

    canTokenMove(color, step, dice) {
      // In Yard: only movable if rolled a 6
      if (step === -1) {
        return dice === 6;
      }
      // Reached Goal: cannot move further
      if (step >= TOTAL_STEPS_TO_GOAL) {
        return false;
      }
      // Exact roll requirement to reach goal
      if (step + dice > TOTAL_STEPS_TO_GOAL) {
        return false;
      }
      return true;
    }

    highlightMovableTokens(color, validIndices) {
      // Clear previous movable classes
      document.querySelectorAll('.token-movable').forEach(t => t.classList.remove('token-movable'));

      validIndices.forEach(idx => {
        const tokenElem = document.getElementById(`token_${color}_${idx}`);
        if (tokenElem) {
          tokenElem.classList.add('token-movable');
          tokenElem.onclick = () => {
            if (!this.isProcessingMove && this.hasRolled && !this.isCurrentPlayerBot()) {
              this.moveToken(color, idx, this.diceValue);
            }
          };
        }
      });
    }

    // --- Token Movement & Animation ---
    moveToken(color, tokenIndex, dice) {
      this.isProcessingMove = true;
      const player = this.players[color];
      const startStep = player.tokens[tokenIndex];

      // Remove movable classes & handlers
      document.querySelectorAll('.token-movable').forEach(t => {
        t.classList.remove('token-movable');
        t.onclick = null;
      });

      // 1. Unlocking from yard
      if (startStep === -1 && dice === 6) {
        player.tokens[tokenIndex] = 0; // Move onto starting cell
        this.sound.playUnlock();
        this.logActivity(`🎉 ${player.name} unlocked a token from yard!`, 'text-emerald-400 font-semibold');
        this.renderTokens();

        // Check capture on starting cell
        this.handleArrival(color, tokenIndex, 0, true);
        return;
      }

      // 2. Stepping across track towards goal
      const targetStep = startStep + dice;
      let currentStep = startStep;

      const stepInterval = setInterval(() => {
        currentStep++;
        player.tokens[tokenIndex] = currentStep;
        this.sound.playMove();
        this.renderTokens();

        if (currentStep >= targetStep) {
          clearInterval(stepInterval);
          this.handleArrival(color, tokenIndex, targetStep, false);
        }
      }, 160);
    }

    handleArrival(color, tokenIndex, finalStep, wasYardUnlock) {
      const player = this.players[color];

      // Reached Home Goal
      if (finalStep === TOTAL_STEPS_TO_GOAL) {
        player.score++;
        this.sound.playGoal();
        this.logActivity(`🏁 ${player.name}'s token entered the Home Goal! (${player.score}/4)`, 'text-amber-400 font-bold');

        // Check Win Condition
        if (player.score >= 4) {
          this.handleVictory(color);
          return;
        }

        // Bonus turn awarded for reaching home!
        this.grantBonusTurn(`${player.name} scored a token in Goal! Bonus turn awarded!`);
        return;
      }

      // Check Captures on common track
      let capturedOpponent = false;
      const coords = this.getGridCoordsForStep(color, finalStep);

      // Only check capture if on common track (finalStep <= 50) and not in home corridor
      if (coords && finalStep <= 50) {
        const isSafe = this.isCellSafe(color, finalStep);

        if (!isSafe) {
          // Look for opponents on this exact coordinate
          this.activeColors.forEach(otherColor => {
            if (otherColor !== color) {
              const otherPlayer = this.players[otherColor];
              otherPlayer.tokens.forEach((otherStep, otherIdx) => {
                if (otherStep >= 0 && otherStep <= 50) {
                  const otherCoords = this.getGridCoordsForStep(otherColor, otherStep);
                  if (otherCoords && otherCoords[0] === coords[0] && otherCoords[1] === coords[1]) {
                    // Capture!
                    otherPlayer.tokens[otherIdx] = -1; // Send back to yard
                    capturedOpponent = true;
                    this.stats.totalCaptures++;
                    this.sound.playCapture();
                    this.logActivity(`💥 ${player.name} captured ${otherPlayer.name}'s token!`, 'text-rose-400 font-bold');
                  }
                }
              });
            }
          });
        }
      }

      this.renderTokens();
      this.saveState();

      if (capturedOpponent) {
        this.grantBonusTurn(`${player.name} captured an opponent! Bonus roll awarded!`);
        return;
      }

      // If rolled 6 (and not forfeited), grant bonus turn
      if (this.diceValue === 6) {
        this.grantBonusTurn(`${player.name} rolled a 6! Extra roll awarded!`);
        return;
      }

      // Turn finished -> pass to next player
      this.isProcessingMove = false;
      this.passTurn();
    }

    grantBonusTurn(message) {
      this.hasRolled = false;
      this.isProcessingMove = false;
      if (this.dom.rollDiceBtn) this.dom.rollDiceBtn.disabled = false;
      if (this.dom.statusInstruction) this.dom.statusInstruction.textContent = message;
      this.updateUi();
      this.checkBotTurn();
    }

    passTurn() {
      this.hasRolled = false;
      this.isProcessingMove = false;
      this.consecutiveSixes = 0;
      if (this.dom.consecutiveSixesBadge) {
        this.dom.consecutiveSixesBadge.classList.add('hidden');
      }

      // Cycle to next active player
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.activeColors.length;
      this.updateUi();
      this.saveState();
      this.checkBotTurn();
    }

    checkBotTurn() {
      if (this.winner) return;
      if (this.isCurrentPlayerBot()) {
        if (this.dom.rollDiceBtn) this.dom.rollDiceBtn.disabled = true;
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = `${this.getCurrentPlayer().name} (Bot) is preparing to roll...`;
        }
        setTimeout(() => {
          if (!this.hasRolled && !this.isRolling && !this.winner) {
            this.handleRollDice();
          }
        }, 900);
      } else {
        if (this.dom.rollDiceBtn) this.dom.rollDiceBtn.disabled = false;
        if (this.dom.statusInstruction) {
          this.dom.statusInstruction.textContent = `Your turn, ${this.getCurrentPlayer().name}! Tap ROLL DICE.`;
        }
      }
    }

    // --- Intelligent Bot AI Decision Matrix ---
    chooseBestBotMove(color, validIndices, dice) {
      if (validIndices.length === 1) return validIndices[0];

      let bestScore = -Infinity;
      let bestIndex = validIndices[0];

      validIndices.forEach(idx => {
        const currentStep = this.players[color].tokens[idx];
        let score = 0;

        // 1. Prioritize unlocking a token from yard if rolled 6 (+600)
        if (currentStep === -1) {
          score += 600;
        } else {
          const nextStep = currentStep + dice;

          // 2. Prioritize reaching Home Goal (+1200)
          if (nextStep === TOTAL_STEPS_TO_GOAL) {
            score += 1200;
          }

          // 3. Prioritize Capturing Opponent Token (+1000)
          if (nextStep <= 50) {
            const nextCoords = this.getGridCoordsForStep(color, nextStep);
            const isSafe = this.isCellSafe(color, nextStep);

            if (nextCoords && !isSafe) {
              this.activeColors.forEach(otherColor => {
                if (otherColor !== color) {
                  this.players[otherColor].tokens.forEach(otherStep => {
                    if (otherStep >= 0 && otherStep <= 50) {
                      const otherCoords = this.getGridCoordsForStep(otherColor, otherStep);
                      if (otherCoords && otherCoords[0] === nextCoords[0] && otherCoords[1] === nextCoords[1]) {
                        score += 1000;
                      }
                    }
                  });
                }
              });
            }

            // 4. Moving into Safe Zone (+350)
            if (isSafe) {
              score += 350;
            }
          }

          // 5. Entering the safety of Home corridor (+300)
          if (nextStep > 50 && currentStep <= 50) {
            score += 300;
          }

          // 6. Prefer moving pieces further ahead to clear way (+step points)
          score += currentStep * 5;
        }

        // Add small random noise to prevent mechanical repetition
        score += Math.random() * 20;

        if (score > bestScore) {
          bestScore = score;
          bestIndex = idx;
        }
      });

      return bestIndex;
    }

    // --- Coordinate & Position Helpers ---
    getGridCoordsForStep(color, step) {
      if (step === -1) return null; // In Yard
      if (step > TOTAL_STEPS_TO_GOAL) return null;

      // On 52-cell outer track (step 0 to 50)
      if (step <= 50) {
        const offset = PLAYER_START_OFFSETS[color];
        const trackIndex = (offset + step) % 52;
        return TRACK_COORDS[trackIndex];
      }

      // In Colored Home Path (step 51 to 56)
      const homeStep = step - 51; // 0 to 5
      const homePath = HOME_PATHS[color];
      if (homePath && homePath[homeStep]) {
        return homePath[homeStep];
      }
      return null;
    }

    isCellSafe(color, step) {
      if (step > 50) return true; // All home corridor steps are safe
      const offset = PLAYER_START_OFFSETS[color];
      const trackIndex = (offset + step) % 52;
      return SAFE_TRACK_INDICES.has(trackIndex);
    }

    // --- Token Rendering with Clustering ---
    renderTokens() {
      // Clear existing tokens from board
      document.querySelectorAll('.token').forEach(el => el.remove());

      // Track cell occupancy to cluster multiple tokens on the same cell
      const cellOccupancy = {};

      COLORS.forEach(color => {
        const player = this.players[color];
        if (!player || !player.active) return;

        player.tokens.forEach((step, tokenIdx) => {
          const token = document.createElement('div');
          token.id = `token_${color}_${tokenIdx}`;
          token.className = `token token-${color}`;
          token.setAttribute('data-color', color);
          token.setAttribute('data-token-idx', tokenIdx);

          if (step === -1) {
            // Place inside Yard Slot
            const yardSlot = document.getElementById(`yard_slot_${color}_${tokenIdx}`);
            if (yardSlot) {
              yardSlot.appendChild(token);
            }
          } else {
            // Place onto Board Grid Cell
            const coords = this.getGridCoordsForStep(color, step);
            if (coords) {
              const [row, col] = coords;
              const cellKey = `${row}_${col}`;

              if (!cellOccupancy[cellKey]) {
                cellOccupancy[cellKey] = [];
              }
              cellOccupancy[cellKey].push(token);

              let targetParent = document.getElementById(`cell_${row}_${col}`);
              // If it's inside center home
              if (!targetParent && (row >= 6 && row <= 8 && col >= 6 && col <= 8)) {
                targetParent = document.querySelector('.center-home');
              }

              if (targetParent) {
                targetParent.appendChild(token);
              }
            }
          }
        });
      });

      // Apply cluster classes if multiple tokens occupy the same cell
      Object.keys(cellOccupancy).forEach(key => {
        const tokensInCell = cellOccupancy[key];
        if (tokensInCell.length > 1) {
          tokensInCell.forEach((tok, i) => {
            tok.classList.add(`token-cluster-${(i % 4) + 1}`);
          });
        }
      });
    }

    // --- UI State Updates ---
    updateUi() {
      const currentColor = this.getCurrentColor();
      const currentPlayer = this.getCurrentPlayer();

      // Update Turn Banner & Badges
      if (this.dom.turnPlayerName) {
        this.dom.turnPlayerName.textContent = `${currentPlayer.name}'s Turn`;
      }
      if (this.dom.turnColorDot) {
        const colorClasses = {
          red: 'bg-red-500',
          green: 'bg-emerald-500',
          yellow: 'bg-amber-500',
          blue: 'bg-blue-500'
        };
        this.dom.turnColorDot.className = `w-3.5 h-3.5 rounded-full inline-block shadow-sm ${colorClasses[currentColor]}`;
      }
      if (this.dom.turnGlow) {
        const glowColors = {
          red: 'bg-red-500/25',
          green: 'bg-emerald-500/25',
          yellow: 'bg-amber-500/25',
          blue: 'bg-blue-500/25'
        };
        this.dom.turnGlow.className = `absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl pointer-events-none transition-all duration-500 ${glowColors[currentColor]}`;
      }

      // Update Player Cards (Active glow, Scores, Names)
      COLORS.forEach(c => {
        const card = document.getElementById(`playerCard-${c}`);
        const nameEl = document.getElementById(`playerName-${c}`);
        const typeEl = document.getElementById(`playerType-${c}`);
        const scoreEl = document.getElementById(`playerScore-${c}`);
        const badgeEl = document.getElementById(`playerBadge-${c}`);
        const p = this.players[c];

        if (card) {
          if (!p.active) {
            card.style.opacity = '0.35';
            card.style.borderColor = 'transparent';
          } else {
            card.style.opacity = '1';
            if (c === currentColor) {
              const borderColors = {
                red: 'border-red-500 shadow-lg shadow-red-500/20',
                green: 'border-emerald-500 shadow-lg shadow-emerald-500/20',
                yellow: 'border-amber-500 shadow-lg shadow-amber-500/20',
                blue: 'border-blue-500 shadow-lg shadow-blue-500/20'
              };
              card.className = `player-card flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-900 border-2 transition-all duration-300 ${borderColors[c]}`;
              if (badgeEl) badgeEl.classList.remove('hidden');
            } else {
              card.className = 'player-card flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-900 border-2 border-slate-800 transition-all duration-300';
              if (badgeEl) badgeEl.classList.add('hidden');
            }
          }
        }

        if (nameEl) nameEl.textContent = p.name;
        if (typeEl) typeEl.textContent = p.type === 'bot' ? 'BOT 🤖' : 'YOU';
        if (scoreEl) scoreEl.textContent = `${p.score}/4`;
      });
    }

    logActivity(text, extraClass = '') {
      if (!this.dom.gameLogList) return;
      const item = document.createElement('div');
      item.className = `leading-snug ${extraClass}`;
      item.textContent = text;
      this.dom.gameLogList.prepend(item);

      // Keep max 40 log lines
      while (this.dom.gameLogList.children.length > 40) {
        this.dom.gameLogList.removeChild(this.dom.gameLogList.lastChild);
      }
    }

    // --- Victory Handling ---
    handleVictory(color) {
      this.winner = color;
      const player = this.players[color];
      this.sound.playVictory();
      this.confetti.start();

      if (this.dom.winnerText) this.dom.winnerText.textContent = `${player.name} (${COLOR_NAMES[color]})`;
      if (this.dom.statWinner) this.dom.statWinner.textContent = `${player.name}`;
      if (this.dom.statTurns) this.dom.statTurns.textContent = `${this.stats.totalTurns}`;
      if (this.dom.statCaptures) this.dom.statCaptures.textContent = `${this.stats.totalCaptures}`;
      if (this.dom.victoryModal) this.dom.victoryModal.classList.remove('hidden');

      this.logActivity(`🏆 ${player.name} WINS THE MATCH! CONGRATULATIONS!`, 'text-amber-400 font-extrabold text-sm');
      localStorage.removeItem('ludo_game_state');
    }

    resetGame() {
      COLORS.forEach(color => {
        this.players[color].score = 0;
        this.players[color].tokens = [-1, -1, -1, -1];
      });
      this.currentTurnIndex = 0;
      this.diceValue = 1;
      this.hasRolled = false;
      this.isRolling = false;
      this.consecutiveSixes = 0;
      this.winner = null;
      this.stats = { totalTurns: 0, totalCaptures: 0 };

      this.saveState();
      this.updateUi();
      this.renderTokens();
      this.checkBotTurn();
    }

    // --- State Persistence (LocalStorage) ---
    saveState() {
      try {
        const state = {
          players: this.players,
          playerCount: this.playerCount,
          activeColors: this.activeColors,
          currentTurnIndex: this.currentTurnIndex,
          diceValue: this.diceValue,
          hasRolled: this.hasRolled,
          consecutiveSixes: this.consecutiveSixes,
          stats: this.stats
        };
        localStorage.setItem('ludo_game_state', JSON.stringify(state));
      } catch (e) {
        console.warn('Unable to save state to localStorage:', e);
      }
    }

    loadState() {
      try {
        const raw = localStorage.getItem('ludo_game_state');
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state || !state.players || !state.activeColors) return false;

        this.players = state.players;
        this.playerCount = state.playerCount || 4;
        this.activeColors = state.activeColors;
        this.currentTurnIndex = state.currentTurnIndex || 0;
        this.diceValue = state.diceValue || 1;
        this.hasRolled = state.hasRolled || false;
        this.consecutiveSixes = state.consecutiveSixes || 0;
        this.stats = state.stats || { totalTurns: 0, totalCaptures: 0 };
        return true;
      } catch (e) {
        console.warn('Unable to load state from localStorage:', e);
        return false;
      }
    }
  }

  // --- Bootstrap on DOM Load ---
  document.addEventListener('DOMContentLoaded', () => {
    window.ludoGame = new LudoGame();
  });
})();
