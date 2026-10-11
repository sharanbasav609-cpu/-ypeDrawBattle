const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '')));

const PORT = process.env.PORT || 3000;
const rooms = {};

const TF_SENTENCES = {
    easy: ["The quick brown fox jumps.", "A fast fighter strikes with power.", "Block the punch and counter kick."],
    medium: ["In battle, only the fastest typist will survive the onslaught.", "Defend yourself by maintaining high accuracy and speed.", "A true warrior knows patience is better than blind fury."],
    hard: ["The legendary grandmaster moves like a shadow, striking before they blink.", "Concentration is key; let your fingers fly across the keyboard.", "Devastating combos require perfect execution and fighting spirit."]
};
const DG_WORDS = ['Lion', 'Elephant', 'Giraffe', 'Penguin', 'Kangaroo', 'Apple', 'Banana', 'Watermelon', 'Strawberry', 'Pineapple', 'Tree', 'Mountain', 'Cloud', 'River', 'Volcano', 'Clock', 'Telephone', 'Bicycle', 'Umbrella', 'Glasses'];

io.on('connection', (socket) => {
    socket.on('create_room', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = { id: roomId, players: [{ id: socket.id, name: playerName || 'Player 1', role: 'p1', isReady: false }], mode: 'lobby', intervals: [] };
        socket.join(roomId); socket.emit('room_created', { roomId, role: 'p1' });
        io.to(roomId).emit('room_update', rooms[roomId].players);
    });

    socket.on('join_room', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, name: data.playerName || 'Player 2', role: 'p2', isReady: false });
            socket.join(data.roomId); socket.emit('room_joined', { roomId: data.roomId, role: 'p2' });
            io.to(data.roomId).emit('room_update', room.players);
        } else socket.emit('error_msg', 'Room full or not found');
    });

    socket.on('tf_start', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        
        if (!room.tfScore) room.tfScore = { p1: 0, p2: 0 };
        
        const list = TF_SENTENCES[data.difficulty] || TF_SENTENCES.medium;
        room.mode = 'tf';
        room.intervals.forEach(clearInterval); // Stop existing timers!
        room.intervals = [];
        room.tfState = {
            timer: 60, difficulty: data.difficulty,
            sentence: list[Math.floor(Math.random() * list.length)],
            p1: { health: 100, attacks: 0, wpm: 0, acc: 100, progress: 0, lastKey: 0, combo: 0, lastAtkTime: 0 },
            p2: { health: 100, attacks: 0, wpm: 0, acc: 100, progress: 0, lastKey: 0, combo: 0, lastAtkTime: 0 }
        };
        io.to(data.roomId).emit('tf_init', { state: room.tfState, score: room.tfScore });

        const t = setInterval(() => {
            room.tfState.timer--;
            io.to(data.roomId).emit('tf_tick', room.tfState.timer);
            if (room.tfState.timer <= 0) {
                clearInterval(t);
                let w = 'tie', s1 = room.tfState.p1, s2 = room.tfState.p2;
                if (s1.progress > s2.progress) w = 'p1';
                else if (s2.progress > s1.progress) w = 'p2';
                else { if (s1.acc > s2.acc) w = 'p1'; else if (s2.acc > s1.acc) w = 'p2'; }
                if (w !== 'tie') room.tfScore[w]++;
                io.to(data.roomId).emit('tf_end', { winner: w, reason: 'timeout', state: room.tfState, score: room.tfScore });
            }
        }, 1000);
        room.intervals.push(t);
    });

    socket.on('tf_type_update', (data) => {
        const { roomId, role, typedText, stats } = data;
        const room = rooms[roomId];
        if (!room || room.mode !== 'tf' || room.tfState.timer <= 0) return;

        const state = room.tfState;
        const player = state[role], oppRole = role === 'p1' ? 'p2' : 'p1', opp = state[oppRole];

        let validLen = 0;
        for (let i = 0; i < typedText.length; i++) {
            if (typedText[i] === state.sentence[i]) validLen++; else break;
        }

        const oldProg = player.progress;
        if (validLen > oldProg && validLen === typedText.length) {
            let addedProgress = validLen - oldProg;
            if (addedProgress > 5) addedProgress = 5; // Anti-cheat cap per update
            validLen = oldProg + addedProgress;

            player.progress = validLen; 
            player.lastKey = Date.now();
            player.wpm = stats.wpm; 
            player.acc = stats.acc;

            for (let i = 0; i < addedProgress; i++) {
                player.attacks++;
                const now = Date.now();
                if (now - player.lastAtkTime < 1500) player.combo++; else player.combo = 1;
                player.lastAtkTime = now;

                const attackTypes = ['punch', 'stick', 'backhit'];
                const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];

                const timeSinceOpp = now - opp.lastKey;
                let defType = 'hit', dmg = 1; 

                if (timeSinceOpp < 2000) {
                    const r = Math.random();
                    if (r < 0.4) defType = 'block'; 
                    else if (r < 0.55) defType = 'dodge';
                }

                if (defType === 'block') {
                    dmg = 0.5; // Reduced damage
                    
                    // Counterattack chance!
                    if (Math.random() < 0.3) {
                        setTimeout(() => {
                            if (!rooms[roomId] || rooms[roomId].tfState.timer <= 0) return;
                            const counterDmg = 2;
                            player.health = Math.max(0, player.health - counterDmg);
                            io.to(roomId).emit('tf_event', {
                                attacker: oppRole,
                                defender: role,
                                attackType: 'punch',
                                defType: 'hit',
                                damage: counterDmg,
                                comicText: 'COUNTER!',
                                msg: `P${oppRole === 'p1'?1:2} COUNTERATTACKED!`
                            });
                            io.to(roomId).emit('tf_update', room.tfState);
                        }, 300);
                    }
                }
                else if (defType === 'dodge') dmg = 0; 
                else {
                    if (Math.random() < 0.2) defType = 'knockback'; else defType = 'stumble';
                    if (player.combo >= 5 && player.combo % 5 === 0) dmg += 2; // Combo Bonus
                }

                opp.health = Math.max(0, opp.health - dmg);

                let comicText = '';
                if (defType === 'block') comicText = 'BLOCK!';
                else if (defType === 'dodge') comicText = 'MISS!';
                else comicText = (player.combo >= 5 && player.combo % 5 === 0) ? 'COMBO!' : (attackType === 'stick' ? 'WHACK!' : 'BONK!');

                const msg = (defType === 'block' || defType === 'dodge') ? `P${oppRole === 'p1'?1:2} ${defType.toUpperCase()}ED!` : `P${role === 'p1'?1:2} hit with ${attackType.toUpperCase()}!`;

                io.to(roomId).emit('tf_event', { attacker: role, defender: oppRole, attackType, defType, damage: dmg, comicText, msg });
            }

            if (player.progress === state.sentence.length) {
                room.intervals.forEach(clearInterval);
                room.tfScore[role]++;
                io.to(roomId).emit('tf_end', { winner: role, reason: 'completed', state: state, score: room.tfScore });
                return;
            }
            io.to(roomId).emit('tf_update', state);
        }
    });

    socket.on('dg_setup', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        room.mode = 'dg';
        if (!room.dgState) room.dgState = { scores: { p1: 0, p2: 0 } };
        
        const drawerRole = Math.random() > 0.5 ? 'p1' : 'p2';
        const shuffled = [...DG_WORDS].sort(() => 0.5 - Math.random());
        const choices = shuffled.slice(0, 5);
        
        io.to(roomId).emit('dg_setup_init', { drawerRole, choices });
    });

    socket.on('dg_word_selected', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        
        room.dgState.word = data.word;
        room.dgState.timer = 60;
        room.intervals.forEach(clearInterval);
        room.intervals = [];
        
        const drawer = room.players.find(p => p.id === socket.id);
        const drawerRole = drawer ? drawer.role : 'p1';
        
        io.to(data.roomId).emit('dg_play_start', { drawerRole });
        
        const t = setInterval(() => {
            room.dgState.timer--;
            io.to(data.roomId).emit('dg_tick', room.dgState.timer);
            if (room.dgState.timer <= 0) {
                clearInterval(t);
                io.to(data.roomId).emit('dg_end', { won: false, word: room.dgState.word, scores: room.dgState.scores });
            }
        }, 1000);
        room.intervals.push(t);
    });

    socket.on('dg_draw', (data) => socket.to(data.roomId).emit('dg_draw', data.drawData));
    socket.on('dg_clear', (roomId) => socket.to(roomId).emit('dg_clear'));

    socket.on('dg_guess', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.mode !== 'dg' || room.dgState.timer <= 0) return;
        
        const guess = data.guess.trim().toLowerCase();
        const actual = room.dgState.word.toLowerCase();
        
        if (guess === actual) {
            room.intervals.forEach(clearInterval);
            const drawerRole = data.role === 'p1' ? 'p2' : 'p1';
            
            room.dgState.scores[data.role] += 5;
            room.dgState.scores[drawerRole] += 2.5;
            
            io.to(data.roomId).emit('dg_end', {
                won: true, 
                word: room.dgState.word, 
                winnerRole: data.role,
                scores: room.dgState.scores
            });
        } else {
            socket.emit('dg_guess_feedback');
        }
    });

    socket.on('player_ready', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            const p = room.players.find(p => p.id === socket.id);
            if (p) {
                p.isReady = true;
                io.to(roomId).emit('room_update', room.players);
            }
        }
    });

    socket.on('webrtc_offer', (data) => socket.to(data.roomId).emit('webrtc_offer', data.sdp));
    socket.on('webrtc_answer', (data) => socket.to(data.roomId).emit('webrtc_answer', data.sdp));
    socket.on('webrtc_ice', (data) => socket.to(data.roomId).emit('webrtc_ice', data.ice));
    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            const room = rooms[roomId];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                socket.to(roomId).emit('opponent_disconnected');
                room.intervals.forEach(clearInterval);
                delete rooms[roomId];
                break;
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
