const DIFFICULTY = {
  EASY:   { tolerance: 18, wearMax: 10, damageMultiplier: 0.25 },
  MEDIUM: { tolerance: 12, wearMax: 8,  damageMultiplier: 0.35 },
  HARD:   { tolerance: 8,  wearMax: 6,  damageMultiplier: 0.45 },
  VERY:   { tolerance: 5,  wearMax: 5,  damageMultiplier: 0.5  },
};

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// --- DOM refs ---
const dial        = document.getElementById('dial');
const dialRotor   = document.getElementById('dialRotor');
const pick        = document.getElementById('pick');
const innerLock   = document.getElementById('innerLock');
const outerLock   = document.getElementById('outerLock');
const wrench      = document.getElementById('wrench');
const wearBar     = document.getElementById('wearBar');
const forceBar    = document.getElementById('forceBar');
const angleDisplay= document.getElementById('angleDisplay');
const statusText  = document.getElementById('statusText');

// --- State ---
let difficulty     = 'MEDIUM';
let preset         = DIFFICULTY[difficulty];
let sweetSpot      = rand(0, 180);
let pickAngle      = 90;
let wear           = 0;
let turningForce   = 0;
let lockRotation   = 0;
let maxLockRotation= 0;
let inSpot         = false;
let delta          = 0;
let isJammed       = false;
let success        = false;
let broke          = false;
let turningHeld    = false;
let isDragging     = false;
let forceInterval  = null;
let attemptInterval= null;

function resetGame() {
  preset        = DIFFICULTY[difficulty];
  sweetSpot     = rand(0, 180);
  pickAngle     = 90;
  wear          = 0;
  turningForce  = 0;
  lockRotation  = 0;
  maxLockRotation = 0;
  inSpot        = false;
  delta         = 0;
  isJammed      = false;
  success       = false;
  broke         = false;
  turningHeld   = false;
  clearInterval(forceInterval);
  clearInterval(attemptInterval);
  forceInterval = null;
  attemptInterval = null;
  dial.className = 'lockpick-dial';
  updateUI();
}

// --- Difficulty buttons ---
document.querySelectorAll('.difficulty-bar button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.difficulty-bar button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
    resetGame();
  });
});

// --- Dial: scroll ---
dial.addEventListener('wheel', e => {
  e.preventDefault();
  if (success || broke) return;
  const step = e.shiftKey ? 8 : 2;
  pickAngle = clamp(pickAngle + (e.deltaY > 0 ? step : -step), 0, 180);
  updateUI();
}, { passive: false });

// --- Dial: drag ---
dial.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (success || broke) return;
  isDragging = true;
  dial.setPointerCapture(e.pointerId);
  setAngleFromPointer(e);
});

dial.addEventListener('pointermove', e => {
  if (!isDragging) return;
  e.preventDefault();
  setAngleFromPointer(e);
});

dial.addEventListener('pointerup', e => {
  isDragging = false;
  try { dial.releasePointerCapture(e.pointerId); } catch(_) {}
});

dial.addEventListener('pointercancel', e => {
  isDragging = false;
  try { dial.releasePointerCapture(e.pointerId); } catch(_) {}
});

function setAngleFromPointer(e) {
  const rect = dial.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  pickAngle = clamp(Math.round(nx * 180), 0, 180);
  updateUI();
}

// --- Wrench: hold ---
wrench.addEventListener('pointerdown', e => {
  e.preventDefault();
  wrench.setPointerCapture(e.pointerId);
  startTurning();
});

wrench.addEventListener('pointerup', e => {
  try { wrench.releasePointerCapture(e.pointerId); } catch(_) {}
  stopTurning();
});

wrench.addEventListener('pointercancel', e => {
  try { wrench.releasePointerCapture(e.pointerId); } catch(_) {}
  stopTurning();
});

function startTurning() {
  if (turningHeld || success || broke) return;
  turningHeld = true;
  isJammed = false;

  delta = Math.abs(pickAngle - sweetSpot);
  inSpot = delta <= preset.tolerance;

  if (inSpot) {
    maxLockRotation = 90;
  } else {
    const effectiveRange = 30;
    const excess = delta - preset.tolerance;
    if (excess > effectiveRange) {
      maxLockRotation = 0;
    } else {
      const ratio = excess / effectiveRange;
      maxLockRotation = Math.pow(1 - ratio, 3) * 90;
    }
  }

  turningForce = 0.4;

  forceInterval = setInterval(() => {
    if (turningForce < 1.0) {
      turningForce = Math.min(1.0, turningForce + 0.06);
      updateUI();
    }
  }, 50);

  attemptInterval = setInterval(evaluateAttempt, 30);
  evaluateAttempt();
}

function stopTurning() {
  if (!turningHeld) return;
  turningHeld = false;
  isJammed = false;
  clearInterval(forceInterval);
  clearInterval(attemptInterval);
  forceInterval = null;
  attemptInterval = null;

  if (success) {
    const d = setInterval(() => {
      turningForce = Math.max(0, turningForce - 0.15);
      updateUI();
      if (turningForce <= 0) clearInterval(d);
    }, 30);
  } else {
    const d = setInterval(() => {
      turningForce = Math.max(0, turningForce - 0.15);
      lockRotation = Math.max(0, lockRotation - 8);
      updateUI();
      if (turningForce <= 0 && lockRotation <= 0) clearInterval(d);
    }, 30);
  }
}

function evaluateAttempt() {
  if (success || broke || !turningHeld) return;

  if (turningForce > 0.2) {
    if (lockRotation < maxLockRotation) {
      const speed = 3.5 * turningForce;
      lockRotation = Math.min(maxLockRotation, lockRotation + speed);
      isJammed = false;
    } else {
      if (!isJammed) isJammed = true;

      if (lockRotation >= 85 && inSpot) {
        success = true;
        lockRotation = 90;
        stopTurning();
        updateUI();
        return;
      }

      if (!inSpot) {
        const penalty = clamp((delta - preset.tolerance) / 20, 0.8, 4.0);
        wear += penalty * turningForce * preset.damageMultiplier * 0.9;
      }
    }
  }

  if (wear >= preset.wearMax) {
    broke = true;
    stopTurning();
    updateUI();
    setTimeout(() => {
      broke = false;
      wear = 0;
      lockRotation = 0;
      pickAngle = 90;
      turningForce = 0;
      isJammed = false;
      dial.className = 'lockpick-dial';
      updateUI();
    }, 800);
  } else {
    updateUI();
  }
}

function updateUI() {
  const css = pickAngle - 90;
  dialRotor.style.transform = `rotate(${css}deg)`;
  pick.style.transform = `translate(-50%, -100%) rotate(${css}deg)`;
  innerLock.style.transform = `rotate(${lockRotation}deg)`;
  angleDisplay.textContent = `${pickAngle}°`;
  wearBar.style.width = `${Math.min(100, (wear / preset.wearMax) * 100)}%`;
  forceBar.style.width = `${turningForce * 100}%`;

  if (success) {
    statusText.textContent = 'UNLOCKED!';
    statusText.style.color = '#00ff00';
  } else if (broke) {
    statusText.textContent = 'PICK BROKE!';
    statusText.style.color = '#ff0000';
  } else if (turningForce > 0) {
    if (inSpot) {
      statusText.textContent = 'CATCHING...';
      statusText.style.color = '#00ff00';
    } else if (isJammed) {
      statusText.textContent = 'JAMMING!';
      statusText.style.color = '#ff8800';
    } else {
      statusText.textContent = 'TURNING...';
      statusText.style.color = '#00ffff';
    }
  } else {
    statusText.textContent = 'Find the sweet spot...';
    statusText.style.color = '#00ff66';
  }

  dial.classList.remove('jamming', 'broke', 'success');
  if (success)      dial.classList.add('success');
  else if (broke)   dial.classList.add('broke');
  else if (isJammed) dial.classList.add('jamming');

  if (success) {
    setTimeout(() => {
      statusText.innerHTML = 'UNLOCKED! &nbsp;<span style="font-size:12px;cursor:pointer;text-decoration:underline" onclick="resetGame()">Play again?</span>';
    }, 1200);
  }
}

updateUI();
