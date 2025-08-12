// --- Lógica de Ecrãs e Transição ---
const cadastroContainer = document.getElementById('cadastro-container');
const instrucoesContainer = document.getElementById('instrucoes-container');
const jogoContainer = document.getElementById('jogo-container');
const cadastroForm = document.getElementById('cadastro-form');
const startGameButton = document.getElementById('start-game-button');
const nomeUsuarioSpan = document.getElementById('nome-usuario');
const pontuacaoSpan = document.getElementById('pontuacao-valor');
const timerSpan = document.getElementById('timer-valor');
const muteButton = document.getElementById('mute-button');
let isMuted = false;

cadastroForm.addEventListener('submit', function(event) {
    event.preventDefault(); 
    const nome = document.getElementById('nome').value;
    nomeUsuarioSpan.textContent = nome.split(' ')[0];
    
    if (Tone.context.state !== 'running') {
        Tone.start();
    }

    cadastroContainer.classList.add('hidden');
    instrucoesContainer.classList.remove('hidden');
    preencherInstrucoes();
});

startGameButton.addEventListener('click', () => {
    instrucoesContainer.classList.add('hidden');
    jogoContainer.classList.remove('hidden');
    iniciarJogo();
});

muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    Tone.Destination.mute = isMuted;
    muteButton.textContent = isMuted ? '🔇' : '🔊';
});

function preencherInstrucoes() {
    const lista = document.getElementById('instrucoes-lista');
    const itens = [
        { texture: 'computador', text: '+10 Pontos' },
        { texture: 'senac', text: '+20 Pontos (Bónus!)' },
        { texture: 'relogio', text: '+5 Segundos' },
        { texture: 'virus', text: '-15 Pontos (Cuidado!)' }
    ];
    
    // Usa um jogo Phaser com renderizador CANVAS (em vez de HEADLESS) para gerar as texturas de forma segura.
    const tempGame = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 1,
        height: 1,
        parent: document.createElement('div'), // Previne que o canvas seja adicionado à página principal
        scene: {
            create: function() {
                generateShapeTextures(this);

                lista.innerHTML = ''; // Limpa a lista
                itens.forEach(item => {
                    const li = document.createElement('li');
                    const img = document.createElement('img');
                    const texture = this.textures.get(item.texture);
                    if (texture && texture.key !== '__DEFAULT') {
                        // Usa getBase64 para extrair a imagem da textura gerada
                        img.src = this.textures.getBase64(item.texture);
                    }
                    li.appendChild(img);
                    li.append(item.text);
                    lista.appendChild(li);
                });
                
                // Destrói a instância temporária do jogo para libertar memória
                setTimeout(() => this.game.destroy(true), 100);
            }
        }
    });
}

// --- Lógica do Jogo com Phaser ---
function iniciarJogo() {
    const sounds = {
        collect: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.5 } }).toDestination(),
        bonus: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.8 } }).toDestination(),
        negative: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 } }).toDestination(),
        gameOver: new Tone.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.1, decay: 0.5, sustain: 0.2, release: 1 } }).toDestination(),
        music: new Tone.MonoSynth({ oscillator: { type: "square" }, envelope: { attack: 0.1 } }).toDestination()
    };
    sounds.music.volume.value = -20;

    const musicLoop = new Tone.Loop(time => {
        sounds.music.triggerAttackRelease("C2", "8n", time);
        sounds.music.triggerAttackRelease("G2", "8n", time + 0.5);
        sounds.music.triggerAttackRelease("A#2", "8n", time + 1);
    }, "1n").start(0);
    
    Tone.Transport.start();

    const sceneConfig = {
        init: function() {
            this.sounds = sounds;
            this.musicLoop = musicLoop;
        },
        preload: preload,
        create: create,
        update: update
    };

    const config = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: 'jogo-container',
        backgroundColor: '#003b6f',
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 100 }, debug: false }
        },
        scene: sceneConfig
    };

    const game = new Phaser.Game(config);

    function preload() {}

    function create() {
        this.pontuacao = 0;
        this.tempoRestante = 60;
        this.stats = { computador: 0, mouse: 0, teclado: 0, senac: 0, relogio: 0, virus: 0 };
        
        pontuacaoSpan.textContent = this.pontuacao;
        timerSpan.textContent = this.tempoRestante;

        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
        
        generateShapeTextures(this);

        this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'background_pattern').setOrigin(0, 0).setAlpha(0.1);

        this.itemsGroup = this.physics.add.group();
        this.bonusGroup = this.physics.add.group();
        this.badItemGroup = this.physics.add.group();
        const itemTypes = ['computador', 'mouse', 'teclado'];

        this.itemSpawner = this.time.addEvent({
            delay: 800,
            callback: () => criarItem(this, this.itemsGroup, this.bonusGroup, this.badItemGroup, itemTypes, this.pontuacao),
            loop: true
        });

        this.gameTimer = this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.tempoRestante--;
                timerSpan.textContent = this.tempoRestante;
                if (this.tempoRestante <= 0) {
                    this.itemSpawner.destroy();
                    this.gameTimer.destroy();
                    Tone.Transport.stop();
                    this.sounds.gameOver.triggerAttackRelease("C3", "1n");
                    
                    this.itemsGroup.clear(true, true);
                    this.bonusGroup.clear(true, true);
                    this.badItemGroup.clear(true, true);

                    showGameOverScreen(this, this.pontuacao, this.stats);
                }
            },
            loop: true
        });

        this.input.on('gameobjectdown', (pointer, gameObject) => {
            let valor = 0;
            let itemKey = gameObject.texture.key;

            if (this.itemsGroup.contains(gameObject)) {
                valor = 10;
                this.pontuacao = itemColetado(this, gameObject, this.pontuacao, valor, this.stats, this.sounds.collect, "C5");
            } else if (this.bonusGroup.contains(gameObject)) {
                if (itemKey === 'senac') {
                    valor = 20;
                    this.pontuacao = itemColetado(this, gameObject, this.pontuacao, valor, this.stats, this.sounds.bonus, "G5");
                } else if (itemKey === 'relogio') {
                    this.tempoRestante += 5;
                    timerSpan.textContent = this.tempoRestante;
                    itemColetado(this, gameObject, this.pontuacao, 0, this.stats, this.sounds.bonus, "A5");
                }
            } else if (this.badItemGroup.contains(gameObject)) {
                valor = -15;
                this.pontuacao = itemColetado(this, gameObject, this.pontuacao, valor, this.stats, this.sounds.negative, "C2");
            }
            pontuacaoSpan.textContent = this.pontuacao;
        });
    }

    function update() {
        this.physics.world.bodies.each(body => {
            if (body.gameObject && body.gameObject.y > this.cameras.main.height + 100) {
                body.gameObject.destroy();
            }
        });
    }
}

function generateShapeTextures(scene) {
    if (scene.textures.exists('computador')) return;
    let graphics;
    const hubColor = 0x00a9e0;

    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0x004a80, 0.4);
    for (let i = 0; i < 80; i++) {
        graphics.fillRect(Math.random() * 800, Math.random() * 600, 2, 2);
    }
    graphics.generateTexture('background_pattern', 800, 600);
    graphics.destroy();
    
    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0x333333, 1);
    graphics.fillRoundedRect(0, 0, 60, 45, 5);
    graphics.fillStyle(hubColor, 1);
    graphics.fillRect(5, 5, 50, 35);
    graphics.fillStyle(0x555555, 1);
    graphics.fillRect(25, 45, 10, 10);
    graphics.fillStyle(0x00ff00, 1);
    graphics.fillCircle(55, 40, 2);
    graphics.generateTexture('computador', 60, 55);
    graphics.destroy();

    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0xcccccc, 1);
    graphics.fillEllipse(22, 27, 40, 50);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillEllipse(20, 25, 40, 50);
    graphics.fillStyle(0xaaaaaa, 1);
    graphics.fillRect(18, 15, 4, 10);
    graphics.generateTexture('mouse', 44, 54);
    graphics.destroy();
    
    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0x555555, 1);
    graphics.fillRoundedRect(0, 0, 80, 30, 3);
    graphics.fillStyle(0xdddddd, 1);
    for(let i = 0; i < 4; i++) {
        for(let j = 0; j < 2; j++) {
            graphics.fillRoundedRect(5 + i * 18, 5 + j * 12, 15, 8, 2);
        }
    }
    graphics.generateTexture('teclado', 80, 30);
    graphics.destroy();

    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.lineStyle(6, hubColor, 1);
    const path1 = new Phaser.Curves.Path().moveTo(10, 20).lineTo(30, 10).lineTo(50, 20);
    path1.draw(graphics);
    const path2 = new Phaser.Curves.Path().moveTo(10, 30).lineTo(30, 20).lineTo(50, 30);
    path2.draw(graphics);
    graphics.fillStyle(hubColor, 1);
    graphics.fillCircle(10, 20, 5);
    graphics.fillCircle(50, 20, 5);
    graphics.fillCircle(10, 30, 5);
    graphics.fillCircle(50, 30, 5);
    graphics.generateTexture('senac', 60, 40);
    graphics.destroy();
    
    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0xff0000, 1);
    graphics.fillCircle(25, 25, 20);
    graphics.lineStyle(4, 0xcc0000, 1);
    for(let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        graphics.moveTo(25, 25);
        graphics.lineTo(25 + Math.cos(angle) * 25, 25 + Math.sin(angle) * 25);
    }
    graphics.strokePath();
    graphics.generateTexture('virus', 50, 50);
    graphics.destroy();

    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(25, 25, 25);
    graphics.lineStyle(4, 0x333333, 1);
    graphics.beginPath();
    graphics.moveTo(25, 25);
    graphics.lineTo(25, 10);
    graphics.strokePath();
    graphics.lineStyle(2, 0x333333, 1);
    graphics.beginPath();
    graphics.moveTo(25, 25);
    graphics.lineTo(40, 25);
    graphics.strokePath();
    graphics.generateTexture('relogio', 50, 50);
    graphics.destroy();

    graphics = scene.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(hubColor, 1);
    graphics.fillCircle(5, 5, 5);
    graphics.generateTexture('particle', 10, 10);
    graphics.destroy();
}

function criarItem(scene, itemsGroup, bonusGroup, badItemGroup, itemTypes, pontuacao) {
    const x = Phaser.Math.Between(50, scene.cameras.main.width - 50);
    const chance = Phaser.Math.Between(1, 20);
    
    let item;
    if (chance <= 2) {
        item = bonusGroup.create(x, -50, 'senac');
    } else if (chance <= 4) {
        item = bonusGroup.create(x, -50, 'relogio');
    } else if (chance <= 7) {
        item = badItemGroup.create(x, -50, 'virus');
    } else {
        const randomItem = Phaser.Math.RND.pick(itemTypes);
        item = itemsGroup.create(x, -50, randomItem);
    }
    
    let currentVelocity = 150 + (pontuacao * 1.5);
    item.setVelocityY(Math.min(currentVelocity, 800));
    item.setInteractive({ useHandCursor: true });
    item.setAngularVelocity(Phaser.Math.Between(-50, 50));
}

function itemColetado(scene, gameObject, pontuacao, valor, stats, sound, note) {
    const itemKey = gameObject.texture.key;
    if (stats.hasOwnProperty(itemKey)) {
        stats[itemKey]++;
    }
    
    sound.triggerAttackRelease(note, "8n");
    
    if (valor < 0) {
        scene.cameras.main.shake(100, 0.01);
    }

    const emitter = scene.add.particles(gameObject.x, gameObject.y, 'particle', {
        speed: 150,
        scale: { start: 1, end: 0 },
        blendMode: 'ADD',
        lifespan: 400,
        gravityY: 200
    });
    
    gameObject.destroy();
    setTimeout(() => emitter.destroy(), 500);
    
    let novaPontuacao = pontuacao + valor;
    return Math.max(0, novaPontuacao);
}

function showGameOverScreen(scene, score, stats) {
    const overlay = scene.add.rectangle(0, 0, scene.cameras.main.width, scene.cameras.main.height, 0x000000, 0.7).setOrigin(0).setDepth(200);
    
    const boxWidth = 400;
    const boxHeight = 480;
    const boxX = scene.cameras.main.centerX - boxWidth / 2;
    const boxY = scene.cameras.main.centerY - boxHeight / 2;
    const summaryBox = scene.add.graphics().setDepth(201);
    summaryBox.fillStyle(0x004a80, 0.95);
    summaryBox.lineStyle(2, 0x00a9e0, 1);
    summaryBox.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 15);
    summaryBox.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 15);

    scene.add.text(scene.cameras.main.centerX, boxY + 40, 'Fim de Jogo!', { fontSize: '42px', fill: '#fff', fontFamily: '"Poppins"' }).setOrigin(0.5).setDepth(202);
    scene.add.text(scene.cameras.main.centerX, boxY + 100, `Pontuação Final: ${score}`, { fontSize: '28px', fill: '#00a9e0', fontFamily: '"Poppins"' }).setOrigin(0.5).setDepth(202);
    
    let statsText = 'Itens Coletados:\n\n';
    statsText += `Computador: ${stats.computador}\n`;
    statsText += `Rato: ${stats.mouse}\n`;
    statsText += `Teclado: ${stats.teclado}\n`;
    statsText += `Logo SENAC: ${stats.senac}\n`;
    statsText += `Relógio: ${stats.relogio}\n`;
    statsText += `Vírus: ${stats.virus}`;
    
    scene.add.text(scene.cameras.main.centerX, boxY + 230, statsText, { fontSize: '20px', fill: '#fff', fontFamily: '"Poppins"', align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(202);

    const buttonX = scene.cameras.main.centerX;
    const buttonY = boxY + boxHeight - 60;
    const playAgainButton = scene.add.text(buttonX, buttonY, 'Jogar Novamente', { 
        fontSize: '24px', 
        fill: '#fff', 
        fontFamily: '"Poppins"',
        backgroundColor: '#00a9e0',
        padding: { x: 20, y: 10 },
        borderRadius: 5
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(202);

    playAgainButton.on('pointerdown', () => {
        scene.scene.restart();
    });

     playAgainButton.on('pointerover', () => {
        playAgainButton.setBackgroundColor('#004a80');
    });

    playAgainButton.on('pointerout', () => {
        playAgainButton.setBackgroundColor('#00a9e0');
    });
}
