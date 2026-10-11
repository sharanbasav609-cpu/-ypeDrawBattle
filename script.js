const socket = io();

const SoundFX = {
    ctx: null,
    masterGain: null,
    compressor: null,
    enabled: true,
    volume: 0.5,
    lastPlay: {},
    
    init() {
        const audioBtn = document.getElementById('audio-btn');
        const volSlider = document.getElementById('volume-slider');
        if (audioBtn) {
            audioBtn.onclick = () => {
                this.enabled = !this.enabled;
                audioBtn.innerHTML = this.enabled ? '🔊 ON' : '🔇 OFF';
                audioBtn.style.background = this.enabled ? '#00ff88' : '#ff3366';
                if (this.enabled) this.initCtx();
            };
        }
        if (volSlider) {
            volSlider.oninput = (e) => { 
                this.volume = e.target.value / 100; 
                if (this.masterGain) this.masterGain.gain.value = this.volume;
            };
        }
    },
    
    initCtx() {
        if (!this.enabled) return;
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-20, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
            
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    play(type) {
        if (!this.enabled || !this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        
        // Throttle rapid repeated sounds (max 1 of same type per 50ms) to prevent overlapping clipping
        if (this.lastPlay[type] && now - this.lastPlay[type] < 0.05) return;
        this.lastPlay[type] = now;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.compressor);
        
        switch(type) {
            case 'whoosh':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.8, now + 0.05);
                gain.gain.linearRampToValueAtTime(0, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
                break;
            case 'bonk':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
                gain.gain.setValueAtTime(1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
                break;
            case 'clink':
                osc.type = 'square';
                osc.frequency.setValueAtTime(900, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
                break;
            case 'swish':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
                break;
            case 'boing':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(350, now + 0.1);
                osc.frequency.linearRampToValueAtTime(250, now + 0.25);
                gain.gain.setValueAtTime(0.8, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc.start(now); osc.stop(now + 0.25);
                break;
            case 'combo':
                [0, 0.05, 0.1, 0.15].forEach((delay, i) => {
                    const o = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    o.connect(g); g.connect(this.compressor);
                    o.type = 'square';
                    o.frequency.setValueAtTime(400 + (i * 200), now + delay);
                    g.gain.setValueAtTime(0.3, now + delay);
                    g.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.1);
                    o.start(now + delay); o.stop(now + delay + 0.1);
                });
                break;
            case 'win':
                [440, 554, 659, 880].forEach((freq, i) => {
                    const o = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    o.connect(g); g.connect(this.compressor);
                    o.type = 'triangle';
                    const delay = i * 0.15;
                    o.frequency.setValueAtTime(freq, now + delay);
                    g.gain.setValueAtTime(0.6, now + delay);
                    g.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.6);
                    o.start(now + delay); o.stop(now + delay + 0.6);
                });
                break;
        }
    }
};

const App = {
    currentScreen: 'home-screen',
    myRole: null, roomId: null, playerName: '', opponentName: '',
    localStream: null, peerConnection: null,
    rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    
    init() {
        SoundFX.init();

        socket.on('room_created', data => { this.roomId = data.roomId; this.myRole = data.role; this.updateLobby(); });
        socket.on('room_joined', data => { this.roomId = data.roomId; this.myRole = data.role; this.updateLobby(); });
        socket.on('room_update', players => {
            const list = document.getElementById('players-list');
            list.innerHTML = '';
            let allReady = true;
            players.forEach(p => {
                list.innerHTML += `<div style="font-size:1.2rem;">👤 ${p.name} ${p.role === this.myRole ? '(You)' : ''} - <span style="color:${p.isReady ? '#00ff88' : '#ff3366'}">${p.isReady ? 'READY' : 'NOT READY'}</span></div>`;
                if (p.role !== this.myRole) this.opponentName = p.name;
                if (!p.isReady) allReady = false;
            });
            if (players.length === 2) {
                const btn = document.getElementById('ready-btn');
                btn.classList.remove('hidden');
                
                if (allReady) {
                    document.getElementById('room-status').innerHTML = "Both players ready!";
                    document.getElementById('room-status').style.color = "#00ff88";
                    btn.classList.add('hidden');
                    if (this.myRole === 'p1') document.getElementById('mode-selection').classList.remove('hidden');
                } else {
                    document.getElementById('room-status').innerHTML = "Waiting for players to ready up...";
                    document.getElementById('room-status').style.color = "#ffd700";
                    document.getElementById('mode-selection').classList.add('hidden');
                }
                
                if (this.localStream) this.initWebRTC();
            }
        });
        socket.on('error_msg', msg => document.getElementById('lobby-error').textContent = msg);
        socket.on('opponent_disconnected', () => { alert("Opponent disconnected!"); window.location.reload(); });

        document.getElementById('create-room-btn').onclick = () => {
            SoundFX.initCtx(); // initialize audio context on user gesture
            this.playerName = document.getElementById('player-name-input').value.trim() || 'Player 1';
            socket.emit('create_room', this.playerName);
        };
        document.getElementById('join-room-btn').onclick = () => {
            SoundFX.initCtx(); // initialize audio context on user gesture
            const code = document.getElementById('room-code-input').value.trim().toUpperCase();
            this.playerName = document.getElementById('player-name-input').value.trim() || 'Player 2';
            if (code) socket.emit('join_room', { roomId: code, playerName: this.playerName });
        };
        
        document.getElementById('ready-btn').onclick = () => {
            document.getElementById('ready-btn').disabled = true;
            document.getElementById('ready-btn').textContent = 'WAITING...';
            socket.emit('player_ready', this.roomId);
        };

        document.querySelectorAll('.back-btn-nav').forEach(btn => btn.onclick = () => window.location.reload());
        document.getElementById('btn-typing-fight').onclick = () => socket.emit('tf_start', { roomId: this.roomId, difficulty: 'medium' });
        document.getElementById('btn-draw-guess').onclick = () => socket.emit('dg_setup', this.roomId);

        const micBtn = document.getElementById('mic-btn');
        micBtn.onclick = async () => {
            if (micBtn.classList.contains('muted')) {
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    micBtn.classList.remove('muted'); micBtn.classList.add('active');
                    micBtn.innerHTML = '🎤 <span class="mic-status">Unmuted</span>';
                    if (this.roomId && this.opponentName) this.initWebRTC();
                } catch (err) { alert("Microphone denied."); }
            } else {
                micBtn.classList.add('muted'); micBtn.classList.remove('active');
                micBtn.innerHTML = '🎤 <span class="mic-status">Muted</span>';
                if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
                if (this.peerConnection) this.peerConnection.close();
            }
        };

        socket.on('webrtc_offer', async (sdp) => {
            if (!this.peerConnection) this.initWebRTC(false);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            socket.emit('webrtc_answer', { roomId: this.roomId, sdp: answer });
        });
        socket.on('webrtc_answer', async (sdp) => await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)));
        socket.on('webrtc_ice', async (ice) => { if (this.peerConnection) await this.peerConnection.addIceCandidate(new RTCIceCandidate(ice)); });

        TypingFight.init(); DrawGuess.init();
    },
    updateLobby() {
        document.getElementById('lobby-controls').classList.add('hidden');
        document.getElementById('room-info').classList.remove('hidden');
        document.getElementById('display-room-code').textContent = this.roomId;
    },
    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        this.currentScreen = id;
    }
    // ... WebRTC setup persists below
};

App.initWebRTC = async function(isOfferer = true) {
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    if (this.localStream) this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));
    this.peerConnection.onicecandidate = e => { if (e.candidate) socket.emit('webrtc_ice', { roomId: this.roomId, ice: e.candidate }); };
    this.peerConnection.ontrack = e => {
        const audio = new Audio(); audio.srcObject = e.streams[0]; audio.play();
        document.getElementById('voice-chat-status').textContent = "Voice Chat Connected!";
        document.getElementById('voice-chat-status').style.color = "#00ff88";
    };
    if (isOfferer && this.myRole === 'p1') {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        socket.emit('webrtc_offer', { roomId: this.roomId, sdp: offer });
    }
}

const TypingFight = {
    stats: { total: 0, correct: 0, wpm: 0, acc: 100 },
    animQueue: [],
    isAnimating: false,
    
    init() {
        this.ui = {
            timer: document.getElementById('tf-timer'), sentence: document.getElementById('tf-sentence-display'),
            p1H: document.getElementById('tf-p1-health'), p2H: document.getElementById('tf-p2-health'),
            p1P: document.getElementById('tf-p1-progress'), p2P: document.getElementById('tf-p2-progress'),
            p1W: document.getElementById('tf-p1-wpm'), p1A: document.getElementById('tf-p1-acc'),
            p2W: document.getElementById('tf-p2-wpm'), p2A: document.getElementById('tf-p2-acc'),
            input: document.getElementById('tf-my-input'), arena: document.getElementById('tf-arena'),
            log: document.getElementById('tf-event-log'), winner: document.getElementById('tf-winner-text')
        };

        const svgTpl = document.getElementById('fighter-svg-template').innerHTML;
        document.getElementById('tf-player1').querySelector('.fighter-inner').innerHTML = svgTpl;
        document.getElementById('tf-player2').querySelector('.fighter-inner').innerHTML = svgTpl;

        socket.on('tf_init', (data) => {
            const state = data.state;
            App.switchScreen('tf-battle-screen');
            document.getElementById('tf-p1-name').textContent = App.myRole === 'p1' ? App.playerName : App.opponentName;
            document.getElementById('tf-p2-name').textContent = App.myRole === 'p2' ? App.playerName : App.opponentName;
            
            this.stats = { total: 0, correct: 0, wpm: 0, acc: 100 };
            this.animQueue = []; this.isAnimating = false;
            this.ui.input.value = ''; this.ui.input.focus(); 
            if(this.ui.log) this.ui.log.innerHTML = '';
            
            this.cleanFighterClasses(document.getElementById('tf-player1'));
            this.cleanFighterClasses(document.getElementById('tf-player2'));

            this.syncState(state);
        });

        socket.on('tf_tick', (t) => this.ui.timer.textContent = t);
        socket.on('tf_update', (state) => this.syncState(state));
        
        socket.on('tf_event', (event) => {
            this.animQueue.push(event);
            if (!this.isAnimating) this.processQueue();
            this.logEvent(event);
        });

        socket.on('tf_end', (data) => this.endGame(data));
        this.ui.input.addEventListener('input', (e) => this.handleInput(e));
    },

    syncState(state) {
        this.state = state;
        this.ui.p1H.style.width = `${state.p1.health}%`; this.ui.p2H.style.width = `${state.p2.health}%`;
        const len = state.sentence.length;
        this.ui.p1P.style.width = `${(state.p1.progress / len) * 100}%`;
        this.ui.p2P.style.width = `${(state.p2.progress / len) * 100}%`;
        this.ui.p1W.textContent = state.p1.wpm; this.ui.p1A.textContent = state.p1.acc;
        this.ui.p2W.textContent = state.p2.wpm; this.ui.p2A.textContent = state.p2.acc;
        this.renderSentence(this.ui.input.value);
    },

    handleInput(e) {
        const typed = this.ui.input.value;
        if (e.inputType === 'insertText' || e.inputType === 'deleteContentBackward') this.stats.total++;
        
        const isCorrect = this.renderSentence(typed);
        if (!isCorrect && typed.length > 0) {
            this.ui.input.classList.add('input-error');
            setTimeout(() => this.ui.input.classList.remove('input-error'), 300);
            
            const myFighter = document.getElementById(App.myRole === 'p1' ? 'tf-player1' : 'tf-player2');
            myFighter.classList.add('face-mistake-active');
            
            SoundFX.play('boing'); // Mistake sound

            setTimeout(() => myFighter.classList.remove('face-mistake-active'), 300);

        } else {
            this.ui.input.classList.remove('input-error');
            if (e.inputType === 'insertText') this.stats.correct++;
        }
        
        if (this.stats.total > 0) this.stats.acc = Math.round((this.stats.correct / this.stats.total) * 100);
        const mins = (60 - this.state.timer) / 60;
        if (mins > 0) this.stats.wpm = Math.round((this.stats.correct / 5) / mins);

        socket.emit('tf_type_update', { roomId: App.roomId, role: App.myRole, typedText: typed, stats: { wpm: this.stats.wpm, acc: this.stats.acc } });
    },

    renderSentence(typed) {
        if (!this.state) return true;
        const sent = this.state.sentence;
        let html = '', isCorrect = true;
        for (let i = 0; i < sent.length; i++) {
            if (i < typed.length) {
                if (typed[i] === sent[i]) html += `<span class="typed-correct">${sent[i]}</span>`;
                else { html += `<span class="typed-wrong">${sent[i]}</span>`; isCorrect = false; }
            } else { html += `<span>${sent[i]}</span>`; }
        }
        this.ui.sentence.innerHTML = html;
        return isCorrect;
    },

    processQueue() {
        if (this.animQueue.length === 0) {
            this.isAnimating = false;
            return;
        }
        this.isAnimating = true;
        
        if (this.animQueue.length > 3) {
            const latest = this.animQueue.pop();
            this.animQueue = [latest]; 
        }
        
        const event = this.animQueue.shift();
        this.triggerAnim(event, () => {
            this.processQueue();
        });
    },

    cleanFighterClasses(element) {
        const classesToRemove = ['atk-punch', 'atk-stick', 'atk-backhit', 'def-block', 'def-dodge', 'def-stumble', 'def-knockback', 'anim-win', 'face-attack-active', 'face-hurt-active', 'face-mistake-active'];
        element.classList.remove(...classesToRemove);
    },

    triggerAnim(event, callback) {
        const aFighter = document.getElementById(event.attacker === 'p1' ? 'tf-player1' : 'tf-player2');
        const dFighter = document.getElementById(event.attacker === 'p1' ? 'tf-player2' : 'tf-player1');
        
        this.cleanFighterClasses(aFighter);
        this.cleanFighterClasses(dFighter);
        
        void aFighter.offsetWidth; 
        void dFighter.offsetWidth; 
        
        aFighter.classList.add(`atk-${event.attackType}`, 'face-attack-active');
        SoundFX.play('whoosh'); // Attack sound
        
        if (event.damage >= 2) {
            this.ui.arena.classList.add('screen-shake');
            setTimeout(() => this.ui.arena.classList.remove('screen-shake'), 150);
        }

        setTimeout(() => {
            aFighter.classList.remove('face-attack-active');
            dFighter.classList.add(`def-${event.defType}`);
            
            // Defend sound logic
            if (event.comicText === 'COMBO!') SoundFX.play('combo');
            else if (event.defType === 'block') SoundFX.play('clink');
            else if (event.defType === 'dodge') SoundFX.play('swish');
            else SoundFX.play('bonk'); // Hit!

            if (event.defType === 'block' || event.defType === 'dodge') {
                dFighter.classList.add('face-mistake-active');
            } else {
                dFighter.classList.add('face-hurt-active');
            }

            if (event.comicText) {
                const comic = document.getElementById(event.attacker === 'p1' ? 'tf-comic-p2' : 'tf-comic-p1');
                comic.textContent = event.comicText;
                comic.classList.remove('comic-anim');
                void comic.offsetWidth;
                comic.classList.add('comic-anim');
            }
            
            setTimeout(() => {
                dFighter.classList.remove('face-hurt-active', 'face-mistake-active');
                if (callback) callback();
            }, 120); 
        }, 100); 
    },

    logEvent(event) {
        if (!this.ui.log) return;
        if (event.defType === 'hit' && event.damage < 2) return; 
        const el = document.createElement('div');
        el.className = 'log-entry';
        el.style.color = (event.defType === 'block' || event.defType === 'dodge') ? '#ffd700' : (event.attacker === 'p1' ? '#00e5ff' : '#ff3366');
        el.textContent = event.msg;
        this.ui.log.appendChild(el);
        if (this.ui.log.children.length > 3) this.ui.log.removeChild(this.ui.log.firstChild);
    },

    endGame(data) {
        const { winner, reason, state, score } = data;
        this.ui.winner.className = '';
        const f1 = document.getElementById('tf-player1');
        const f2 = document.getElementById('tf-player2');
        
        this.cleanFighterClasses(f1);
        this.cleanFighterClasses(f2);
        
        // Clear queue and stop animating immediately
        this.animQueue = [];
        this.isAnimating = false;

        if (winner === 'p1') { 
            this.ui.winner.textContent = 'PLAYER 1 WINS!'; this.ui.winner.classList.add('p1-win'); 
            f1.classList.add('anim-win'); f2.classList.add('face-hurt-active', 'def-knockback');
            SoundFX.play('win');
        } else if (winner === 'p2') { 
            this.ui.winner.textContent = 'PLAYER 2 WINS!'; this.ui.winner.classList.add('p2-win'); 
            f2.classList.add('anim-win'); f1.classList.add('face-hurt-active', 'def-knockback');
            SoundFX.play('win');
        } else { 
            this.ui.winner.textContent = 'DRAW!'; this.ui.winner.classList.add('tie-win'); 
        }
        
        document.getElementById('tf-win-reason').textContent = reason === 'completed' ? 'Sentence Completed!' : 'Time Expired!';
        document.getElementById('tf-res-p1-name').textContent = App.myRole === 'p1' ? App.playerName : App.opponentName;
        document.getElementById('tf-res-p2-name').textContent = App.myRole === 'p2' ? App.playerName : App.opponentName;
        
        document.getElementById('tf-res-p1-wins').textContent = score.p1;
        document.getElementById('tf-res-p2-wins').textContent = score.p2;

        document.getElementById('tf-res-p1-wpm').textContent = state.p1.wpm; document.getElementById('tf-res-p1-acc').textContent = state.p1.acc;
        document.getElementById('tf-res-p2-wpm').textContent = state.p2.wpm; document.getElementById('tf-res-p2-acc').textContent = state.p2.acc;
        
        const nextBtn = document.getElementById('tf-next-round-btn');
        const waitText = document.getElementById('tf-waiting-next');
        
        if (App.myRole === 'p1') {
            nextBtn.classList.remove('hidden');
            waitText.classList.add('hidden');
            nextBtn.onclick = () => {
                nextBtn.classList.add('hidden');
                socket.emit('tf_start', { roomId: App.roomId, difficulty: 'medium' });
            };
        } else {
            nextBtn.classList.add('hidden');
            waitText.classList.remove('hidden');
        }
        
        setTimeout(() => App.switchScreen('tf-results-screen'), 2500);
    }
};

const DrawGuess = {
    canvas: null, ctx: null,
    isDrawer: false,
    drawState: { isDrawing: false, tool: 'pencil', color: '#000', size: 5 },
    
    init() {
        this.canvas = document.getElementById('dg-canvas');
        this.ctx = this.canvas.getContext('2d');

        socket.on('dg_setup_init', data => {
            App.switchScreen('dg-setup-screen');
            this.isDrawer = (data.drawerRole === App.myRole);
            
            document.getElementById('dg-drawer-setup').classList.toggle('hidden', !this.isDrawer);
            document.getElementById('dg-guesser-setup').classList.toggle('hidden', this.isDrawer);
            
            if (this.isDrawer) {
                const container = document.getElementById('dg-word-choices');
                container.innerHTML = '';
                data.choices.forEach(w => {
                    const btn = document.createElement('button');
                    btn.className = 'word-choice-btn'; btn.textContent = w;
                    btn.onclick = () => socket.emit('dg_word_selected', { roomId: App.roomId, word: w });
                    container.appendChild(btn);
                });
            }
        });

        socket.on('dg_play_start', data => {
            App.switchScreen('dg-play-screen');
            this.isDrawer = (data.drawerRole === App.myRole);
            this.resizeCanvas(true);
            
            document.getElementById('dg-toolbar').classList.toggle('hidden', !this.isDrawer);
            document.getElementById('dg-p1-name').textContent = App.myRole === 'p1' ? App.playerName : App.opponentName;
            document.getElementById('dg-p2-name').textContent = App.myRole === 'p2' ? App.playerName : App.opponentName;
            
            const hint = document.getElementById('dg-word-hint-container');
            const controls = document.getElementById('dg-guess-controls');
            
            if (this.isDrawer) {
                hint.innerHTML = `Word: <span id="dg-secret-display">???</span> <button id="dg-toggle-word-btn" class="small-btn">Show</button>`;
                controls.innerHTML = `<h3 style="color:#00ff88;">Draw the word!</h3>`;
                
                document.getElementById('dg-toggle-word-btn').onclick = () => {
                    const disp = document.getElementById('dg-secret-display');
                    disp.textContent = disp.textContent === '???' ? "Click to hide" : "???"; 
                };
            } else {
                hint.innerHTML = `Guess the word!`;
                controls.innerHTML = `
                    <label>Guesser: Type your guess!</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="dg-guess-input" placeholder="What is it?" autocomplete="off">
                        <button id="dg-guess-btn" class="action-btn" style="font-size: 1.2rem; padding: 10px 20px;">GUESS</button>
                    </div>`;
                    
                document.getElementById('dg-guess-btn').onclick = () => this.sendGuess();
                document.getElementById('dg-guess-input').onkeyup = (e) => { if (e.key === 'Enter') this.sendGuess(); };
            }
        });

        socket.on('dg_draw', data => this.executeDrawEvent(data));
        socket.on('dg_clear', () => this.clearCanvas());
        socket.on('dg_tick', t => document.getElementById('dg-timer').textContent = t);
        socket.on('dg_guess_feedback', () => {
            const fb = document.getElementById('dg-feedback');
            if(fb) { 
                fb.textContent = '❌ Incorrect!'; fb.style.color = '#ff3366'; setTimeout(() => fb.textContent='', 2000); 
                SoundFX.play('boing'); // Play mistake sound for bad guess!
            }
        });
        
        socket.on('dg_end', data => {
            App.switchScreen('dg-results-screen');
            document.getElementById('dg-answer-reveal').querySelector('span').textContent = data.word;
            document.getElementById('dg-round-result-text').textContent = data.won ? `CORRECT GUESS by ${data.winnerRole === App.myRole ? App.playerName : App.opponentName}!` : "TIME'S UP!";
            document.getElementById('dg-round-result-text').style.color = data.won ? "#00ff88" : "#ff3366";
            
            document.getElementById('dg-res-p1-name').textContent = App.myRole === 'p1' ? App.playerName : App.opponentName;
            document.getElementById('dg-res-p2-name').textContent = App.myRole === 'p2' ? App.playerName : App.opponentName;
            document.getElementById('dg-res-p1-score').textContent = data.scores.p1;
            document.getElementById('dg-res-p2-score').textContent = data.scores.p2;
            
            if (data.won) SoundFX.play('win'); // Play win sound if round won!
            
            if (App.myRole === 'p1') {
                document.getElementById('dg-next-round-btn').classList.remove('hidden');
                document.getElementById('dg-waiting-next').classList.add('hidden');
            } else {
                document.getElementById('dg-next-round-btn').classList.add('hidden');
                document.getElementById('dg-waiting-next').classList.remove('hidden');
            }
        });

        const start = (e) => { if (this.isDrawer) { e.preventDefault(); this.startDraw(e.touches ? e.touches[0] : e); } };
        const move = (e) => { if (this.isDrawer) { e.preventDefault(); this.draw(e.touches ? e.touches[0] : e); } };
        const stop = (e) => { if (this.isDrawer) { if(e.cancelable) e.preventDefault(); this.stopDraw(); } };

        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('mousemove', move);
        this.canvas.addEventListener('mouseup', stop);
        this.canvas.addEventListener('mouseout', stop);
        this.canvas.addEventListener('touchstart', start, {passive: false});
        this.canvas.addEventListener('touchmove', move, {passive: false});
        this.canvas.addEventListener('touchend', stop, {passive: false});

        document.getElementById('dg-tool-pencil').onclick = () => this.setTool('pencil');
        document.getElementById('dg-tool-eraser').onclick = () => this.setTool('eraser');
        document.getElementById('dg-color-picker').oninput = (e) => this.drawState.color = e.target.value;
        document.getElementById('dg-brush-size').oninput = (e) => this.drawState.size = e.target.value;
        document.getElementById('dg-tool-clear').onclick = () => { this.clearCanvas(); socket.emit('dg_clear', App.roomId); };
        document.getElementById('dg-next-round-btn').onclick = () => socket.emit('dg_setup', App.roomId);
        window.addEventListener('resize', () => { if(App.currentScreen === 'dg-play-screen') this.resizeCanvas(false); });
    },

    sendGuess() {
        const input = document.getElementById('dg-guess-input');
        if (!input || !input.value.trim()) return;
        socket.emit('dg_guess', { roomId: App.roomId, guess: input.value.trim(), role: App.myRole });
        input.value = '';
    },
    resizeCanvas(clear = false) {
        const container = document.getElementById('dg-canvas-container');
        const data = !clear ? this.ctx.getImageData(0,0, this.canvas.width, this.canvas.height) : null;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        if (clear) this.clearCanvas();
        else if (data) this.ctx.putImageData(data, 0, 0);
    },
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    },
    startDraw(e) {
        this.drawState.isDrawing = true;
        const pos = this.getMousePos(e);
        this.emitDraw('start', pos);
        this.executeDrawEvent({ type: 'start', pos, tool: this.drawState.tool, color: this.drawState.color, size: this.drawState.size });
    },
    draw(e) {
        if (!this.drawState.isDrawing) return;
        const pos = this.getMousePos(e);
        this.emitDraw('draw', pos);
        this.executeDrawEvent({ type: 'draw', pos, tool: this.drawState.tool, color: this.drawState.color, size: this.drawState.size });
    },
    stopDraw() { this.drawState.isDrawing = false; },
    emitDraw(type, pos) {
        socket.emit('dg_draw', { roomId: App.roomId, drawData: { type, pos, tool: this.drawState.tool, color: this.drawState.color, size: this.drawState.size } });
    },
    executeDrawEvent(data) {
        const x = data.pos.x * this.canvas.width;
        const y = data.pos.y * this.canvas.height;
        if (data.type === 'start') {
            this.ctx.beginPath(); this.ctx.moveTo(x, y);
        } else if (data.type === 'draw') {
            this.ctx.lineTo(x, y);
            this.ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
            this.ctx.lineWidth = data.size;
            this.ctx.stroke();
        }
    },
    clearCanvas() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    },
    setTool(tool) {
        this.drawState.tool = tool;
        document.getElementById('dg-tool-pencil').classList.toggle('active', tool === 'pencil');
        document.getElementById('dg-tool-eraser').classList.toggle('active', tool === 'eraser');
    }
};

window.onload = () => App.init();
