import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'dist')));

// ---- GAME STATE & MAP ----
const START_POS = { x: 0, y: 0.1, z: 85 };
const GOAL_POS = { x: 0, y: 0.1, z: -85, radius: 4 };

const players = {};

const mapData = [
    { type: 'box', x: 0, y: -5, z: 0, w: 100, h: 10, d: 200 },
    { type: 'box', x: -51, y: 10, z: 0, w: 2, h: 20, d: 200 },
    { type: 'box', x: 51, y: 10, z: 0, w: 2, h: 20, d: 200 },
    { type: 'box', x: 0, y: 10, z: -101, w: 100, h: 20, d: 2 },
    { type: 'box', x: 0, y: 10, z: 101, w: 100, h: 20, d: 2 },
    
    // SAFE ZONE
    { type: 'box', x: -30, y: 5, z: 75, w: 40, h: 10, d: 2 },
    { type: 'box', x: 30, y: 5, z: 75, w: 40, h: 10, d: 2 },
    
    // COURTYARD
    { type: 'box', x: -20, y: 5, z: 50, w: 30, h: 10, d: 2 },
    { type: 'box', x: 20, y: 5, z: 50, w: 30, h: 10, d: 2 },
    { type: 'box', x: 0, y: 5, z: 40, w: 10, h: 10, d: 10 },
    
    // RAMP
    { type: 'ramp', x: -10, y: 3, z: 20, w: 10, h: 0.5, d: Math.sqrt(20*20 + 6*6), rotX: -Math.atan2(6, 20) },
    
    // CATWALK
    { type: 'box', x: 0, y: 5.75, z: -10, w: 30, h: 0.5, d: 40 },
    { type: 'box', x: -25, y: 5.75, z: -10, w: 20, h: 0.5, d: 10 }, // platform leading to elevator 1
    { type: 'box', x: 20, y: 5.75, z: -30, w: 20, h: 0.5, d: 10 }, // platform leading to elevator 2
    
    // WAREHOUSE
    { type: 'box', x: -15, y: 5, z: -50, w: 2, h: 10, d: 30 },
    { type: 'box', x: 15, y: 5, z: -50, w: 2, h: 10, d: 30 },
    { type: 'box', x: 0, y: 2, z: -60, w: 20, h: 4, d: 4 },
    { type: 'box', x: 0, y: 5, z: -75, w: 40, h: 10, d: 2 }
];

// Elevators
const elevators = [
    { id: 'e1', x: -35, y: 0, z: -10, w: 10, h: 0.5, d: 10, minY: 0.25, maxY: 5.75, speed: 2, direction: 1 },
    { id: 'e2', x: 30, y: 0, z: -30, w: 10, h: 0.5, d: 10, minY: 0.25, maxY: 5.75, speed: 2.5, direction: -1 }
];

// Guards (Weaker, but more of them)
const guardTemplate = { rotation: 0, speed: 2.5, fovDist: 15, fovAngle: Math.PI / 4, state: 'NORMAL', targetPos: null, stunTimer: 0, phaseTimer: 0, shootTimer: 0 };
const guards = [
    { id: 'g1', path: [{x: -30, y:0, z: 60}, {x: 30, y:0, z: 60}], pathIndex: 0, x: -30, y:0, z: 60, ...guardTemplate },
    { id: 'g2', path: [{x: 0, y:0, z: 65}, {x: 0, y:0, z: 35}], pathIndex: 0, x: 0, y:0, z: 65, ...guardTemplate },
    { id: 'g3', path: [{x: -30, y:0, z: 45}, {x: -10, y:0, z: 45}], pathIndex: 0, x: -30, y:0, z: 45, ...guardTemplate }, // New
    { id: 'g4', path: [{x: 30, y:0, z: 45}, {x: 10, y:0, z: 45}], pathIndex: 0, x: 30, y:0, z: 45, ...guardTemplate }, // New
    
    { id: 'g5', path: [{x: -10, y:6, z: 0}, {x: 10, y:6, z: 0}], pathIndex: 0, x: -10, y:6, z: 0, ...guardTemplate },
    { id: 'g6', path: [{x: 0, y:6, z: -20}, {x: 10, y:6, z: -20}], pathIndex: 0, x: 0, y:6, z: -20, ...guardTemplate },
    { id: 'g7', path: [{x: -25, y:6, z: -10}, {x: -15, y:6, z: -10}], pathIndex: 0, x: -25, y:6, z: -10, ...guardTemplate }, // New (near e1)
    
    { id: 'g8', path: [{x: -30, y:0, z: -40}, {x: -30, y:0, z: -70}], pathIndex: 0, x: -30, y:0, z: -40, ...guardTemplate },
    { id: 'g9', path: [{x: 30, y:0, z: -70}, {x: 30, y:0, z: -40}], pathIndex: 0, x: 30, y:0, z: -70, ...guardTemplate },
    { id: 'g10', path: [{x: -10, y:0, z: -65}, {x: 10, y:0, z: -65}], pathIndex: 0, x: -10, y:0, z: -65, ...guardTemplate } // New
];

const cameras = [
    { id: 'c1', x: 0, y: 6.5, z: 10, baseRotation: 0, sweepAngle: Math.PI/2, sweepSpeed: 0.8, rotation: 0, fovDist: 20, fovAngle: Math.PI/4, time: 0 },
    { id: 'c2', x: 0, y: 6.5, z: -30, baseRotation: Math.PI, sweepAngle: Math.PI/2, sweepSpeed: 0.8, rotation: Math.PI, fovDist: 20, fovAngle: Math.PI/4, time: 0 }
];

let globalPhase = 'NORMAL';
let globalPhaseTimer = 0;

// ---- THREE.JS SERVER COLLISION ----
const serverScene = new THREE.Scene();
const colliders = [];

mapData.forEach(item => {
    const geo = new THREE.BoxGeometry(item.w, item.h, item.d);
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(item.x, item.y, item.z);
    if (item.type === 'ramp' && item.rotX) mesh.rotation.x = item.rotX;
    mesh.updateMatrixWorld();
    colliders.push(mesh);
    serverScene.add(mesh);
});

elevators.forEach(e => {
    const geo = new THREE.BoxGeometry(e.w, e.h, e.d);
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(e.x, e.y, e.z);
    mesh.updateMatrixWorld();
    colliders.push(mesh);
    serverScene.add(mesh);
    e.mesh = mesh;
});

// ---- HELPER FUNCTIONS ----
function checkSight(viewer, p) {
    const vx = viewer.x; const vy = viewer.y + 1.5; const vz = viewer.z;
    const px = p.x; const py = p.y + 1.5; const pz = p.z;
    const dx = px - vx; const dy = py - vy; const dz = pz - vz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    if (dist <= viewer.fovDist) {
        const angleToPlayer = Math.atan2(dx, dz) + Math.PI;
        let angleDiff = Math.abs(angleToPlayer - viewer.rotation);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);
        
        if (angleDiff <= viewer.fovAngle / 2) {
            const dir = new THREE.Vector3(dx, dy, dz).normalize();
            const raycaster = new THREE.Raycaster(new THREE.Vector3(vx, vy, vz), dir, 0, dist);
            const hits = raycaster.intersectObjects(colliders);
            if (hits.length === 0) return true;
        }
    }
    return false;
}

function triggerAlert(targetPos) {
    globalPhase = 'ALERT';
    globalPhaseTimer = 10;
    io.emit('phaseChange', globalPhase);
    
    guards.forEach(g => {
        if (g.state !== 'STUNNED') {
            const dx = targetPos.x - g.x; const dy = targetPos.y - g.y; const dz = targetPos.z - g.z;
            if (dx*dx + dy*dy + dz*dz < 1600) {
                g.state = 'ALERT';
                g.targetPos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
            }
        }
    });
}

function getFloorHeight(x, y, z) {
    const origin = new THREE.Vector3(x, y + 2.0, z);
    const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 10);
    const hits = raycaster.intersectObjects(colliders);
    if (hits.length > 0) return hits[0].point.y;
    return y;
}

// ---- GAME LOOP ----
const TICK_RATE = 50;
setInterval(() => {
    const dt = TICK_RATE / 1000;

    // Elevators
    elevators.forEach(e => {
        e.y += e.speed * e.direction * dt;
        if (e.y >= e.maxY) { e.y = e.maxY; e.direction = -1; }
        if (e.y <= e.minY) { e.y = e.minY; e.direction = 1; }
        e.mesh.position.y = e.y;
        e.mesh.updateMatrixWorld();
    });

    if (globalPhase === 'ALERT') {
        globalPhaseTimer -= dt;
        guards.forEach(g => {
            if (g.state !== 'STUNNED') {
                let closestDist = Infinity; let closestPlayer = null;
                for (const pid in players) {
                    const p = players[pid]; if (p.isDead) continue;
                    const dist = Math.sqrt((p.x-g.x)**2 + (p.y-g.y)**2 + (p.z-g.z)**2);
                    if (dist < closestDist) { closestDist = dist; closestPlayer = p; }
                }
                if (closestPlayer && closestDist < 60) {
                    g.state = 'ALERT';
                    g.targetPos = { x: closestPlayer.x, y: closestPlayer.y, z: closestPlayer.z };
                }
            }
        });

        if (globalPhaseTimer <= 0) {
            globalPhase = 'EVASION'; globalPhaseTimer = 10;
            io.emit('phaseChange', globalPhase);
        }
    } else if (globalPhase === 'EVASION') {
        globalPhaseTimer -= dt;
        if (globalPhaseTimer <= 0) {
            globalPhase = 'NORMAL';
            guards.forEach(g => { if(g.state !== 'STUNNED') g.state = 'NORMAL'; });
            io.emit('phaseChange', globalPhase);
        }
    }

    cameras.forEach(c => {
        c.time += dt; c.rotation = c.baseRotation + Math.sin(c.time * c.sweepSpeed) * c.sweepAngle;
    });

    for (const pid in players) {
        const p = players[pid]; if (p.isDead) continue;
        for (const c of cameras) { if (checkSight(c, p)) triggerAlert(p); }
    }

    guards.forEach(g => {
        if (g.state === 'STUNNED') {
            g.stunTimer -= dt;
            if (g.stunTimer <= 0) {
                g.state = 'EVASION'; 
                triggerAlert({x: g.x, y: g.y, z: g.z});
            }
            return;
        }

        let spottedPlayer = null;
        for (const pid in players) {
            const p = players[pid]; if (p.isDead) continue;
            if (checkSight(g, p)) { spottedPlayer = { id: pid, ...p }; break; }
        }

        if (spottedPlayer) {
            if (g.state !== 'ALERT') triggerAlert(spottedPlayer);
            g.targetPos = { x: spottedPlayer.x, y: spottedPlayer.y, z: spottedPlayer.z };
            globalPhaseTimer = 10; 
            
            g.rotation = Math.atan2(spottedPlayer.x - g.x, spottedPlayer.z - g.z) + Math.PI;
            g.shootTimer -= dt;
            if (g.shootTimer <= 0) {
                g.shootTimer = 3.0; // INCREASED SHOOT TIMER (3 seconds between shots)
                io.emit('shoot', { from: {x: g.x, y: g.y+1.5, z: g.z}, to: {x: spottedPlayer.x, y: spottedPlayer.y+1.0, z: spottedPlayer.z} });
                if (players[spottedPlayer.id]) {
                    players[spottedPlayer.id].hp -= 10; // REDUCED DAMAGE (takes 10 hits to die)
                    if (players[spottedPlayer.id].hp <= 0) {
                        players[spottedPlayer.id].isDead = true;
                        io.to(spottedPlayer.id).emit('gameOver');
                        setTimeout(() => {
                            if(players[spottedPlayer.id]) {
                                players[spottedPlayer.id].hp = 100; players[spottedPlayer.id].isDead = false;
                                players[spottedPlayer.id].x = START_POS.x; players[spottedPlayer.id].y = START_POS.y; players[spottedPlayer.id].z = START_POS.z;
                                io.to(spottedPlayer.id).emit('respawn', START_POS); io.emit('hpUpdate', { id: spottedPlayer.id, hp: 100 });
                            }
                        }, 3000);
                    }
                    io.emit('hpUpdate', { id: spottedPlayer.id, hp: players[spottedPlayer.id].hp });
                }
            }
            const dx = spottedPlayer.x - g.x; const dz = spottedPlayer.z - g.z; const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist > 5 && dist < 30) {
                g.x += (dx / dist) * g.speed * dt; g.z += (dz / dist) * g.speed * dt; g.y = getFloorHeight(g.x, g.y, g.z);
            }
        } else {
            // Give player a reaction time: guards take 1.5 seconds to lock on before shooting again
            g.shootTimer = 1.5; 
            
            if (g.state === 'ALERT' || g.state === 'EVASION') {
                if (g.targetPos) {
                    const dx = g.targetPos.x - g.x; const dz = g.targetPos.z - g.z; const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist > 1.0) {
                        g.x += (dx / dist) * g.speed * dt; g.z += (dz / dist) * g.speed * dt; g.y = getFloorHeight(g.x, g.y, g.z);
                        g.rotation = Math.atan2(dx, dz) + Math.PI;
                    } else { g.rotation += dt; }
                }
            } else {
                const target = g.path[g.pathIndex];
                const dx = target.x - g.x; const dz = target.z - g.z; const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < 0.5) {
                    g.pathIndex = (g.pathIndex + 1) % g.path.length;
                } else {
                    g.x += (dx / dist) * g.speed * dt; g.z += (dz / dist) * g.speed * dt; g.y = getFloorHeight(g.x, g.y, g.z);
                    g.rotation = Math.atan2(dx, dz) + Math.PI;
                }
            }
        }
    });

    for (const pid in players) {
        const p = players[pid]; if (p.isDead) continue;
        const dx = p.x - GOAL_POS.x; const dy = p.y - GOAL_POS.y; const dz = p.z - GOAL_POS.z;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < GOAL_POS.radius) {
            io.to(pid).emit('gameWin');
            p.x = START_POS.x; p.y = START_POS.y; p.z = START_POS.z; p.hp = 100;
            io.to(pid).emit('respawn', START_POS); io.emit('hpUpdate', { id: pid, hp: 100 });
        }
    }

    io.emit('syncState', { guards, players, cameras, globalPhaseTimer, elevators: elevators.map(e => ({id: e.id, y: e.y})) });

}, TICK_RATE);

// ---- SOCKET LOGIC ----
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    players[socket.id] = { x: START_POS.x, y: START_POS.y, z: START_POS.z, rotation: 0, hp: 100, isDead: false };

    socket.emit('init', { mapData, guards, cameras, players, startPos: START_POS, goalPos: GOAL_POS, globalPhase, elevators });
    socket.broadcast.emit('playerJoin', { id: socket.id, player: players[socket.id] });

    socket.on('updatePlayer', (data) => {
        if (players[socket.id] && !players[socket.id].isDead) {
            players[socket.id].x = data.x; players[socket.id].y = data.y; players[socket.id].z = data.z; players[socket.id].rotation = data.rotation;
        }
    });

    socket.on('cqcAttack', () => {
        const p = players[socket.id]; if (!p || p.isDead) return;
        guards.forEach(g => {
            if (g.state !== 'STUNNED') {
                const dx = g.x - p.x; const dy = g.y - p.y; const dz = g.z - p.z;
                if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 3.0) {
                    g.state = 'STUNNED'; g.stunTimer = 5.0; io.emit('guardStunned', g.id);
                }
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id]; io.emit('playerLeave', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
