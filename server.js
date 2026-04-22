const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Configurações para manter a conexão viva em redes oscilantes (4G/Wi-Fi distante)
    pingTimeout: 60000,
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
    console.log(`Novo dispositivo conectado: ${socket.id}`);

    socket.on('joinRoom', ({ roomId, username }) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const cleanName = username.trim();
        
        socket.join(cleanRoom);

        if (!rooms[cleanRoom]) {
            rooms[cleanRoom] = { 
                players: [], 
                gameStarted: false, 
                hostId: socket.id, 
                currentSpies: [],
                currentLocation: ""
            };
        }

        // Remove o jogador se ele já existia (evita duplicados ao reconectar)
        rooms[cleanRoom].players = rooms[cleanRoom].players.filter(p => p.username !== cleanName);
        
        // Adiciona o novo socket
        rooms[cleanRoom].players.push({ id: socket.id, username: cleanName });

        // Se o Host saiu ou não existe mais, promove o atual
        const hostExists = rooms[cleanRoom].players.some(p => p.id === rooms[cleanRoom].hostId);
        if (!hostExists) {
            rooms[cleanRoom].hostId = socket.id;
        }

        // Notifica todos na sala sobre a nova lista
        io.to(cleanRoom).emit('updatePlayers', {
            players: rooms[cleanRoom].players,
            hostId: rooms[cleanRoom].hostId
        });
        
        // Envia sinal privado se ele for o líder
        if (rooms[cleanRoom].hostId === socket.id) {
            socket.emit('setHost', true);
        }
    });

    socket.on('startGame', ({ roomId, spyCount }) => {
        const cleanRoom = roomId.toLowerCase().trim();
        const room = rooms[cleanRoom];

        if (room && socket.id === room.hostId && room.players.length >= 3) {
            // Sorteio do Local
            let available = LOCATIONS.filter(loc => !usedLocations.includes(loc));
            if (available.length === 0) { usedLocations = []; available = LOCATIONS; }
            const location = available[Math.floor(Math.random() * available.length)];
            usedLocations.push(location);
            room.currentLocation = location;

            // Sorteio dos Espiões
            let indices = Array.from({length: room.players.length}, (_, i) => i);
            let spyIndices = [];
            let maxSpies = Math.min(spyCount, room.players.length - 1);
            
            for(let i = 0; i < maxSpies; i++) {
                let randIndex = Math.floor(Math.random() * indices.length);
                spyIndices.push(indices.splice(randIndex, 1)[0]);
            }

            room.currentSpies = spyIndices.map(i => room.players[i].username);
            room.gameStarted = true;

            // Envia as funções individualmente
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
            const spyNames = room.currentSpies.join(" e ");
            room.gameStarted = false;
            io.to(cleanRoom).emit('backToLobby', spyNames);
        }
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            const playerIndex = rooms[r].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                rooms[r].players.splice(playerIndex, 1);
                
                if (rooms[r].players.length === 0) {
                    delete rooms[r];
                } else {
                    // Se o líder saiu, passa a coroa para o próximo
                    if (rooms[r].hostId === socket.id) {
                        rooms[r].hostId = rooms[r].players[0].id;
                        io.to(rooms[r].hostId).emit('setHost', true);
                    }
                    io.to(r).emit('updatePlayers', { 
                        players: rooms[r].players, 
                        hostId: rooms[r].hostId 
                    });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Servidor Spyfall Rodando na porta ${PORT}`);
    console.log(`HelpCell & SPM Estruturas`);
    console.log(`=================================`);
});
