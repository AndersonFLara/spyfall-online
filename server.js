const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    // Configurações para manter a conexão viva mesmo com tela apagada por um tempo
    pingTimeout: 180000, 
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const LOCATIONS = [
    "Avião", "Banco", "Catedral", "Circo", "Hospital", "Hotel", "Submarino", "Estação Espacial", "Base Militar", "Cassino",
    "Embaixada", "Restaurante", "Teatro", "Universidade", "Escola", "Zoológico", "Delegacia", "Estação de Trem", "Porto", "Aeroporto",
    "Biblioteca", "Museu", "Cinema", "Shopping", "Supermercado", "Academia", "Estádio de Futebol", "Parque de Diversões", "Praia", "Navio Pirata",
    "Castelo Medieval", "Trincheira de Guerra", "Subterrâneo", "Mina de Ouro", "Plataforma de Petróleo", "Laboratório", "Oficina Mecânica", "Fazenda", "Santuário", "Templo Budista",
    "Vaticano", "Casa Branca", "Torre Eiffel", "Pirâmides do Egito", "Coliseu", "Estação Científica na Antártida", "Base Lunar", "Ônibus Espacial", "Fábrica de Chocolate", "Cemitério",
    "Funerária", "Tribunal de Justiça", "Prisão", "Acampamento", "Festival de Música", "Estúdio de TV", "Redação de Jornal", "Agência de Modelos", "Pizzaria", "Sorveteria",
    "Barbearia", "Pet Shop", "Clínica Veterinária", "Floricultura", "Joalheria", "Banco de Sangue", "Central de Monitoramento", "Data Center", "Usina Nuclear", "Hidrelétrica",
    "Bunker Subterrâneo", "Silo de Mísseis", "Escritório de Advocacia", "Consultório Odontológico", "Berçário", "Lar de Idosos", "Concessionária", "Estacionamento", "Lavanderia", "Costureira",
    "Ferro Velho", "Horta Comunitária", "Vinícola", "Cervejaria", "Destilaria", "Refinaria", "Telescópio Espacial", "Aquário Municipal", "Planetário", "Feira Livre",
    "Centro de Convenções", "Palácio Real", "Aldeia Indígena", "Iglu no Ártico", "Oásis no Deserto", "Taverna de RPG", "Quartel de Bombeiros", "Posto de Gasolina", "Pedágio", "Torre de Controle"
];

let usedLocations = [];

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, username }) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const cleanName = username.trim();
        socket.join(cleanRoom);

        if (!rooms[cleanRoom]) {
            rooms[cleanRoom] = { players: [], gameStarted: false, hostId: socket.id, currentSpies: [] };
        }

        // Limpa duplicados e atualiza o socket ID do jogador
        rooms[cleanRoom].players = rooms[cleanRoom].players.filter(p => p.username !== cleanName);
        rooms[cleanRoom].players.push({ id: socket.id, username: cleanName });

        // Garante que a sala sempre tenha um Líder ativo
        const hostExists = rooms[cleanRoom].players.some(p => p.id === rooms[cleanRoom].hostId);
        if (!hostExists) rooms[cleanRoom].hostId = socket.id;

        io.to(cleanRoom).emit('updatePlayers', {
            players: rooms[cleanRoom].players,
            hostId: rooms[cleanRoom].hostId
        });
        
        if (rooms[cleanRoom].hostId === socket.id) socket.emit('setHost', true);
    });

    socket.on('startGame', ({ roomId, spyCount }) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const room = rooms[cleanRoom];
        if (room && socket.id === room.hostId && room.players.length >= 3) {
            let available = LOCATIONS.filter(loc => !usedLocations.includes(loc));
            if (available.length === 0) { usedLocations = []; available = LOCATIONS; }
            const location = available[Math.floor(Math.random() * available.length)];
            usedLocations.push(location);
            
            let indices = Array.from({length: room.players.length}, (_, i) => i);
            let spyIndices = [];
            let countToSelect = Math.min(spyCount, room.players.length - 1);
            
            for(let i = 0; i < countToSelect; i++) {
                let randIndex = Math.floor(Math.random() * indices.length);
                spyIndices.push(indices.splice(randIndex, 1)[0]);
            }

            room.currentSpies = spyIndices.map(i => room.players[i].username);
            room.gameStarted = true;

            room.players.forEach((player, index) => {
                const isSpy = spyIndices.includes(index);
                io.to(player.id).emit('receiveRole', {
                    role: isSpy ? "🕵️ VOCÊ É O ESPIÃO!" : `📍 LOCAL: ${location}`,
                    isSpy: isSpy,
                    allLocations: LOCATIONS,
                    used: usedLocations
                });
            });
        }
    });

    socket.on('endGame', (roomId) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const room = rooms[cleanRoom];
        if (room && socket.id === room.hostId) {
            io.to(cleanRoom).emit('backToLobby', room.currentSpies.join(" e "));
            room.gameStarted = false;
        }
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            rooms[r].players = rooms[r].players.filter(p => p.id !== socket.id);
            if (rooms[r].players.length === 0) {
                delete rooms[r];
            } else {
                if (rooms[r].hostId === socket.id) {
                    rooms[r].hostId = rooms[r].players[0].id;
                    io.to(rooms[r].hostId).emit('setHost', true);
                }
                io.to(r).emit('updatePlayers', { players: rooms[r].players, hostId: rooms[r].hostId });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
