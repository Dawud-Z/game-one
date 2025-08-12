const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

<<<<<<< HEAD
// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
    players: {},
    bullets: {},
    leaderboard: []
};

const WORLD_SIZE = { width: 3000, height: 3000 };
const PLAYER_SPEED = 200; // pixels per second
const BULLET_SPEED = 400;
const BULLET_DAMAGE = 25;
const PLAYER_MAX_HEALTH = 100;

class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name || `Player${Math.floor(Math.random() * 1000)}`;
        this.x = Math.random() * WORLD_SIZE.width;
        this.y = Math.random() * WORLD_SIZE.height;
        this.rotation = 0;
        this.health = PLAYER_MAX_HEALTH;
        this.maxHealth = PLAYER_MAX_HEALTH;
        this.score = 0;
        this.lastShot = 0;
        this.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    }

    update(input, deltaTime) {
        // Movement
        let vx = 0, vy = 0;
        if (input.up) vy -= PLAYER_SPEED;
        if (input.down) vy += PLAYER_SPEED;
        if (input.left) vx -= PLAYER_SPEED;
        if (input.right) vx += PLAYER_SPEED;

        // Apply movement
        this.x += vx * deltaTime;
        this.y += vy * deltaTime;

        // Keep player in bounds
        this.x = Math.max(25, Math.min(WORLD_SIZE.width - 25, this.x));
        this.y = Math.max(25, Math.min(WORLD_SIZE.height - 25, this.y));

        // Rotation towards mouse
        if (input.mouseX !== undefined && input.mouseY !== undefined) {
            this.rotation = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);
        }

        // Shooting
        if (input.shooting && Date.now() - this.lastShot > 200) { // 200ms cooldown
            this.shoot();
            this.lastShot = Date.now();
        }
    }

    shoot() {
        const bulletId = `bullet_${this.id}_${Date.now()}`;
        const bullet = new Bullet(
            bulletId,
            this.x + Math.cos(this.rotation) * 30,
            this.y + Math.sin(this.rotation) * 30,
            Math.cos(this.rotation) * BULLET_SPEED,
            Math.sin(this.rotation) * BULLET_SPEED,
            this.id
        );
        gameState.bullets[bulletId] = bullet;
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }

    respawn() {
        this.x = Math.random() * WORLD_SIZE.width;
        this.y = Math.random() * WORLD_SIZE.height;
        this.health = PLAYER_MAX_HEALTH;
    }
}

class Bullet {
    constructor(id, x, y, vx, vy, playerId) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.playerId = playerId;
        this.createdAt = Date.now();
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Remove if out of bounds or too old
        return this.x < 0 || this.x > WORLD_SIZE.width || 
               this.y < 0 || this.y > WORLD_SIZE.height ||
               Date.now() - this.createdAt > 3000;
    }
}

function checkCollisions() {
    for (const [bulletId, bullet] of Object.entries(gameState.bullets)) {
        for (const [playerId, player] of Object.entries(gameState.players)) {
            if (bullet.playerId === playerId || player.health <= 0) continue;

            const dx = bullet.x - player.x;
            const dy = bullet.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 25) { // Player radius
                const killed = player.takeDamage(BULLET_DAMAGE);
                delete gameState.bullets[bulletId];

                if (killed) {
                    const killer = gameState.players[bullet.playerId];
                    if (killer) {
                        killer.score += 100;
                        io.emit('playerKilled', {
                            killer: killer.name,
                            victim: player.name
                        });
                    }
                }

                io.emit('playerUpdate', player);
                break;
            }
        }
    }
}

function updateLeaderboard() {
    const players = Object.values(gameState.players);
    gameState.leaderboard = players
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(p => ({ name: p.name, score: p.score }));
    
    io.emit('leaderboard', gameState.leaderboard);
}

// Game loop
let lastTime = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    // Update bullets
    for (const [bulletId, bullet] of Object.entries(gameState.bullets)) {
        if (bullet.update(deltaTime)) {
            delete gameState.bullets[bulletId];
        }
    }

    // Check collisions
    checkCollisions();

    // Update leaderboard every 5 seconds
    if (now % 5000 < 100) {
        updateLeaderboard();
    }

    // Send bullet updates
    io.emit('bulletUpdate', gameState.bullets);
}, 1000 / 60); // 60 FPS

// Socket handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create new player
    const player = new Player(socket.id);
    gameState.players[socket.id] = player;

    // Send initial game state
    socket.emit('gameState', {
        players: gameState.players,
        bullets: gameState.bullets
    });

    // Notify other players
    socket.broadcast.emit('playerJoined', player);

    // Handle player input
    socket.on('playerInput', (input) => {
        const player = gameState.players[socket.id];
        if (player && player.health > 0) {
            player.update(input, 1/60); // Assume 60 FPS
            io.emit('playerUpdate', player);
        }
    });

    // Handle respawn
    socket.on('respawn', () => {
        const player = gameState.players[socket.id];
        if (player) {
            player.respawn();
            io.emit('playerUpdate', player);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete gameState.players[socket.id];
        socket.broadcast.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
=======
// [rest of the server code I provided earlier]
>>>>>>> aae029a368cf46f5c9d4f40139a8238da0c2922c
