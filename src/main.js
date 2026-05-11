import * as THREE from 'three';
import { io } from 'socket.io-client';

const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:3000` 
    : '/';
const socket = io(serverUrl);

const blocker = document.getElementById('blocker');
const mobileControls = document.getElementById('mobile-controls');
const phaseIndicator = document.getElementById('phase-indicator');
const phaseText = document.getElementById('phase-text');
const phaseTimerElem = document.getElementById('phase-timer');
const hpBar = document.getElementById('hp-bar');
const hpText = document.getElementById('hp-text');
const gameOverOverlay = document.getElementById('game-over-overlay');
const winOverlay = document.getElementById('win-overlay');

let isPlaying = false;
let isDead = false;
let joyMoveX = 0;
let joyMoveZ = 0;
let joystickInitialized = false;

function startGame() {
    if (isDead) return;
    blocker.style.opacity = '0';
    setTimeout(() => blocker.style.display = 'none', 300);
    isPlaying = true;
    if (isMobile) {
        mobileControls.style.display = 'block';
        if (!joystickInitialized) {
            const zone = document.getElementById('joystick-zone');
            zone.innerHTML = `
                <div id="joy-base" style="position: absolute; width: 100px; height: 100px; background: rgba(255,255,255,0.2); border-radius: 50%; display: none; transform: translate(-50%, -50%); pointer-events: none;">
                    <div id="joy-stick" style="position: absolute; width: 40px; height: 40px; background: white; border-radius: 50%; top: 30px; left: 30px; pointer-events: none;"></div>
                </div>
            `;
            const joyBase = document.getElementById('joy-base');
            const joyStick = document.getElementById('joy-stick');
            let touchId = null;
            let startX = 0, startY = 0;

            zone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (touchId !== null) return;
                const touch = e.changedTouches[0];
                touchId = touch.identifier;
                startX = touch.clientX;
                startY = touch.clientY;
                
                joyBase.style.left = startX + 'px';
                joyBase.style.top = startY + 'px';
                joyBase.style.display = 'block';
                joyStick.style.transform = `translate(0px, 0px)`;
            }, {passive: false});

            zone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                for (let i=0; i<e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (touch.identifier === touchId) {
                        let dx = touch.clientX - startX;
                        let dy = touch.clientY - startY;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        const maxDist = 50;
                        if (dist > maxDist) {
                            dx = (dx/dist)*maxDist;
                            dy = (dy/dist)*maxDist;
                        }
                        joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
                        
                        if (dist > 5) { // Deadzone
                            joyMoveX = dx;
                            joyMoveZ = dy; // Note: touch Y down is positive, moving player +Z (backward). This is correct!
                        } else {
                            joyMoveX = 0; joyMoveZ = 0;
                        }
                    }
                }
            }, {passive: false});

            const endTouch = (e) => {
                for (let i=0; i<e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === touchId) {
                        touchId = null;
                        joyBase.style.display = 'none';
                        joyMoveX = 0;
                        joyMoveZ = 0;
                    }
                }
            };
            zone.addEventListener('touchend', endTouch);
            zone.addEventListener('touchcancel', endTouch);

            joystickInitialized = true;
        }
    }
}

if (isMobile) {
    blocker.addEventListener('touchstart', (e) => { e.preventDefault(); startGame(); });
    document.getElementById('btn-attack').addEventListener('touchstart', (e) => { e.preventDefault(); cqcAttack(); });
} else {
    blocker.addEventListener('click', () => { startGame(); });
    document.addEventListener('mousedown', (e) => { if(e.button === 0 && isPlaying) cqcAttack(); });
}

function cqcAttack() {
    if (!isPlaying || isDead) return;
    socket.emit('cqcAttack');
    myPlayer.userData.punchTimer = 0.2;
}

// ---- Three.js Setup ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050508');
scene.fog = new THREE.Fog('#050508', 30, 80);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60;
dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60;
scene.add(dirLight);

// ---- Materials & Geometries ----
const wallMat = new THREE.MeshStandardMaterial({ color: '#2a2a35', roughness: 0.9 });
const visionMat = new THREE.MeshBasicMaterial({ color: '#ff0000', transparent: true, opacity: 0.2, side: THREE.DoubleSide });
const camBaseMat = new THREE.MeshStandardMaterial({ color: '#888' });

function createHumanoid(isPlayer) {
    const group = new THREE.Group();
    const color = isPlayer ? '#111' : '#455a43'; 
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat);
    head.position.y = 1.7; head.castShadow = true; group.add(head);

    const visorMat = new THREE.MeshBasicMaterial({ color: isPlayer ? '#4ade80' : '#ff4444' });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), visorMat);
    visor.position.set(0, 1.75, -0.31); group.add(visor);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.4), mat);
    body.position.y = 0.9; body.castShadow = true; group.add(body);

    const armGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const armL = new THREE.Mesh(armGeo, mat); armL.position.set(-0.55, 1.0, 0); armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, mat); armR.position.set(0.55, 1.0, 0); armR.castShadow = true;
    group.add(armL); group.add(armR);

    const legGeo = new THREE.BoxGeometry(0.35, 0.9, 0.35);
    const legL = new THREE.Mesh(legGeo, mat); legL.position.set(-0.2, 0.45, 0); legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, mat); legR.position.set(0.2, 0.45, 0); legR.castShadow = true;
    group.add(legL); group.add(legR);

    if (!isPlayer) {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.8), new THREE.MeshStandardMaterial({color:'#222'}));
        gun.position.set(0, -0.3, -0.3); armR.add(gun);
    }

    group.userData = { head, body, armL, armR, legL, legR, walkTime: 0, punchTimer: 0 };
    return group;
}

const myPlayer = createHumanoid(true);
scene.add(myPlayer);

const otherPlayers = {};
const guardsMap = {};
const camerasMap = {};
const elevatorsMap = {};
let colliders = [];

// Goal
const goalGeo = new THREE.CylinderGeometry(4, 4, 0.5, 32);
const goalMat = new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.5 });
const goalMesh = new THREE.Mesh(goalGeo, goalMat);
scene.add(goalMesh);

const bullets = [];

// ---- Keyboard Controls ----
const keys = { w: false, a: false, s: false, d: false };
if (!isMobile) {
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true;
        if (e.key === 'ArrowUp') keys.w = true; if (e.key === 'ArrowDown') keys.s = true;
        if (e.key === 'ArrowLeft') keys.a = true; if (e.key === 'ArrowRight') keys.d = true;
    });
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
        if (e.key === 'ArrowUp') keys.w = false; if (e.key === 'ArrowDown') keys.s = false;
        if (e.key === 'ArrowLeft') keys.a = false; if (e.key === 'ArrowRight') keys.d = false;
    });
}

function getFloorHeight(x, y, z) {
    const origin = new THREE.Vector3(x, y + 2.0, z); // cast from above
    const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 10);
    const hits = raycaster.intersectObjects(colliders);
    if (hits.length > 0) return hits[0].point.y;
    return -100; // falling abyss
}

function checkWallCollision(nx, ny, nz, radius) {
    // Simple AABB check for walls around player center
    for (const mesh of colliders) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox.clone();
        box.applyMatrix4(mesh.matrixWorld);
        
        // If Y is above the box or below it, ignore
        if (ny > box.max.y || ny + 2 < box.min.y) continue; 
        
        // Ignore small steps (allows walking onto elevators and ramps)
        if (box.max.y - ny <= 0.6) continue;
        
        const closestX = Math.max(box.min.x, Math.min(nx, box.max.x));
        const closestZ = Math.max(box.min.z, Math.min(nz, box.max.z));
        
        const dx = nx - closestX;
        const dz = nz - closestZ;
        
        if ((dx * dx + dz * dz) < (radius * radius)) return true;
    }
    return false;
}

// ---- Network ----
socket.on('init', (data) => {
    data.mapData.forEach(item => {
        const geo = new THREE.BoxGeometry(item.w, item.h, item.d);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(item.x, item.y, item.z);
        if (item.type === 'ramp' && item.rotX) {
            mesh.rotation.x = item.rotX;
        }
        mesh.updateMatrixWorld();
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        colliders.push(mesh);
    });

    if (data.elevators) {
        const elevatorMat = new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.8 });
        data.elevators.forEach(e => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(e.w, e.h, e.d), elevatorMat);
            mesh.position.set(e.x, e.y, e.z);
            mesh.updateMatrixWorld();
            mesh.castShadow = true; mesh.receiveShadow = true;
            scene.add(mesh);
            colliders.push(mesh);
            elevatorsMap[e.id] = mesh;
        });
    }

    goalMesh.position.set(data.goalPos.x, data.goalPos.y + 0.25, data.goalPos.z);
    myPlayer.position.set(data.startPos.x, data.startPos.y, data.startPos.z);

    data.guards.forEach(gData => {
        const gMesh = createHumanoid(false);
        gMesh.position.set(gData.x, gData.y, gData.z);
        
        const coneRadius = Math.tan(gData.fovAngle / 2) * gData.fovDist;
        const coneGeo = new THREE.ConeGeometry(coneRadius, gData.fovDist, 16);
        coneGeo.rotateX(Math.PI / 2); coneGeo.translate(0, 0, -gData.fovDist / 2);
        const coneMesh = new THREE.Mesh(coneGeo, visionMat);
        coneMesh.position.y = 1.5;
        gMesh.add(coneMesh);

        const starGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const starMat = new THREE.MeshBasicMaterial({color:'#ffff00'});
        const stars = new THREE.Group();
        for(let i=0; i<3; i++){
            const s = new THREE.Mesh(starGeo, starMat);
            s.position.set(Math.cos(i*2.1)*0.5, 2.5, Math.sin(i*2.1)*0.5);
            stars.add(s);
        }
        stars.visible = false;
        gMesh.add(stars);

        scene.add(gMesh);
        guardsMap[gData.id] = { mesh: gMesh, cone: coneMesh, stars, state: gData.state, prevPos: new THREE.Vector3(gData.x,gData.y,gData.z) };
    });

    data.cameras.forEach(cData => {
        const camGroup = new THREE.Group();
        camGroup.position.set(cData.x, cData.y, cData.z);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), camBaseMat);
        camGroup.add(base);
        
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.8), camBaseMat);
        head.rotation.x = Math.PI/2;
        camGroup.add(head);

        const coneRadius = Math.tan(cData.fovAngle / 2) * cData.fovDist;
        const coneGeo = new THREE.ConeGeometry(coneRadius, cData.fovDist, 16);
        coneGeo.rotateX(Math.PI / 2); coneGeo.translate(0, 0, -cData.fovDist / 2);
        const coneMesh = new THREE.Mesh(coneGeo, visionMat);
        head.add(coneMesh);

        scene.add(camGroup);
        camerasMap[cData.id] = { group: camGroup, head: head };
    });

    updatePhase(data.globalPhase);
});

socket.on('syncState', (data) => {
    data.guards.forEach(gData => {
        const g = guardsMap[gData.id];
        if (g) {
            g.prevPos.copy(g.mesh.position);
            g.mesh.position.set(gData.x, gData.y, gData.z);
            g.mesh.rotation.y = gData.rotation;
            g.state = gData.state;
            g.stars.visible = (g.state === 'STUNNED');
            g.cone.visible = (g.state !== 'STUNNED');
        }
    });

    data.cameras.forEach(cData => {
        const c = camerasMap[cData.id];
        if (c) c.head.rotation.y = cData.rotation;
    });

    if (data.elevators) {
        data.elevators.forEach(eData => {
            const mesh = elevatorsMap[eData.id];
            if (mesh) {
                mesh.position.y = eData.y;
                mesh.updateMatrixWorld();
            }
        });
    }

    for (const pid in data.players) {
        if (pid === socket.id) continue;
        const pData = data.players[pid];
        if (pData.isDead) {
            if (otherPlayers[pid]) { scene.remove(otherPlayers[pid]); delete otherPlayers[pid]; }
            continue;
        }
        if (!otherPlayers[pid]) {
            const mesh = createHumanoid(true);
            scene.add(mesh);
            otherPlayers[pid] = mesh;
        }
        otherPlayers[pid].userData.prevPos = otherPlayers[pid].position.clone();
        otherPlayers[pid].position.set(pData.x, pData.y, pData.z);
        otherPlayers[pid].rotation.y = pData.rotation;
    }

    if (data.globalPhaseTimer > 0 && (phaseText.innerText === 'ALERT' || phaseText.innerText === 'EVASION')) {
        phaseTimerElem.innerText = Math.ceil(data.globalPhaseTimer) + 's';
    } else {
        phaseTimerElem.innerText = '';
    }
});

socket.on('playerLeave', (id) => {
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; }
});

socket.on('respawn', (pos) => {
    myPlayer.position.set(pos.x, pos.y, pos.z);
    isDead = false;
    gameOverOverlay.style.display = 'none';
    startGame();
});

socket.on('gameOver', () => {
    isDead = true; isPlaying = false;
    gameOverOverlay.style.display = 'block'; blocker.style.display = 'flex'; blocker.style.opacity = '1';
    if(isMobile) mobileControls.style.display = 'none';
});

socket.on('gameWin', () => {
    winOverlay.style.display = 'block';
    setTimeout(() => { winOverlay.style.display = 'none'; }, 4000);
});

socket.on('hpUpdate', (data) => {
    if (data.id === socket.id) {
        hpBar.style.width = `${Math.max(0, data.hp)}%`;
        hpText.innerText = `${Math.max(0, data.hp)} / 100`;
        if (data.hp <= 30) hpBar.style.backgroundColor = '#ff4444';
        else hpBar.style.backgroundColor = '#4ade80';
    }
});

function updatePhase(phase) {
    phaseIndicator.className = `phase-${phase.toLowerCase()}`; phaseText.innerText = phase;
    const color = phase === 'ALERT' ? 0xff0000 : (phase === 'EVASION' ? 0xffff00 : 0x0088ff);
    visionMat.color.setHex(color);
}
socket.on('phaseChange', updatePhase);

socket.on('shoot', (data) => {
    const mat = new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 });
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(data.from.x, data.from.y, data.from.z), new THREE.Vector3(data.to.x, data.to.y, data.to.z)]);
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    bullets.push({ mesh: line, timer: 0.1 });
});

// ---- Animation Loop ----
let prevTime = performance.now();
let lastSyncTime = 0;
let playerVelocityY = 0;

function animateHumanoid(h, distMoved, dt) {
    const ud = h.userData;
    if (distMoved > 0.01) {
        ud.walkTime += dt * 10;
        ud.armL.rotation.x = Math.sin(ud.walkTime) * 0.5; ud.armR.rotation.x = -Math.sin(ud.walkTime) * 0.5;
        ud.legL.rotation.x = -Math.sin(ud.walkTime) * 0.5; ud.legR.rotation.x = Math.sin(ud.walkTime) * 0.5;
    } else {
        ud.armL.rotation.x = 0; ud.armR.rotation.x = 0;
        ud.legL.rotation.x = 0; ud.legR.rotation.x = 0;
    }
    if (ud.punchTimer > 0) { ud.punchTimer -= dt; ud.armR.rotation.x = -Math.PI / 2; }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const dt = (time - prevTime) / 1000;
    prevTime = time;

    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].timer -= dt;
        if (bullets[i].timer <= 0) { scene.remove(bullets[i].mesh); bullets.splice(i, 1); }
    }

    for (const gid in guardsMap) {
        const g = guardsMap[gid];
        const dist = new THREE.Vector2(g.mesh.position.x - g.prevPos.x, g.mesh.position.z - g.prevPos.z).length();
        animateHumanoid(g.mesh, dist, dt);
        if (g.state === 'STUNNED') g.stars.rotation.y += dt * 5;
    }
    for (const pid in otherPlayers) {
        const p = otherPlayers[pid];
        const dist = new THREE.Vector2(p.position.x - p.userData.prevPos.x, p.position.z - p.userData.prevPos.z).length();
        animateHumanoid(p, dist, dt);
    }

    if (isPlaying && !isDead) {
        let dx = 0; let dz = 0;
        if (joyMoveX !== 0 || joyMoveZ !== 0) { 
            // Normalize joystick vector to guarantee full speed movement
            const len = Math.sqrt(joyMoveX * joyMoveX + joyMoveZ * joyMoveZ);
            if (len > 0.05) {
                dx = joyMoveX / len; 
                dz = joyMoveZ / len; 
            }
        } else {
            if (keys.a) dx -= 1; if (keys.d) dx += 1;
            if (keys.w) dz -= 1; if (keys.s) dz += 1;
            if (dx !== 0 && dz !== 0) { const len = Math.sqrt(dx*dx + dz*dz); dx /= len; dz /= len; }
        }

        const speed = 8;
        const moveX = dx * speed * dt;
        const moveZ = dz * speed * dt;
        
        const isMoving = Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01;
        if (isMoving) myPlayer.rotation.y = Math.atan2(dx, dz) + Math.PI;

        animateHumanoid(myPlayer, isMoving ? 1 : 0, dt);

        let nextX = myPlayer.position.x + moveX;
        let nextZ = myPlayer.position.z + moveZ;
        const radius = 0.5;

        // X/Z Collision
        if (checkWallCollision(nextX, myPlayer.position.y, myPlayer.position.z, radius)) nextX = myPlayer.position.x;
        if (checkWallCollision(myPlayer.position.x, myPlayer.position.y, nextZ, radius)) nextZ = myPlayer.position.z;
        
        myPlayer.position.x = nextX;
        myPlayer.position.z = nextZ;

        // Y Gravity & Floor detection
        const floorY = getFloorHeight(myPlayer.position.x, myPlayer.position.y, myPlayer.position.z);
        if (myPlayer.position.y > floorY + 0.1) {
            playerVelocityY -= 20 * dt; // gravity
            myPlayer.position.y += playerVelocityY * dt;
            if (myPlayer.position.y <= floorY) {
                myPlayer.position.y = floorY;
                playerVelocityY = 0;
            }
        } else if (floorY > myPlayer.position.y) {
            // Walking up a ramp or stepping up
            myPlayer.position.y += (floorY - myPlayer.position.y) * 10 * dt; // smooth step up
            playerVelocityY = 0;
        }

        // Camera follow
        camera.position.x += (myPlayer.position.x - camera.position.x) * 5 * dt;
        camera.position.z += (myPlayer.position.z + 18 - camera.position.z) * 5 * dt;
        camera.position.y += (myPlayer.position.y + 25 - camera.position.y) * 5 * dt;
        camera.lookAt(camera.position.x, myPlayer.position.y, camera.position.z - 18);

        if (time - lastSyncTime > 50) {
            socket.emit('updatePlayer', { x: myPlayer.position.x, y: myPlayer.position.y, z: myPlayer.position.z, rotation: myPlayer.rotation.y });
            lastSyncTime = time;
        }
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
