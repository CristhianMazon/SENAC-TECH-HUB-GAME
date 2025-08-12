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
    lista.innerHTML = ''; // Limpa a lista antes de adicionar os itens

    const itens = [
        { asset: 'assets/Monitor.png', text: '+10 Pontos' },
        { asset: 'assets/Mouse.png', text: '+10 Pontos' },
        { asset: 'assets/Teclado.png', text: '+10 Pontos' },
        { asset: 'assets/LogoSenac.png', text: '+20 Pontos (Bónus!)' },
        { asset: 'assets/Relogio.png', text: '+5 Segundos' },
        { asset: 'assets/Virusjogo.png', text: '-15 Pontos (Cuidado!)' }
    ];

    itens.forEach(item => {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = item.asset;
        li.appendChild(img);
        li.append(item.text);
        lista.appendChild(li);
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

    function preload() {
        this.load.image('computador', 'assets/Monitor.png');
        this.load.image('mouse', 'assets/Mouse.png');
        this.load.image('teclado', 'assets/Teclado.png');
        this.load.image('senac', 'assets/LogoSenac.png');
        this.load.image('relogio', 'assets/Relogio.png');
        this.load.image('virus', 'assets/Virusjogo.png'); // Nome corrigido para corresponder ao arquivo

        let graphics = this.make.graphics({x: 0, y: 0, add: false});
        graphics.fillStyle(0x00a9e0, 1);
        graphics.fillCircle(5, 5, 5);
        graphics.generateTexture('particle', 10, 10);
        graphics.destroy();
    }

    function create() {
        this.pontuacao = 0;
        this.tempoRestante = 60;
        this.stats = { computador: 0, mouse: 0, teclado: 0, senac: 0, relogio: 0, virus: 0 };

        pontuacaoSpan.textContent = this.pontuacao;
        timerSpan.textContent = this.tempoRestante;

        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }

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

function criarItem(scene, itemsGroup, bonusGroup, badItemGroup, itemTypes, pontuacao) {
    const x = Phaser.Math.Between(50, scene.cameras.main.width - 50);
    const chance = Phaser.Math.Between(1, 20);

    let item;
    let textureKey;
    let scale;

    if (chance <= 2) {
        textureKey = 'senac';
    } else if (chance <= 4) {
        textureKey = 'relogio';
    } else if (chance <= 7) {
        textureKey = 'virus';
    } else {
        textureKey = Phaser.Math.RND.pick(itemTypes);
    }

    // Lógica de criação e escala centralizada e organizada
    switch (textureKey) {
        case 'computador':
            scale = 0.5;
            item = itemsGroup.create(x, -50, textureKey);
            break;
        case 'mouse':
            scale = 0.5;
            item = itemsGroup.create(x, -50, textureKey);
            break;
        case 'teclado':
            scale = 0.6;
            item = itemsGroup.create(x, -50, textureKey);
            break;
        case 'senac':
            scale = 0.8;
            item = bonusGroup.create(x, -50, textureKey);
            break;
        case 'relogio':
            scale = 0.4;
            item = bonusGroup.create(x, -50, textureKey);
            break;
        case 'virus':
            scale = 0.5;
            item = badItemGroup.create(x, -50, textureKey);
            break;
    }

    item.setScale(scale);
    item.body.setSize(item.width, item.height);

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
    statsText += `Monitor: ${stats.computador}\n`;
    statsText += `Mouse: ${stats.mouse}\n`;
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