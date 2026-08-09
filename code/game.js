import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const WIDTH = 390;
const HEIGHT = 844;
const START_LINE_Y = 360;
const FLOOR_Y = 1510;
const WALL_Z = -5;
const NAMES = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4'];
const KEYS = ['bear', 'rabbit', 'cat', 'duck'];
const COLORS = [0xc6a27f, 0xeee7cf, 0x302e38, 0xf1cd58];
const PAD_POINTS = [
  new THREE.Vector3(-27, 27, -10),
  new THREE.Vector3(27, 27, -10),
  new THREE.Vector3(-18, -35, -10),
  new THREE.Vector3(18, -35, -10)
];
const START_PADS = [[0, 3], [1, 2], [0, 1], [2, 3]];

const game = document.querySelector('#game');
const guide = document.querySelector('#guide');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
let world;
let racers = [];
let running = false;
let finished = false;
let cameraY = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5ead9);
const camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT / 2, -HEIGHT / 2, 0.1, 1000);
camera.position.set(0, 0, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x756477, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-160, 250, 300);
scene.add(keyLight);

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
const sphereGeometry = new THREE.SphereGeometry(1, 20, 14);

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
  const current = racer.anchors[0]?.padIndex ?? 0;
  const oppositeGroup = current < 2 ? [2, 3] : [0, 1];
  const candidates = [...oppositeGroup, 0, 1, 2, 3].filter((index, position, all) =>
    !occupied.has(index) && all.indexOf(index) === position
  );
  return candidates.sort((a, b) => {
    const pointA = padWorld(racer, a);
    const pointB = padWorld(racer, b);
    return pointA.y - pointB.y || Math.abs(pointA.z - WALL_Z) - Math.abs(pointB.z - WALL_Z);
  })[0];
}

function beginFlip(racer) {
  const rotation = racer.body.rotation();
  const pivot = PAD_POINTS[racer.anchors[0].padIndex].clone()
    .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));
  const outwardDirection = pivot.y >= 0 ? -1 : 1;
  racer.flipStart = { ...rotation };
  racer.gripElapsed = 0;
  racer.isFlipping = true;
  racer.body.setAngvel({
    x: outwardDirection * (11 + Math.random()),
    y: (Math.random() - 0.5) * 0.7,
    z: racer.flipDirection * (0.35 + Math.random() * 0.45)
  }, true);
  racer.flipDirection *= -1;
}

function releaseExtraPad(racer) {
  detachPad(racer, racer.anchors[0]);
  beginFlip(racer);
}

function landOnNextPad(racer) {
  attachPad(racer, nextPad(racer));
  racer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  racer.stickDuration = 0.28 + Math.random() * 0.12;
  racer.gripElapsed = -racer.stickDuration;
  racer.isFlipping = false;
}

function rotationSinceFlip(racer) {
  const current = racer.body.rotation();
  const start = racer.flipStart;
  const dot = Math.abs(current.x * start.x + current.y * start.y + current.z * start.z + current.w * start.w);
  return 2 * Math.acos(Math.min(1, dot));
}

function createRacer(index) {
  const x = -136.5 + index * 91;
  const initialGrip = 0.45 + index * 0.14;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, screenToWorldY(150), 5)
      .setLinearDamping(0.35)
      .setAngularDamping(0.7)
      .setAdditionalSolverIterations(8)
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(10).setDensity(0.01).setFriction(0.8).setRestitution(0.005),
    body
  );
  const label = document.createElement('div');
  label.className = 'player-label';
  label.textContent = NAMES[index];
  game.append(label);
  const racer = {
    index,
    body,
    visual: makeVisual(index, COLORS[index]),
    label,
    anchors: [],
    gripElapsed: -initialGrip,
    flipStart: { ...body.rotation() },
    flipDirection: index % 2 ? -1 : 1,
    isFlipping: false,
    stickDuration: initialGrip,
    placed: false
  };
  START_PADS[index].forEach((pad) => attachPad(racer, pad));
  body.setAngvel({ x: 0.12 * (index - 1.5), y: 0.08 * (1.5 - index), z: 0.05 * (index % 2 ? 1 : -1) }, true);
  return racer;
}

function placeRacer(racer, x, worldY) {
  [...racer.anchors].forEach((anchor) => detachPad(racer, anchor));
  racer.body.setTranslation({ x, y: worldY, z: 5 }, true);
  racer.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  racer.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  racer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  START_PADS[racer.index].forEach((pad) => attachPad(racer, pad));
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
  draggedRacer = racers.reduce((closest, racer) => {
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
  racers.forEach((racer) => {
    const position = racer.body.translation();
    const rotation = racer.body.rotation();
    racer.visual.position.set(position.x, position.y, position.z);
    racer.visual.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const sticking = racer.anchors.length > 1 && !racer.isFlipping && racer.gripElapsed < 0;
    const squeeze = sticking ? Math.sin(Math.PI * (1 + racer.gripElapsed / racer.stickDuration)) * 0.08 : 0;
    racer.visual.scale.set(1 + squeeze * 0.45, 1 - squeeze * 0.35, 1 - squeeze);
    if (running) {
      racer.gripElapsed += dt;
      const firstRelease = racer.anchors.length > 1 && racer.gripElapsed >= 0;
      const readyToFlip = racer.anchors.length === 1 && !racer.isFlipping && racer.gripElapsed >= 0;
      const flipAngle = racer.isFlipping ? rotationSinceFlip(racer) : 0;
      const landingPad = racer.isFlipping ? nextPad(racer) : 0;
      const landingPoint = racer.isFlipping ? padWorld(racer, landingPad) : null;
      const lowerPadTouched = racer.isFlipping
        && landingPoint.y < racer.anchors[0].anchorBody.translation().y - 4
        && Math.abs(landingPoint.z - WALL_Z) < 28;
      const completedFlip = racer.isFlipping
        && racer.gripElapsed > 0.22
        && ((flipAngle > 2.45 && lowerPadTouched) || racer.gripElapsed > 1.45);
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
  }
}

function finishRace(racer) {
  finished = true;
  running = false;
  status.textContent = `${racer.label.textContent} 우승`;
  guide.textContent = `${racer.label.textContent} 우승! 다시 하기`;
  guide.hidden = false;
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

function startRace() {
  if (finished) {
    location.reload();
    return;
  }
  running = true;
  status.textContent = '경기 중';
  guide.hidden = true;
}

async function boot() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -520, z: 0 });
  world.timestep = 1 / 60;
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, screenToWorldY(800), WALL_Z - 2));
  world.createCollider(RAPIER.ColliderDesc.cuboid(WIDTH / 2, 850, 2).setFriction(0.8).setRestitution(0), wallBody);
  makeWall();
  racers = KEYS.map((_, index) => createRacer(index));
  resize();

  let previous = performance.now();
  let accumulator = 0;
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (running) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        world.step();
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
addEventListener('resize', resize);
boot().catch((error) => {
  console.error(error);
  errorBox.style.display = 'grid';
});
