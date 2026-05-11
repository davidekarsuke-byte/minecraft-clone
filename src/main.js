import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { io } from 'socket.io-client';
import nipplejs from 'nipplejs';

// ---- Device Check ----
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---- Socket.IO Setup ----
const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:3000` 
    : '/';
const socket = io(serverUrl);

// ---- Scene Setup ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87CEEB');
scene.fog = new THREE.Fog('#87CEEB', 20, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 2;

// Custom pitch object for mobile look controls
const pitchObject = new THREE.Object3D();
pitchObject.add(camera);
const yawObject = new THREE.Object3D();
yawObject.position.y = 2;
yawObject.add(pitchObject);
if (isMobile) {
    scene.add(yawObject);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ---- Lighting ----
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

// ---- World Setup ----
const objects = [];
const blockMeshes = {};

const groundGeo = new THREE.PlaneGeometry(200, 200);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({ color: '#5b8c47', roughness: 0.8 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);
objects.push(ground);

const blockColors = ['#8b5a2b', '#808080', '#e6e6e6', '#c2b280'];
let currentBlockColorIndex = 0;
let currentBlockColor = blockColors[0];
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

function getBlockMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: 0.6, metalness: 0.1 });
}

function addBlockToScene(blockData) {
    const key = `${blockData.x},${blockData.y},${blockData.z}`;
    if (blockMeshes[key]) return;
    const material = getBlockMaterial(blockData.color);
    const mesh = new THREE.Mesh(blockGeo, material);
    mesh.position.set(blockData.x, blockData.y, blockData.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push(mesh);
    blockMeshes[key] = mesh;
}

function removeBlockFromScene(pos) {
    const key = `${pos.x},${pos.y},${pos.z}`;
    const mesh = blockMeshes[key];
    if (mesh) {
        scene.remove(mesh);
        objects.splice(objects.indexOf(mesh), 1);
        delete blockMeshes[key];
    }
}

// ---- Controls Setup ----
let controls;
const blocker = document.getElementById('blocker');
const mobileControls = document.getElementById('mobile-controls');
const instructions = document.getElementById('instructions');

let isPlaying = false; // for mobile state
let joyMoveForward = 0;
let joyMoveRight = 0;
let canJump = false;

if (isMobile) {
    blocker.style.display = 'none';
    mobileControls.style.display = 'block';
    isPlaying = true;

    // Joystick
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-zone'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white'
    });

    joystick.on('move', (evt, data) => {
        const angle = data.angle.radian;
        const force = Math.min(data.force, 1);
        joyMoveForward = Math.sin(angle) * force;
        joyMoveRight = Math.cos(angle) * force;
    });

    joystick.on('end', () => {
        joyMoveForward = 0;
        joyMoveRight = 0;
    });

    // Mobile Look (Touch Drag on right half)
    let touchStartX = 0;
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('#joystick-zone') || e.target.closest('.mobile-btn')) return;
        touchStartX = e.touches[0].pageX;
        touchStartY = e.touches[0].pageY;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (e.target.closest('#joystick-zone') || e.target.closest('.mobile-btn')) return;
        e.preventDefault();
        const touchX = e.touches[0].pageX;
        const touchY = e.touches[0].pageY;
        
        const movementX = touchX - touchStartX;
        const movementY = touchY - touchStartY;
        
        yawObject.rotation.y -= movementX * 0.005;
        pitchObject.rotation.x -= movementY * 0.005;
        pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
        
        touchStartX = touchX;
        touchStartY = touchY;
    }, { passive: false });

} else {
    controls = new PointerLockControls(camera, document.body);
    instructions.addEventListener('click', () => { controls.lock(); });
    controls.addEventListener('lock', () => {
        blocker.style.opacity = '0';
        setTimeout(() => blocker.style.display = 'none', 300);
        isPlaying = true;
    });
    controls.addEventListener('unlock', () => {
        blocker.style.display = 'flex';
        setTimeout(() => blocker.style.opacity = '1', 10);
        isPlaying = false;
    });
    scene.add(controls.getObject());
}

// ---- Interaction Functions ----
const raycaster = new THREE.Raycaster();

function performAction(actionType) {
    if (!isPlaying) return;
    
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(objects, false);
    
    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) return;

        if (actionType === 'break') {
            if (intersect.object !== ground) {
                const pos = intersect.object.position;
                socket.emit('removeBlock', { x: pos.x, y: pos.y, z: pos.z });
            }
        } else if (actionType === 'place') {
            const addPos = intersect.point.clone().add(intersect.face.normal.clone().multiplyScalar(0.5));
            addPos.x = Math.round(addPos.x);
            addPos.y = Math.round(addPos.y);
            addPos.z = Math.round(addPos.z);
            
            // Prevent placing inside player
            const playerPos = isMobile ? yawObject.position : controls.getObject().position;
            if (addPos.y < 1 && Math.abs(addPos.x - playerPos.x) < 1 && Math.abs(addPos.z - playerPos.z) < 1) return;

            socket.emit('addBlock', { x: addPos.x, y: addPos.y, z: addPos.z, color: currentBlockColor });
        }
    }
}

// Desktop Clicks
if (!isMobile) {
    document.addEventListener('mousedown', (event) => {
        if (event.button === 0) performAction('break');
        else if (event.button === 2) performAction('place');
    });
}

// Mobile Buttons
document.getElementById('btn-break')?.addEventListener('touchstart', (e) => { e.preventDefault(); performAction('break'); });
document.getElementById('btn-place')?.addEventListener('touchstart', (e) => { e.preventDefault(); performAction('place'); });
document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); if (canJump) { velocity.y += 10; canJump = false; } });
document.getElementById('btn-color')?.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    currentBlockColorIndex = (currentBlockColorIndex + 1) % blockColors.length;
    currentBlockColor = blockColors[currentBlockColorIndex];
    document.getElementById('btn-color').style.color = currentBlockColor;
});

// Color change with number keys (Desktop)
document.addEventListener('keydown', (event) => {
    if (event.key >= '1' && event.key <= '4') {
        currentBlockColorIndex = parseInt(event.key) - 1;
        currentBlockColor = blockColors[currentBlockColorIndex];
    }
});

// ---- Movement Logic (Desktop) ----
let moveForward = false; let moveBackward = false;
let moveLeft = false; let moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const onKeyDown = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) { velocity.y += 10; canJump = false; } break;
    }
};
const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
    }
};
if (!isMobile) {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

// ---- Multiplayer Rendering ----
const otherPlayers = {};
const playerGeo = new THREE.CapsuleGeometry(0.4, 1, 4, 8);
const playerMat = new THREE.MeshStandardMaterial({ color: '#ff5555' });

function updateOtherPlayer(id, data) {
    if (!otherPlayers[id]) {
        const mesh = new THREE.Mesh(playerGeo, playerMat);
        mesh.castShadow = true;
        scene.add(mesh);
        otherPlayers[id] = mesh;
    }
    otherPlayers[id].position.set(data.position[0], data.position[1] - 0.5, data.position[2]);
    otherPlayers[id].rotation.y = data.rotation[1];
}

socket.on('init', (data) => {
    data.blocks.forEach(addBlockToScene);
    for (const [id, pData] of Object.entries(data.players)) {
        if (id !== socket.id) updateOtherPlayer(id, pData);
    }
});
socket.on('playerJoin', (data) => updateOtherPlayer(data.id, data.player));
socket.on('playerMove', (data) => updateOtherPlayer(data.id, data.player));
socket.on('blockAdded', (block) => addBlockToScene(block));
socket.on('blockRemoved', (pos) => removeBlockFromScene(pos));
socket.on('playerLeave', (id) => {
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; }
});

// ---- Animation Loop ----
let prevTime = performance.now();
let lastSyncTime = 0;

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (isPlaying) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 30.0 * delta; 

        if (isMobile) {
            // Apply Joystick movement
            // Joystick is rotated 90deg internally (sin/cos mapping above)
            direction.z = -joyMoveForward;
            direction.x = joyMoveRight;
            
            // Manual movement relative to yawObject rotation
            const moveVec = new THREE.Vector3(direction.x, 0, direction.z);
            moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawObject.rotation.y);
            
            velocity.x += moveVec.x * 100.0 * delta;
            velocity.z += moveVec.z * 100.0 * delta;

            yawObject.position.x += velocity.x * delta;
            yawObject.position.z += velocity.z * delta;
            yawObject.position.y += velocity.y * delta;

            if (yawObject.position.y < 2) {
                velocity.y = 0;
                yawObject.position.y = 2;
                canJump = true;
            }
        } else {
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;

            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);
            controls.getObject().position.y += (velocity.y * delta);

            if (controls.getObject().position.y < 2) {
                velocity.y = 0;
                controls.getObject().position.y = 2;
                canJump = true;
            }
        }

        if (time - lastSyncTime > 50) {
            const pos = isMobile ? yawObject.position : controls.getObject().position;
            const rotY = isMobile ? yawObject.rotation.y : camera.rotation.y; 
            const rotX = isMobile ? pitchObject.rotation.x : camera.rotation.x;
            
            socket.emit('updatePlayer', {
                position: [pos.x, pos.y, pos.z],
                rotation: [rotX, rotY, 0]
            });
            lastSyncTime = time;
        }
    }

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
