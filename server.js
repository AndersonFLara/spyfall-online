const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, username }) => {
        // Normaliza o ID da sala (tudo minúsculo e sem espaços)
        const cleanRoom = roomId.toLowerCase().trim();
        socket.join(cleanRoom);

        if (!rooms[cleanRoom]) {
            rooms[cleanRoom] = { players: [], gameStarted: false, hostId: socket.id, currentSpies: [] };
        }

        // Evita duplicados e associa o socket atual ao nome
        rooms[cleanRoom].players = rooms[cleanRoom].players.filter(p => p.username !== username);
        rooms[cleanRoom].players.push({ id: socket.id, username });

        // Garante que o hostId seja válido
        if (!rooms[cleanRoom].players.find(p => p.id === rooms[cleanRoom].hostId)) {
            rooms[cleanRoom].hostId = socket.id;
        }

        // Atualiza TODO MUNDO na sala imediatamente
        io.to(cleanRoom).emit('updatePlayers', {
            players: rooms[cleanRoom].players,
            hostId: rooms[cleanRoom].hostId
        });
        
        if (rooms[cleanRoom].hostId === socket.id) socket.emit('setHost', true);
    });

    socket.on('startGame', ({ roomId, spyCount }) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const room = rooms[cleanRoom];
        // Lógica de sorteio de espiões (mantida conforme as regras anteriores)
        if (room && socket.id === room.hostId && room.players.length >= 3) {
            // ... (restante da lógica de sorteio enviada antes)
        }
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            const index = rooms[r].players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                rooms[r].players.splice(index, 1);
                if (rooms[r].players.length === 0) {
                    delete rooms[r];
                } else {
                    if (rooms[r].hostId === socket.id) rooms[r].hostId = rooms[r].players[0].id;
                    io.to(r).emit('updatePlayers', { players: rooms[r].players, hostId: rooms[r].hostId });
                    io.to(rooms[r].hostId).emit('setHost', true);
                }
            }
        }
    });
});

server.listen(process.env.PORT || 3000);
