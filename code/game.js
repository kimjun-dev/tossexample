import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { gsap } from 'gsap';

const WIDTH = 390;
const HEIGHT = 844;
const START_LINE_Y = 360;
const FLOOR_Y = 2350;
const COURSE_HEIGHT = 2800;
const RACE_RUSH_TIME = 40;
const RACE_LIMIT = 58;
const WALL_Z = -5;
const GRIP_Z = WALL_Z + 10;
const RACER_GAP_X = 78;
const EDGE_SOFT_LIMIT = 145;
const EDGE_INWARD_FORCE = 18;
const PLACEMENT_PARTS = [
  { x: 0, y: 25, rx: 22, ry: 20 },
  { x: 0, y: -3, rx: 19, ry: 25 },
  { x: -23, y: 13, rx: 16, ry: 10 },
  { x: 23, y: 13, rx: 16, ry: 10 },
  { x: -10, y: -32, rx: 10, ry: 18 },
  { x: 10, y: -32, rx: 10, ry: 18 }
];
const DEFAULT_NAMES = ['곰', '토끼', '고양이', '오리'];
const KEYS = ['bear', 'rabbit', 'cat', 'duck'];
const CHARACTER_KEYS = [...KEYS, 'turtle'];
const CHARACTER_NAMES = { bear: '곰', rabbit: '토끼', cat: '고양이', duck: '오리', turtle: '거북이' };
const COLORS = { bear: 0xc6a27f, rabbit: 0xeee7cf, cat: 0x302e38, duck: 0xf1cd58, turtle: 0x8eb879 };
const CHARACTER_TONES = { bear: 260, rabbit: 760, cat: 520, duck: 640, turtle: 360 };
const PAD_POINTS = [
  new THREE.Vector3(-27, 27, 0),
  new THREE.Vector3(27, 27, 0),
  new THREE.Vector3(-18, -35, 0),
  new THREE.Vector3(18, -35, 0)
];
const START_PADS = [[0, 1, 2, 3], [1, 0, 3, 2], [0, 1, 2, 3], [1, 0, 3, 2]];

const game = document.querySelector('#game');
const guide = document.querySelector('#guide');
const status = document.querySelector('#status');
const raceTimer = document.querySelector('#race-timer');
const raceStart = document.querySelector('#race-start');
const startCount = document.querySelector('#start-count');
const startCaption = document.querySelector('#start-caption');
const signalLights = [...document.querySelectorAll('.signal-lights i')];
const errorBox = document.querySelector('#error');
const setup = document.querySelector('#setup');
const setupForm = document.querySelector('#setup-form');
const setupSubmit = document.querySelector('#setup-submit');
const setupDescription = document.querySelector('#setup-description');
const decisionQuestion = document.querySelector('#decision-question');
const nameInputs = [...setupForm.elements.namedItem('name')];
const characterSelects = [...setupForm.elements.namedItem('character')];
const participants = [...document.querySelectorAll('.participant')];
const characterPickers = [...document.querySelectorAll('.mini-character-picker')];
const characterPreviewImages = [...document.querySelectorAll('.mini-character-preview img')];
const characterPreviewLabels = [...document.querySelectorAll('.mini-character-preview span')];
const characterSteps = [...document.querySelectorAll('.character-step')];
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const resultCopy = document.querySelector('#result-copy');
const resultList = document.querySelector('#result-list');
const commentPrev = document.querySelector('#comment-prev');
const commentNext = document.querySelector('#comment-next');
let world;
let eventQueue;
let racers = [];
let mountains = [];
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
let resultComments = [];
let commentIndex = 0;
let characterPreviews = {};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8de8ee);
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
const motionScale = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;

function showOverlay(overlay) {
  overlay.hidden = false;
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.35 * motionScale, ease: 'power2.out' });
  gsap.fromTo(overlay.querySelector('.card'), { y: 42, scale: 0.96, rotation: -1.5 }, { y: 0, scale: 1, rotation: 0, duration: 0.65 * motionScale, ease: 'power3.out' });
}

function hideOverlay(overlay) {
  gsap.to(overlay, {
    opacity: 0,
    duration: 0.3 * motionScale,
    ease: 'power2.in',
    onComplete: () => {
      overlay.hidden = true;
      gsap.set(overlay, { clearProps: 'opacity' });
    }
  });
}

function showComment(offset = 0) {
  if (!resultComments.length) return;
  commentIndex = (commentIndex + offset + resultComments.length) % resultComments.length;
  resultCopy.textContent = resultComments[commentIndex];
  gsap.fromTo(resultCopy, { x: offset * 10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3 * motionScale });
}

function revealText(element) {
  const words = element.textContent.split(' ');
  element.replaceChildren(...words.map((word, index) => {
    const span = document.createElement('span');
    span.textContent = word + (index < words.length - 1 ? ' ' : '');
    return span;
  }));
  gsap.fromTo(element.children, { opacity: 0.12 }, { opacity: 1, stagger: 0.035, duration: 0.35 * motionScale });
}

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
  canvas.height = COURSE_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8de8ee';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawCloud = (x, y, scale = 1) => {
    ctx.fillStyle = '#f8ffff';
    ctx.beginPath();
    ctx.arc(x, y, 18 * scale, Math.PI, 0);
    ctx.arc(x + 22 * scale, y - 9 * scale, 25 * scale, Math.PI, 0);
    ctx.arc(x + 50 * scale, y, 18 * scale, Math.PI, 0);
    ctx.lineTo(x + 50 * scale, y + 10 * scale);
    ctx.lineTo(x, y + 10 * scale);
    ctx.closePath();
    ctx.fill();
  };
  const drawMountain = (x, baseY, width, height, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - width, baseY);
    ctx.lineTo(x, baseY - height);
    ctx.lineTo(x + width, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8ffff';
    ctx.beginPath();
    ctx.moveTo(x - width * 0.22, baseY - height * 0.78);
    ctx.lineTo(x, baseY - height);
    ctx.lineTo(x + width * 0.24, baseY - height * 0.76);
    ctx.lineTo(x + width * 0.1, baseY - height * 0.65);
    ctx.lineTo(x - width * 0.04, baseY - height * 0.71);
    ctx.lineTo(x - width * 0.15, baseY - height * 0.64);
    ctx.closePath();
    ctx.fill();
  };
  const drawTree = (x, y, scale = 1) => {
    ctx.fillStyle = '#755033';
    ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 25 * scale);
    ctx.fillStyle = '#28784a';
    ctx.beginPath();
    ctx.arc(x - 11 * scale, y - 12 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.arc(x + 10 * scale, y - 15 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.arc(x, y - 31 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCloud(24, 78, 0.8);
  drawCloud(250, 150, 0.7);
  drawCloud(86, 610, 0.65);
  drawMountain(70, 340, 110, 150, '#48c4dc');
  drawMountain(268, 360, 145, 185, '#50bdd6');
  drawMountain(120, 815, 150, 160, '#58c6d8');
  drawMountain(320, 1180, 130, 170, '#48bad2');

  ctx.fillStyle = '#8fbd54';
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.quadraticCurveTo(90, 250, 190, 320);
  ctx.quadraticCurveTo(300, 250, 390, 310);
  ctx.lineTo(390, COURSE_HEIGHT);
  ctx.lineTo(0, COURSE_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b9d54a';
  ctx.beginPath();
  ctx.moveTo(0, 520);
  ctx.quadraticCurveTo(120, 430, 240, 540);
  ctx.quadraticCurveTo(320, 470, 390, 520);
  ctx.lineTo(390, COURSE_HEIGHT);
  ctx.lineTo(0, COURSE_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = '#f3d938';
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(92, 300);
  ctx.bezierCurveTo(18, 560, 205, 760, 92, 1030);
  ctx.bezierCurveTo(14, 1240, 190, 1440, 118, 1730);
  ctx.bezierCurveTo(36, 1980, 196, 2310, 88, COURSE_HEIGHT + 20);
  ctx.stroke();
  ctx.strokeStyle = '#fff18a';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#35a8da';
  ctx.lineWidth = 50;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(330, 270);
  ctx.bezierCurveTo(245, 560, 355, 810, 260, 1090);
  ctx.bezierCurveTo(200, 1310, 305, 1480, 220, 1740);
  ctx.bezierCurveTo(160, 2010, 315, 2320, 245, COURSE_HEIGHT + 20);
  ctx.stroke();
  ctx.strokeStyle = '#87def0';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.restore();

  for (let y = 390; y < canvas.height; y += 175) {
    for (const x of [24, 74, 344, 380]) drawTree(x, y + (x % 3) * 8, 0.72 + (x % 2) * 0.18);
  }

  ctx.strokeStyle = '#df7040';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(20, START_LINE_Y); ctx.lineTo(370, START_LINE_Y); ctx.stroke();
  for (let x = 20; x < 370; x += 20) {
    ctx.fillStyle = x % 40 ? '#245444' : '#f6e8be';
    ctx.fillRect(x, FLOOR_Y - 4, 20, 8);
  }
  ctx.fillStyle = '#23533d';
  ctx.font = '800 17px Outfit, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('끝까지 간 친구의 승리', WIDTH / 2, FLOOR_Y - 18);
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

function clearMountains() {
  mountains.forEach(({ body, visual }) => {
    world.removeRigidBody(body);
    scene.remove(visual);
    visual.traverse((item) => {
      item.geometry?.dispose();
      item.material?.dispose();
    });
  });
  mountains = [];
}

function makeMountainVisual(width, height, color) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width, 0);
  shape.lineTo(0, height);
  shape.lineTo(width, 0);
  shape.closePath();
  const mountain = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 16, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 2 }),
    new THREE.MeshBasicMaterial({ color })
  );
  mountain.position.z = -8;
  group.add(mountain);

  const capShape = new THREE.Shape();
  capShape.moveTo(-width * 0.34, height * 0.66);
  capShape.lineTo(0, height);
  capShape.lineTo(width * 0.34, height * 0.66);
  capShape.closePath();
  const cap = new THREE.Mesh(new THREE.ShapeGeometry(capShape), new THREE.MeshBasicMaterial({ color: 0xf0c667 }));
  cap.position.z = 10.5;
  group.add(cap);
  return group;
}

function createMountains() {
  clearMountains();
  const colors = [0x2f8f52, 0x48a85e, 0x267549, 0x43a55b, 0x327f4c];
  for (let index = 0; index < 5; index += 1) {
    const width = 34 + Math.random() * 9;
    const height = 18 + Math.random() * 7;
    const x = -105 + Math.random() * 210;
    const y = screenToWorldY(560 + index * 380 + (Math.random() - 0.5) * 46);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, GRIP_Z));
    const slopeLength = Math.hypot(width, height);
    const angle = Math.atan2(height, width);
    for (const side of [-1, 1]) {
      const rotation = side * -angle;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(slopeLength / 2, 3, 10)
          .setTranslation(side * width / 2, height / 2, 0)
          .setRotation({ x: 0, y: 0, z: Math.sin(rotation / 2), w: Math.cos(rotation / 2) })
          .setFriction(0)
          .setRestitution(0.16),
        body
      );
    }
    const visual = makeMountainVisual(width, height, colors[index]);
    visual.position.set(x, y, GRIP_Z);
    scene.add(visual);
    mountains.push({ body, visual });
  }
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

function makeVisual(key, targetScene = scene) {
  const group = new THREE.Group();
  const doll = new THREE.Group();
  const accents = [];
  group.add(doll);
  const fur = new THREE.MeshStandardMaterial({ color: COLORS[key], map: fabricTexture, bumpMap: fabricTexture, bumpScale: 0.8, roughness: 1 });
  const dark = new THREE.MeshBasicMaterial({ color: key === 'cat' ? 0xd8d6df : 0x332b30 });
  const pink = new THREE.MeshBasicMaterial({ color: 0xe89b9b });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe9873a, roughness: 0.9 });
  const paw = new THREE.MeshStandardMaterial({ color: key === 'duck' ? 0xe99a47 : key === 'bear' ? 0xe8d4bf : key === 'turtle' ? 0xc5d891 : 0xe5a3a5, roughness: 0.95 });

  const ball = (scale, position, material = fur) => {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    doll.add(mesh);
    return mesh;
  };
  const limb = (radius, length, position, rotation) => {
    const geometry = new THREE.CapsuleGeometry(radius, length, 5, 10);
    const mesh = new THREE.Mesh(geometry, fur);
    mesh.position.set(...position);
    mesh.rotation.z = rotation;
    doll.add(mesh);
    return mesh;
  };

  if (key === 'turtle') {
    const shell = new THREE.MeshStandardMaterial({ color: 0x557a43, map: fabricTexture, bumpMap: fabricTexture, bumpScale: 1, roughness: 1 });
    ball([26, 29, 8], [0, -3, -5], shell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 24), new THREE.MeshStandardMaterial({ color: 0x355d37, roughness: 1 }));
    rim.scale.set(22, 25, 2);
    rim.position.set(0, -3, 4);
    doll.add(rim);
    accents.push(rim);
  }
  ball([19, 25, 11], [0, -3, 0]);
  ball([22, 20, 12], [0, 25, 0]);
  limb(7, 20, [-23, 13, 0], 0.78);
  limb(7, 20, [23, 13, 0], -0.78);
  limb(8, 18, [-10, -30, 0], -0.34);
  limb(8, 18, [10, -30, 0], 0.34);

  if (key === 'turtle') {
    ball([14, 18, 2], [0, -4, 10], paw);
    const bellyRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 24), dark);
    bellyRim.scale.set(13, 17, 2);
    bellyRim.position.set(0, -4, 12.2);
    doll.add(bellyRim);
    accents.push(bellyRim);
  }

  if (key === 'bear') {
    ball([8, 8, 6], [-14, 43, 0]);
    ball([8, 8, 6], [14, 43, 0]);
  } else if (key === 'rabbit') {
    accents.push(limb(4.5, 19, [-7, 45, 0], -0.08), limb(4.5, 19, [7, 45, 0], 0.08));
  } else if (key === 'cat') {
    limb(5, 7, [-12, 39, 0], -0.25);
    limb(5, 7, [12, 39, 0], 0.25);
  }

  ball([1.8, 2.2, 0.9], [-6.2, 28.5, 11], dark);
  ball([1.8, 2.2, 0.9], [6.2, 28.5, 11], dark);
  if (key === 'cat') {
    ball([0.7, 1.2, 0.5], [-6.2, 28.5, 12], new THREE.MeshBasicMaterial({ color: 0x28242c }));
    ball([0.7, 1.2, 0.5], [6.2, 28.5, 12], new THREE.MeshBasicMaterial({ color: 0x28242c }));
  }
  if (key === 'duck') accents.push(ball([5.8, 2.9, 2.4], [0, 22, 12], orange));
  else ball([2.7, 2.2, 1.6], [0, 22.5, 12], key === 'rabbit' ? pink : dark);
  ball([4.2, 4.2, 1.8], [-34, 26, 7], paw);
  ball([4.2, 4.2, 1.8], [34, 26, 7], paw);
  ball([4.5, 4.5, 1.8], [-16, -45, 7], paw);
  ball([4.5, 4.5, 1.8], [16, -45, 7], paw);

  const tailSize = key === 'rabbit' ? 6 : key === 'turtle' ? 3 : 4.5;
  ball([tailSize, tailSize, 3], [0, -3, -10], fur);
  accents.forEach((part) => {
    part.userData.baseRotationZ = part.rotation.z;
    part.userData.baseScaleY = part.scale.y;
  });
  group.userData = { doll, accents, key };
  targetScene.add(group);
  return group;
}

function renderCharacterPreviews() {
  const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  previewRenderer.setSize(180, 180, false);
  previewRenderer.setPixelRatio(1);
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.OrthographicCamera(-58, 58, 68, -58, 0.1, 400);
  previewCamera.position.z = 180;
  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x756477, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(-80, 100, 160);
  previewScene.add(light);
  const previews = {};
  CHARACTER_KEYS.forEach((key) => {
    const model = makeVisual(key, previewScene);
    model.rotation.y = -0.08;
    previewRenderer.render(previewScene, previewCamera);
    previews[key] = previewRenderer.domElement.toDataURL('image/png');
    previewScene.remove(model);
    model.traverse((part) => {
      if (!part.isMesh) return;
      if (part.geometry !== sphereGeometry) part.geometry.dispose();
      part.material.dispose();
    });
  });
  previewRenderer.dispose();
  return previews;
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
    RAPIER.RigidBodyDesc.fixed().setTranslation(point.x, point.y, GRIP_Z)
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

function anchorProgressY(racer) {
  return Math.min(...racer.anchors.map((anchor) => anchor.anchorBody.translation().y));
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
      return Math.abs(pointA.z - GRIP_Z) - Math.abs(pointB.z - GRIP_Z)
        || pointA.y - pointB.y
        || Math.abs(pointA.x - anchor.x) - Math.abs(pointB.x - anchor.x);
    })[0];
}

function beginFlip(racer) {
  const rotation = racer.body.rotation();
  const position = racer.body.translation();
  const anchor = racer.anchors[0].anchorBody.translation();
  racer.flipAxisX = Math.sign(position.y - anchor.y) || 1;
  racer.flipStart = { ...rotation };
  racer.gripElapsed = 0;
  racer.isFlipping = true;
  racer.body.setAngvel({ x: racer.flipAxisX * 2.5, y: 0, z: 0 }, true);
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
  add(21, 24, 4, 7, 0, -4);
}

function createRacer(index) {
  const x = -136.5 + index * 91;
  const initialGrip = 0.65 + Math.random() * 0.25;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, screenToWorldY(150), 5)
      .setLinearDamping(0.35)
      .setAngularDamping(0.7)
      .setCcdEnabled(true)
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
    visual: makeVisual(KEYS[index]),
    characterKey: KEYS[index],
    label,
    anchors: [],
    gripElapsed: -initialGrip,
    flipStart: { ...body.rotation() },
    flipAxisX: 1,
    isFlipping: false,
    stickDuration: initialGrip,
    lastProgressY: screenToWorldY(150),
    stalledFor: 0,
    placed: false,
    active: true
  };
  START_PADS[index].forEach((pad) => attachPad(racer, pad));
  racer.lastProgressY = anchorProgressY(racer);
  body.setAngvel({ x: 0, y: 0, z: 0.05 * (index % 2 ? 1 : -1) }, true);
  return racer;
}

function placeRacer(racer, x, worldY) {
  [...racer.anchors].forEach((anchor) => detachPad(racer, anchor));
  racer.body.setTranslation({ x, y: worldY, z: 5 }, true);
  racer.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  racer.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  racer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  START_PADS[racer.index].forEach((pad) => attachPad(racer, pad));
  racer.lastProgressY = anchorProgressY(racer);
}

function recoverStalledRacer(racer) {
  const position = racer.body.translation();
  const y = position.y - 72;
  placeRacer(racer, THREE.MathUtils.clamp(position.x, -EDGE_SOFT_LIMIT, EDGE_SOFT_LIMIT), y);
  racer.isFlipping = false;
  racer.stickDuration = 0.18;
  racer.gripElapsed = -racer.stickDuration;
  racer.stalledFor = 0;
  console.assert(racer.anchors.length === START_PADS[racer.index].length, 'stalled racer recovery failed');
}

function resetRace() {
  running = false;
  finished = false;
  raceElapsed = 0;
  cameraY = 0;
  camera.position.y = 0;
  result.hidden = true;
  createMountains();
  const active = racers.filter((racer) => racer.active);
  active.forEach((racer, index) => {
    placeRacer(racer, (index - (active.length - 1) / 2) * RACER_GAP_X, screenToWorldY(150));
    racer.placed = false;
    racer.isFlipping = false;
    racer.stickDuration = 0.32 + Math.random() * 0.06;
    racer.gripElapsed = -racer.stickDuration;
    racer.stalledFor = 0;
  });
  status.textContent = '준비';
  raceTimer.textContent = '00:00.00';
  guide.textContent = mode === 'choice' ? '자동 배치 완료 · 결정 시작' : '직접 배치한 뒤 레이스 시작';
  guide.disabled = false;
  guide.hidden = false;
}

function setParticipants(names, characterKeys) {
  racers.forEach((racer, index) => {
    racer.active = index < names.length;
    if (racer.active && racer.characterKey !== characterKeys[index]) {
      scene.remove(racer.visual);
      racer.visual.traverse((part) => {
        if (!part.isMesh) return;
        if (part.geometry !== sphereGeometry) part.geometry.dispose();
        part.material.dispose();
      });
      racer.characterKey = characterKeys[index];
      racer.visual = makeVisual(racer.characterKey);
    }
    racer.visual.visible = racer.active;
    racer.label.hidden = !racer.active;
    if (racer.active) racer.label.textContent = names[index];
    else [...racer.anchors].forEach((anchor) => detachPad(racer, anchor));
    racer.body.setEnabled(racer.active);
  });
  resetRace();
  if (mode === 'choice') {
    racers.filter((racer) => racer.active).forEach((racer, index, active) => {
      const x = (index - (active.length - 1) / 2) * RACER_GAP_X;
      const y = screenToWorldY(145 + Math.random() * 85);
      placeRacer(racer, x, y);
    });
  }
}

function pointerWorld(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * (camera.right - camera.left);
  const y = camera.position.y + (0.5 - (event.clientY - rect.top) / rect.height) * HEIGHT;
  return { x, y };
}

function nearestOpenPosition(racer, targetX, targetY) {
  const others = racers.filter((item) => item.active && item !== racer).map((item) => item.body.translation());
  const current = racer.body.translation();
  let x = targetX;
  let y = targetY;
  for (let pass = 0; pass < 8; pass += 1) {
    others.forEach((position) => {
      PLACEMENT_PARTS.forEach((part) => {
        PLACEMENT_PARTS.forEach((otherPart) => {
          const width = part.rx + otherPart.rx;
          const height = part.ry + otherPart.ry;
          let dx = x + part.x - position.x - otherPart.x;
          let dy = y + part.y - position.y - otherPart.y;
          let distance = Math.hypot(dx / width, dy / height);
          if (distance >= 1) return;
          if (!distance) {
            dx = current.x - position.x || 1;
            dy = current.y - position.y;
            distance = Math.hypot(dx / width, dy / height);
          }
          const scale = 1.001 / distance;
          x = THREE.MathUtils.clamp(x + dx * (scale - 1), -160, 160);
          y = THREE.MathUtils.clamp(y + dy * (scale - 1), screenToWorldY(START_LINE_Y - 55), screenToWorldY(105));
        });
      });
    });
  }
  const overlaps = others.some((position) => PLACEMENT_PARTS.some((part) => PLACEMENT_PARTS.some((otherPart) => (
    Math.hypot(
      (x + part.x - position.x - otherPart.x) / (part.rx + otherPart.rx),
      (y + part.y - position.y - otherPart.y) / (part.ry + otherPart.ry)
    ) < 1
  ))));
  return !overlaps
    ? { x, y }
    : current;
}

let draggedRacer = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (running || finished || mode === 'choice') return;
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
  const position = nearestOpenPosition(
    draggedRacer,
    THREE.MathUtils.clamp(point.x, -160, 160),
    THREE.MathUtils.clamp(point.y, screenToWorldY(START_LINE_Y - 55), screenToWorldY(105))
  );
  placeRacer(draggedRacer, position.x, position.y);
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
    const { doll, accents, key } = racer.visual.userData;
    const characterMotion = running ? raceElapsed : 0;
    doll.position.set(0, 0, 0);
    doll.rotation.set(0, 0, 0);
    doll.scale.set(1, 1, 1);
    accents.forEach((part) => {
      part.rotation.z = part.userData.baseRotationZ;
      part.scale.y = part.userData.baseScaleY;
    });
    if (key === 'bear') doll.position.y = Math.sin(characterMotion * 3.2) * 1.1;
    else if (key === 'rabbit') accents.forEach((ear, index) => { ear.rotation.z += Math.sin(characterMotion * 9 + index * Math.PI) * 0.13; });
    else if (key === 'cat') doll.rotation.y = Math.sin(characterMotion * 6) * 0.09;
    else if (key === 'duck') {
      const bounce = Math.sin(characterMotion * 7) * 0.025;
      doll.scale.set(1 + bounce, 1 - bounce, 1);
      accents[0].scale.y *= 1 + Math.abs(bounce) * 2;
    } else if (key === 'turtle') {
      doll.rotation.z = Math.sin(characterMotion * 2.4) * 0.025;
      accents.forEach((shell) => { shell.rotation.z += Math.sin(characterMotion * 2.4) * 0.04; });
    }
    if (running) {
      const progressY = anchorProgressY(racer);
      if (progressY < racer.lastProgressY - 18) {
        racer.lastProgressY = progressY;
        racer.stalledFor = 0;
      } else racer.stalledFor += dt;
      if (racer.stalledFor > 2.5 && raceElapsed > 4) {
        recoverStalledRacer(racer);
      }
      racer.gripElapsed += dt * (raceElapsed > RACE_RUSH_TIME ? 1.55 : 1);
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
        && Math.abs(landingPoint.z - GRIP_Z) < 12;
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
    const minutes = Math.floor(raceElapsed / 60);
    const seconds = Math.floor(raceElapsed % 60);
    const hundredths = Math.floor(raceElapsed * 100) % 100;
    raceTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
    status.textContent = raceElapsed > RACE_RUSH_TIME ? `끝까지 ${progress}%` : `천천히 ${progress}%`;
    if (raceElapsed >= RACE_LIMIT && !finished) {
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
    ? `“${decisionQuestion.value.trim()}”의 답`
    : `${racer.label.textContent} 승!`;
  const comments = mode === 'choice'
    ? ['서두르지 않아도 답은 먼저 도착합니다.', '고민 끝. 이번 우화의 결말입니다.', '느린 중력이 대신 골라주었습니다.']
    : ['빠른 출발보다 끝까지 붙는 힘이 셌습니다.', '토끼도 거북이도 예상하지 못한 결말입니다.', '천천히 내려와도 먼저 닿으면 우승입니다.'];
  resultComments = comments;
  commentIndex = Math.floor(Math.random() * comments.length);
  showComment();
  const resultItems = mode === 'choice' ? [ranking[0]] : ranking;
  resultList.replaceChildren(...resultItems.map((item, index) => {
    const row = document.createElement('li');
    row.textContent = mode === 'choice' ? `결정: ${item.label.textContent}` : `${index + 1}위  ${item.label.textContent}`;
    return row;
  }));
  showOverlay(result);
  gsap.from(resultList.children, { y: 18, opacity: 0, stagger: 0.08, duration: 0.4 * motionScale, delay: 0.18 * motionScale });
  tone(CHARACTER_TONES[racer.characterKey], 0.25);
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
  raceStart.hidden = false;
  signalLights.forEach((light) => light.className = '');
  for (let count = 3; count > 0; count -= 1) {
    startCount.textContent = `${count}`;
    startCaption.textContent = '출발 준비';
    signalLights[3 - count].className = 'on';
    gsap.fromTo('.start-board', { scale: 0.78, rotation: -2 }, { scale: 1, rotation: 0, duration: 0.38 * motionScale, ease: 'back.out(2)' });
    gsap.fromTo(startCount, { scale: 1.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 * motionScale, ease: 'power3.out' });
    tone(360 + (3 - count) * 80, 0.16);
    buzz(35);
    await wait(700);
  }
  signalLights.forEach((light) => light.className = 'go');
  startCount.textContent = '출발!';
  startCaption.textContent = mode === 'choice' ? '결정은 중력에게' : '먼저 도착하면 우승';
  gsap.fromTo(startCount, { scale: 0.65 }, { scale: 1.08, duration: 0.32 * motionScale, ease: 'back.out(2.4)' });
  gsap.fromTo(game, { x: -5 }, { x: 0, duration: 0.08, repeat: 5, yoyo: true, clearProps: 'x' });
  tone(820, 0.3);
  buzz([60, 35, 90]);
  raceElapsed = 0;
  raceStartedAt = performance.now();
  running = true;
  await wait(450);
  raceStart.hidden = true;
  guide.hidden = true;
  guide.disabled = false;
}

async function boot() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -520, z: 0 });
  world.timestep = 1 / 60;
  eventQueue = new RAPIER.EventQueue(true);
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, screenToWorldY(COURSE_HEIGHT / 2), WALL_Z - 2));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(WIDTH / 2, COURSE_HEIGHT / 2, 500).setTranslation(0, 0, -499).setFriction(0),
    wallBody
  );
  for (const side of [-1, 1]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, COURSE_HEIGHT / 2, 40)
        .setTranslation(side * (WIDTH / 2 + 4), 0, 10)
        .setFriction(0),
      wallBody
    );
  }
  makeWall();
  racers = KEYS.map((_, index) => createRacer(index));
  characterPreviews = renderCharacterPreviews();
  syncCharacterOptions();
  resize();
  setupSubmit.disabled = false;
  setupSubmit.textContent = '찰싹 붙이러 가기';
  gsap.from('#setup-form', { opacity: 0, duration: 0.5 * motionScale, ease: 'power2.out' });
  gsap.from('.hero-title img', { scale: 0.8, opacity: 0.2, duration: 0.8 * motionScale, ease: 'back.out(1.6)' });
  revealText(setupDescription);
  if (motionScale) gsap.to('.story-marquee-track', { xPercent: -50, duration: 22, repeat: -1, ease: 'none' });

  let previous = performance.now();
  let accumulator = 0;
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (running) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        racers.forEach((racer) => {
          if (!racer.active) return;
          const x = racer.body.translation().x;
          const edgeDepth = Math.abs(x) - EDGE_SOFT_LIMIT;
          if (edgeDepth > 0) {
            const impulse = (EDGE_INWARD_FORCE + edgeDepth * 2) * world.timestep * racer.body.mass();
            racer.body.applyImpulse({ x: -Math.sign(x) * impulse, y: 0, z: 0 }, true);
          }
        });
        world.step(eventQueue);
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
  const participants = nameInputs.map((input, index) => ({ name: input.value.trim(), character: characterSelects[index].value })).filter(({ name }) => name);
  const names = participants.map(({ name }) => name);
  if (names.length < 2) {
    nameInputs.find((input) => !input.value.trim())?.focus();
    return;
  }
  soundEnabled = document.querySelector('#sound-toggle').checked;
  hapticEnabled = document.querySelector('#haptic-toggle').checked;
  const characterKeys = mode === 'choice'
    ? [...CHARACTER_KEYS].sort(() => Math.random() - 0.5).slice(0, names.length)
    : participants.map(({ character }) => character);
  setParticipants(names, characterKeys);
  hideOverlay(setup);
  tone(420);
});
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    game.dataset.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    const choiceMode = mode === 'choice';
    characterSelects.forEach((select) => { select.disabled = choiceMode; });
    setupDescription.textContent = choiceMode
      ? '고민되는 선택지를 적어주세요. 느린 중력이 결말을 정합니다.'
      : '이름을 적고 벽에 붙여주세요. 이번 이야기의 결말은 중력이 정합니다.';
    revealText(setupDescription);
    nameInputs.forEach((input, index) => {
      input.placeholder = `${index + 1}번째 ${choiceMode ? '선택지' : '이름'}${index > 1 ? ' (선택)' : ''}`;
      input.setAttribute('aria-label', `${index + 1}번째 ${choiceMode ? '선택지' : '참가자'}`);
    });
    decisionQuestion.required = choiceMode;
    setupSubmit.textContent = choiceMode ? '중력에게 결정 맡기기' : '찰싹 붙이러 가기';
    document.querySelector('#edit-players').textContent = choiceMode ? '선택지 변경' : '이름 변경';
    document.querySelector('#replay').textContent = choiceMode ? '다시 결정' : '한 판 더';
    syncCharacterOptions();
  });
});
function syncCharacterOptions() {
  const active = characterSelects.map((_, index) => index < 2 || Boolean(nameInputs[index].value.trim()));
  const claimed = new Set();
  characterSelects.forEach((select, index) => {
    if (!active[index]) return;
    if (claimed.has(select.value)) select.value = CHARACTER_KEYS.find((key) => !claimed.has(key));
    claimed.add(select.value);
  });
  characterSelects.forEach((select, index) => {
    const used = new Set(characterSelects.filter((_, otherIndex) => otherIndex !== index && active[otherIndex]).map((item) => item.value));
    [...select.options].forEach((option) => { option.disabled = used.has(option.value); });
    const disabled = mode === 'choice' || !active[index];
    characterPickers[index].setAttribute('aria-disabled', String(disabled));
    characterPickers[index].querySelectorAll('button').forEach((button) => { button.disabled = disabled; });
    characterPreviewLabels[index].textContent = active[index] ? CHARACTER_NAMES[select.value] : '이름 입력 후 선택';
    if (characterPreviews[select.value]) characterPreviewImages[index].src = characterPreviews[select.value];
  });
}
characterSelects.forEach((select, index) => {
  select.replaceChildren(...CHARACTER_KEYS.map((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = CHARACTER_NAMES[key];
    return option;
  }));
  select.value = KEYS[index];
  select.addEventListener('change', syncCharacterOptions);
});
characterSteps.forEach((button) => button.addEventListener('click', () => {
  const index = participants.indexOf(button.closest('.participant'));
  const select = characterSelects[index];
  const available = [...select.options].filter((option) => !option.disabled || option.selected).map((option) => option.value);
  const next = (available.indexOf(select.value) + Number(button.dataset.direction) + available.length) % available.length;
  select.value = available[next];
  syncCharacterOptions();
  gsap.fromTo(characterPreviewImages[index], { x: Number(button.dataset.direction) * 18, opacity: 0.25 }, { x: 0, opacity: 1, duration: 0.25 * motionScale });
}));
nameInputs.forEach((input) => input.addEventListener('input', syncCharacterOptions));
syncCharacterOptions();
document.querySelector('#replay').addEventListener('click', () => {
  resetRace();
  startRace();
});
document.querySelector('#edit-players').addEventListener('click', () => {
  result.hidden = true;
  showOverlay(setup);
});
commentPrev.addEventListener('click', () => showComment(-1));
commentNext.addEventListener('click', () => showComment(1));
addEventListener('resize', resize);
boot().catch((error) => {
  console.error(error);
  errorBox.style.display = 'grid';
});
