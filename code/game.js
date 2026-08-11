import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const WIDTH = 390;
const HEIGHT = 844;
const START_LINE_Y = 360;
const FLOOR_Y = 1250;
const WALL_Z = -5;
const DEFAULT_NAMES = ['곰', '토끼', '고양이', '오리'];
const KEYS = ['bear', 'rabbit', 'cat', 'duck'];
const COLORS = [0xc6a27f, 0xeee7cf, 0x302e38, 0xf1cd58];
const PAD_POINTS = [
  new THREE.Vector3(-27, 27, -10),
  new THREE.Vector3(27, 27, -10),
  new THREE.Vector3(-18, -35, -10),
  new THREE.Vector3(18, -35, -10)
];
const START_PADS = [[0, 1, 2, 3], [1, 0, 3, 2], [0, 1, 2, 3], [1, 0, 3, 2]];

const game = document.querySelector('#game');
const guide = document.querySelector('#guide');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const setup = document.querySelector('#setup');
const setupForm = document.querySelector('#setup-form');
const setupSubmit = document.querySelector('#setup-submit');
const setupDescription = document.querySelector('#setup-description');
const nameInputs = [...setupForm.elements.namedItem('name')];
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const resultCopy = document.querySelector('#result-copy');
const resultList = document.querySelector('#result-list');
let world;
let eventQueue;
let racers = [];
const colliderRacers = new Map();
let running = false;
let finished = false;
let cameraY = 0;
let raceElapsed = 0;
let raceStartedAt = 0;
let mode = 'friends';
let soundEnabled = true;
let hapticEnabled = true;
let audioContext;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5ead9);
const camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT / 2, -HEIGHT / 2, 0.1, 1000);
camera.position.set(0, 0, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x756477, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-160, 250, 300);
scene.add(keyLight);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buzz(pattern) {
  if (hapticEnabled) navigator.vibrate?.(pattern);
}

function tone(frequency = 440, duration = 0.08) {
  if (!soundEnabled) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.05, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function screenToWorldY(screenY) {
  return HEIGHT / 2 - screenY;
}

function makeWall() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5ead9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d9c9b488';
  ctx.lineWidth = 1;
  for (let y = 104; y < canvas.height; y += 72) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  for (let x = 32; x < canvas.width; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  ctx.strokeStyle = '#705f75';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(20, START_LINE_Y); ctx.lineTo(370, START_LINE_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, FLOOR_Y); ctx.lineTo(370, FLOOR_Y); ctx.stroke();
  ctx.fillStyle = '#705f75';
  ctx.font = '900 18px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('FINISH', WIDTH / 2, FLOOR_Y - 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, canvas.height),
    new THREE.MeshBasicMaterial({ map: texture, depthTest: false, depthWrite: false })
  );
  wall.position.set(0, screenToWorldY(canvas.height / 2), WALL_Z - 2.1);
  wall.renderOrder = -100;
  scene.add(wall);
}

function makeFabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e7e2d8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 731;
  for (let i = 0; i < 360; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % canvas.width;
    seed = (seed * 16807) % 2147483647;
    const y = seed % canvas.height;
    seed = (seed * 16807) % 2147483647;
    const radius = 1.4 + seed % 2.6;
    context.strokeStyle = i % 3 ? '#b9b3a9' : '#fffaf0';
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(x, y, radius, 0.2, Math.PI * 1.7);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 4.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const fabricTexture = makeFabricTexture();
const sphereGeometry = new THREE.SphereGeometry(1, 16, 10);

function makeVisual(index, color) {
  const group = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, map: fabricTexture, bumpMap: fabricTexture, bumpScale: 0.8, roughness: 1 });
  const dark = new THREE.MeshBasicMaterial({ color: index === 2 ? 0xd8d6df : 0x332b30 });
  const pink = new THREE.MeshBasicMaterial({ color: 0xe89b9b });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe9873a, roughness: 0.9 });
  const paw = new THREE.MeshStandardMaterial({ color: index === 3 ? 0xe99a47 : index === 0 ? 0xe8d4bf : 0xe5a3a5, roughness: 0.95 });

  const ball = (scale, position, material = fur) => {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };
  const limb = (radius, length, position, rotation) => {
    const geometry = new THREE.CapsuleGeometry(radius, length, 5, 10);
    const mesh = new THREE.Mesh(geometry, fur);
    mesh.position.set(...position);
    mesh.rotation.z = rotation;
    group.add(mesh);
  };

  ball([19, 25, 11], [0, -3, 0]);
  ball([22, 20, 12], [0, 25, 0]);
  limb(7, 20, [-23, 13, 0], 0.78);
  limb(7, 20, [23, 13, 0], -0.78);
  limb(8, 18, [-10, -30, 0], -0.34);
  limb(8, 18, [10, -30, 0], 0.34);

  if (index === 0) {
    ball([8, 8, 6], [-14, 43, 0]);
    ball([8, 8, 6], [14, 43, 0]);
  } else if (index === 1) {
    limb(4.5, 19, [-7, 45, 0], -0.08);
    limb(4.5, 19, [7, 45, 0], 0.08);
  } else if (index === 2) {
    limb(5, 7, [-12, 39, 0], -0.25);
    limb(5, 7, [12, 39, 0], 0.25);
  }

  ball([1.8, 2.2, 0.9], [-6.2, 28.5, 11], dark);
  ball([1.8, 2.2, 0.9], [6.2, 28.5, 11], dark);
  if (index === 2) {
    ball([0.7, 1.2, 0.5], [-6.2, 28.5, 12], new THREE.MeshBasicMaterial({ color: 0x28242c }));
    ball([0.7, 1.2, 0.5], [6.2, 28.5, 12], new THREE.MeshBasicMaterial({ color: 0x28242c }));
  }
  if (index === 3) ball([5.8, 2.9, 2.4], [0, 22, 12], orange);
  else ball([2.7, 2.2, 1.6], [0, 22.5, 12], index === 1 ? pink : dark);
  ball([4.2, 4.2, 1.8], [-34, 26, 7], paw);
  ball([4.2, 4.2, 1.8], [34, 26, 7], paw);
  ball([4.5, 4.5, 1.8], [-16, -45, 7], paw);
  ball([4.5, 4.5, 1.8], [16, -45, 7], paw);

  const tailSize = index === 1 ? 6 : 4.5;
  ball([tailSize, tailSize, 3], [0, -3, -10], fur);
  scene.add(group);
  return group;
}

function padWorld(racer, padIndex) {
  const translation = racer.body.translation();
  const rotation = racer.body.rotation();
  return PAD_POINTS[padIndex].clone()
    .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    .add(new THREE.Vector3(translation.x, translation.y, translation.z));
}

function attachPad(racer, padIndex) {
  if (racer.anchors.some((anchor) => anchor.padIndex === padIndex)) return;
  const point = padWorld(racer, padIndex);
  const anchorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(point.x, point.y, WALL_Z)
  );
  const joint = world.createImpulseJoint(
    RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, PAD_POINTS[padIndex]),
    anchorBody,
    racer.body,
    true
  );
  racer.anchors.push({ padIndex, anchorBody, joint });
}

function detachPad(racer, anchor) {
  world.removeImpulseJoint(anchor.joint, true);
  world.removeRigidBody(anchor.anchorBody);
  racer.anchors.splice(racer.anchors.indexOf(anchor), 1);
}

function nextPad(racer) {
  const occupied = new Set(racer.anchors.map((anchor) => anchor.padIndex));
  const anchor = racer.anchors[0].anchorBody.translation();
  const anchorIsHand = racer.anchors[0].padIndex < 2;
  return [0, 1, 2, 3]
    .filter((index) => !occupied.has(index)
      && (index < 2) !== anchorIsHand
      && padWorld(racer, index).y < anchor.y - 28)
    .sort((a, b) => {
      const pointA = padWorld(racer, a);
      const pointB = padWorld(racer, b);
      return Math.abs(pointA.z - WALL_Z) - Math.abs(pointB.z - WALL_Z)
        || pointA.y - pointB.y
        || Math.abs(pointA.x - anchor.x) - Math.abs(pointB.x - anchor.x);
    })[0];
}

function beginFlip(racer) {
  const rotation = racer.body.rotation();
  const position = racer.body.translation();
  const anchor = racer.anchors[0].anchorBody.translation();
  racer.flipAxisX = Math.sign(position.z - anchor.z) || 1;
  racer.flipStart = { ...rotation };
  racer.gripElapsed = 0;
  racer.isFlipping = true;
  racer.body.setAngvel({ x: racer.flipAxisX * 2.5, y: 0, z: racer.flipDirection * 0.15 }, true);
  racer.flipDirection *= -1;
  racer.body.wakeUp();
}

function releaseExtraPad(racer) {
  detachPad(racer, racer.anchors[0]);
  if (racer.anchors.length === 1) beginFlip(racer);
}

function landOnNextPad(racer) {
  attachPad(racer, nextPad(racer));
  racer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  racer.stickDuration = 0.5 + Math.random() * 0.35;
  racer.gripElapsed = -racer.stickDuration;
  racer.isFlipping = false;
}

function rotationSinceFlip(racer) {
  const current = racer.body.rotation();
  const start = racer.flipStart;
  const dot = Math.abs(current.x * start.x + current.y * start.y + current.z * start.z + current.w * start.w);
  return 2 * Math.acos(Math.min(1, dot));
}

function createBodyColliders(index, body) {
  const add = (hx, hy, hz, radius, x, y, angle = 0) => {
    const rotation = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
    const collider = world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(hx, hy, hz, radius)
        .setTranslation(x, y, 0)
        .setRotation(rotation)
        .setDensity(0.0007)
        .setFriction(0)
        .setRestitution(0.18)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    colliderRacers.set(collider.handle, index);
  };

  // roundCuboid는 borderRadius만큼 모든 축으로 커지므로 hz + radius를
  // 몸 중심과 벽 사이 거리(10)에 맞춰 벽 관통과 떨림을 막는다.
  add(21, 34, 4, 7, 0, -2);
}

function createRacer(index) {
  const x = -136.5 + index * 91;
  const initialGrip = 0.65 + Math.random() * 0.25;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, screenToWorldY(150), 5)
      .setLinearDamping(0.35)
      .setAngularDamping(0.7)
      .setAdditionalSolverIterations(8)
  );
  createBodyColliders(index, body);
  const label = document.createElement('div');
  label.className = 'player-label';
  label.textContent = DEFAULT_NAMES[index];
  game.append(label);
  const racer = {
    index,
    body,
    visual: makeVisual(index, COLORS[index]),
    label,
    anchors: [],
    gripElapsed: -initialGrip,
    flipStart: { ...body.rotation() },
    flipAxisX: 1,
    flipDirection: index % 2 ? -1 : 1,
    isFlipping: false,
    lowestY: body.translation().y,
    stickDuration: initialGrip,
    placed: false,
    active: true
  };
  START_PADS[index].forEach((pad) => attachPad(racer, pad));
  body.setAngvel({ x: 0, y: 0, z: 0.05 * (index % 2 ? 1 : -1) }, true);
  return racer;
}

function placeRacer(racer, x, worldY) {
  [...racer.anchors].forEach((anchor) => detachPad(racer, anchor));
  racer.body.setTranslation({ x, y: worldY, z: 5 }, true);
  racer.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  racer.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  racer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  racer.lowestY = worldY;
  START_PADS[racer.index].forEach((pad) => attachPad(racer, pad));
}

function resetRace() {
  running = false;
  finished = false;
  raceElapsed = 0;
  cameraY = 0;
  camera.position.y = 0;
  result.hidden = true;
  const active = racers.filter((racer) => racer.active);
  active.forEach((racer, index) => {
    const spacing = 300 / active.length;
    placeRacer(racer, -150 + spacing / 2 + spacing * index, screenToWorldY(150));
    racer.placed = false;
    racer.isFlipping = false;
    racer.stickDuration = 0.32 + Math.random() * 0.06;
    racer.gripElapsed = -racer.stickDuration;
  });
  status.textContent = '준비';
  guide.textContent = '위치는 선택사항 · 레이스 시작';
  guide.disabled = false;
  guide.hidden = false;
}

function setParticipants(names) {
  racers.forEach((racer, index) => {
    racer.active = index < names.length;
    racer.visual.visible = racer.active;
    racer.label.hidden = !racer.active;
    if (racer.active) racer.label.textContent = names[index];
    else [...racer.anchors].forEach((anchor) => detachPad(racer, anchor));
    racer.body.setEnabled(racer.active);
  });
  resetRace();
}

function pointerWorld(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * (camera.right - camera.left);
  const y = camera.position.y + (0.5 - (event.clientY - rect.top) / rect.height) * HEIGHT;
  return { x, y };
}

let draggedRacer = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (running || finished) return;
  const point = pointerWorld(event);
  draggedRacer = racers.filter((racer) => racer.active).reduce((closest, racer) => {
    const position = racer.body.translation();
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    return distance < closest.distance ? { racer, distance } : closest;
  }, { racer: null, distance: 48 }).racer;
  if (draggedRacer) renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!draggedRacer) return;
  const point = pointerWorld(event);
  placeRacer(draggedRacer, THREE.MathUtils.clamp(point.x, -160, 160), THREE.MathUtils.clamp(point.y, screenToWorldY(START_LINE_Y - 55), screenToWorldY(105)));
});
renderer.domElement.addEventListener('pointerup', () => { draggedRacer = null; });
renderer.domElement.addEventListener('pointercancel', () => { draggedRacer = null; });

function syncVisuals(dt) {
  let lowest = Infinity;
  if (running) raceElapsed = (performance.now() - raceStartedAt) / 1000;
  racers.forEach((racer) => {
    if (!racer.active) return;
    const position = racer.body.translation();
    const rotation = racer.body.rotation();
    racer.visual.position.set(position.x, position.y, position.z);
    racer.visual.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const sticking = racer.anchors.length > 1 && !racer.isFlipping && racer.gripElapsed < 0;
    const squeeze = sticking ? Math.sin(Math.PI * (1 + racer.gripElapsed / racer.stickDuration)) * 0.08 : 0;
    racer.visual.scale.set(1 + squeeze * 0.45, 1 - squeeze * 0.35, 1 - squeeze);
    if (running) {
      racer.gripElapsed += dt * (raceElapsed > 20 ? 1.55 : 1);
      const firstRelease = racer.anchors.length > 1 && racer.gripElapsed >= 0;
      const readyToFlip = racer.anchors.length === 1 && !racer.isFlipping && racer.gripElapsed >= 0;
      const flipAngle = racer.isFlipping ? rotationSinceFlip(racer) : 0;
      if (racer.isFlipping) {
        const angular = racer.body.angvel();
        const rollingSpeed = 2.5 + 6 * (1 - Math.exp(-racer.gripElapsed * 2));
        if (angular.x * racer.flipAxisX < rollingSpeed) {
          racer.body.setAngvel({ x: racer.flipAxisX * rollingSpeed, y: angular.y, z: angular.z }, true);
        }
      }
      const landingPad = racer.isFlipping ? nextPad(racer) : undefined;
      const landingPoint = landingPad === undefined ? null : padWorld(racer, landingPad);
      const lowerPadTouched = racer.isFlipping
        && landingPoint
        && landingPoint.y < racer.anchors[0].anchorBody.translation().y - 28
        && Math.abs(landingPoint.z - WALL_Z) < 12;
      const completedFlip = racer.isFlipping
        && racer.gripElapsed > 0.12
        && lowerPadTouched
        && flipAngle > 1.2;
      if (firstRelease) releaseExtraPad(racer);
      else if (readyToFlip) beginFlip(racer);
      else if (completedFlip) landOnNextPad(racer);
    }
    lowest = Math.min(lowest, position.y);

    const projected = new THREE.Vector3(position.x, position.y + 47, position.z).project(camera);
    racer.label.style.left = `${(projected.x * 0.5 + 0.5) * game.clientWidth}px`;
    racer.label.style.top = `${(-projected.y * 0.5 + 0.5) * game.clientHeight}px`;

    if (!racer.placed && position.y < screenToWorldY(FLOOR_Y)) {
      racer.placed = true;
      if (!finished) finishRace(racer);
    }
  });
  game.dataset.lowest = Number.isFinite(lowest) ? lowest.toFixed(1) : '';
  if (running) {
    const target = Math.min(0, lowest + 220);
    cameraY += (target - cameraY) * Math.min(1, dt * 3.2);
    camera.position.y = cameraY;
    const progress = Math.max(0, Math.min(99, Math.round((screenToWorldY(150) - lowest) / (FLOOR_Y - 150) * 100)));
    status.textContent = raceElapsed > 20 ? `막판 스퍼트 ${progress}%` : `진행 ${progress}%`;
    if (raceElapsed >= 29 && !finished) {
      const leader = racers.filter((racer) => racer.active)
        .sort((a, b) => a.body.translation().y - b.body.translation().y)[0];
      finishRace(leader);
    }
  }
}

function finishRace(racer) {
  finished = true;
  running = false;
  const ranking = racers.filter((item) => item.active)
    .sort((a, b) => a.body.translation().y - b.body.translation().y);
  status.textContent = `${racer.label.textContent} 우승`;
  guide.hidden = true;
  resultTitle.textContent = mode === 'choice'
    ? `${racer.label.textContent}, 오늘은 너다`
    : `${racer.label.textContent} 승!`;
  const comments = mode === 'choice'
    ? ['운명도 귀찮아서 먼저 떨어뜨렸어요.', '고민 끝. 끈끈이가 정했습니다.', '이 정도면 꽤 과학적인 결정이에요.']
    : ['실력보다 접착력이 한 수 위였어요.', '이긴 사람도 조금 하찮아 보입니다.', '승부는 끝났고 품격도 같이 떨어졌어요.'];
  resultCopy.textContent = comments[Math.floor(Math.random() * comments.length)];
  resultList.replaceChildren(...ranking.map((item, index) => {
    const row = document.createElement('li');
    row.textContent = `${index + 1}위  ${item.label.textContent}`;
    return row;
  }));
  result.hidden = false;
  tone(660, 0.25);
  buzz([60, 40, 100]);
}

function resize() {
  renderer.setSize(game.clientWidth, game.clientHeight, false);
  const visibleHeight = HEIGHT;
  const visibleWidth = visibleHeight * game.clientWidth / game.clientHeight;
  camera.left = -visibleWidth / 2;
  camera.right = visibleWidth / 2;
  camera.top = visibleHeight / 2;
  camera.bottom = -visibleHeight / 2;
  camera.updateProjectionMatrix();
}

async function startRace() {
  if (running || finished) return;
  guide.disabled = true;
  for (let count = 3; count > 0; count -= 1) {
    guide.textContent = `${count}`;
    tone(330 + count * 70);
    await wait(550);
  }
  guide.textContent = '출발!';
  tone(700, 0.12);
  buzz(40);
  await wait(300);
  raceElapsed = 0;
  raceStartedAt = performance.now();
  running = true;
  guide.hidden = true;
  guide.disabled = false;
}

async function boot() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -520, z: 0 });
  world.timestep = 1 / 60;
  eventQueue = new RAPIER.EventQueue(true);
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, screenToWorldY(800), WALL_Z - 2));
  for (const side of [-1, 1]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 850, 40)
        .setTranslation(side * (WIDTH / 2 + 4), 0, 10)
        .setFriction(0),
      wallBody
    );
  }
  makeWall();
  racers = KEYS.map((_, index) => createRacer(index));
  resize();
  setupSubmit.disabled = false;
  setupSubmit.textContent = '찰싹 붙이러 가기';

  let previous = performance.now();
  let accumulator = 0;
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (running) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        world.step(eventQueue);
        racers.forEach((racer) => {
          if (!racer.active) return;
          const position = racer.body.translation();
          if (position.y <= racer.lowestY) {
            racer.lowestY = position.y;
            return;
          }
          racer.body.setTranslation({ x: position.x, y: racer.lowestY, z: position.z }, true);
          const velocity = racer.body.linvel();
          if (velocity.y > 0) racer.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
        });
        const impacted = new Set();
        eventQueue.drainCollisionEvents((handleA, handleB, started) => {
          const racerA = colliderRacers.get(handleA);
          const racerB = colliderRacers.get(handleB);
          if (started && racerA !== undefined && racerB !== undefined && racerA !== racerB) {
            impacted.add(racerA);
            impacted.add(racerB);
          }
        });
        impacted.forEach((index) => {
          const racer = racers[index];
          if (!racer) return;
          if (racer.anchors.length > 1) racer.gripElapsed += 0.14;
        });
        accumulator -= 1 / 60;
      }
    }
    syncVisuals(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

guide.addEventListener('click', startRace);
setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const names = nameInputs.map((input) => input.value.trim()).filter(Boolean);
  if (names.length < 2) {
    nameInputs.find((input) => !input.value.trim())?.focus();
    return;
  }
  soundEnabled = document.querySelector('#sound-toggle').checked;
  hapticEnabled = document.querySelector('#haptic-toggle').checked;
  setParticipants(names);
  setup.hidden = true;
  tone(420);
});
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    const choiceMode = mode === 'choice';
    setupDescription.textContent = choiceMode
      ? '고민되는 선택지를 2~4개 적어주세요.'
      : '친구 이름만 적으면 끈끈이들이 알아서 승부해요.';
    nameInputs.forEach((input, index) => {
      input.placeholder = `${index + 1}번째 ${choiceMode ? '선택지' : '이름'}${index > 1 ? ' (선택)' : ''}`;
    });
  });
});
document.querySelector('#replay').addEventListener('click', () => {
  resetRace();
  startRace();
});
document.querySelector('#edit-players').addEventListener('click', () => {
  result.hidden = true;
  setup.hidden = false;
});
addEventListener('resize', resize);
boot().catch((error) => {
  console.error(error);
  errorBox.style.display = 'grid';
});
