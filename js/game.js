import { VERBS } from './verbs.js';
import { MODES, shuffle, createQuestion, makeDeck } from './questions.js';

const $ = id => document.getElementById(id);

const avatars = [
    '🦊',
    '🐼',
    '🐸',
    '🐱',
    '🐯',
    '🐙',
    '🐧',
    '🦄'
];

const colors = [
    '#ffbd74',
    '#79d8fc',
    '#eaa2fa',
    '#8af3a8'
];

const special = {
    green: new Set([5, 17, 28, 44, 63, 79, 91]),
    red: new Set([12, 23, 37, 52, 68, 83, 95]),
    blue: new Set([9, 31, 48, 72, 87]),
    yellow: new Set([15, 40, 60, 85]),
    purple: new Set([20, 50, 75, 94])
};

const icons = {
    green: '↗',
    red: '↙',
    blue: '💡',
    yellow: '↻',
    purple: '×2'
};

const SAVE_KEY = 'irregular-adventure-save-v1';

const FACE = [
    '⚀',
    '⚁',
    '⚂',
    '⚃',
    '⚄',
    '⚅'
];

let state = null;
let interval = null;
let locked = false;
let toastTimeout = null;
let audio = null;

let soundOn = localStorage.getItem('ia-sound') !== 'off';
let currentOverlay = null;


function escapeHTML(s) {
    return String(s).replace(/[&<>\"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '\"': '&quot;',
        "'": '&#39;'
    }[ch]));
}


function randomInt(n) {
    return Math.floor(Math.random() * n);
}


function beep(type) {
    if (!soundOn)
        return;

    try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();

        if (audio.state === 'suspended')
            audio.resume();

        const notes =
            type === 'win'
                ? [523, 659, 784, 1047]
                : type === 'good'
                    ? [523, 784]
                    : type === 'bad'
                        ? [220, 175]
                        : [330, 440];

        notes.forEach((hz, i) => {
            const o = audio.createOscillator();
            const g = audio.createGain();
            const at = audio.currentTime + i * .105;

            o.type = 'sine';
            o.frequency.setValueAtTime(hz, at);

            g.gain.setValueAtTime(.0001, at);
            g.gain.exponentialRampToValueAtTime(.09, at + .015);
            g.gain.exponentialRampToValueAtTime(.0001, at + .16);

            o.connect(g);
            g.connect(audio.destination);

            o.start(at);
            o.stop(at + .18);
        });
    }
    catch {
    }
}


function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(
        () => $('toast').classList.add('hidden'),
        2600
    );
}


function save() {
    if (state)
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}


function savedGame() {
    try {
        const d = JSON.parse(localStorage.getItem(SAVE_KEY));

        return d &&
            d.version === 1 &&
            Array.isArray(d.players) &&
            d.players.length >= 1 &&
            d.players.length <= 4 &&
            Array.isArray(d.deck) &&
            typeof d.current === 'number' &&
            d.players.every(
                p => typeof p.position === 'number'
            )
            ? d
            : null;
    }
    catch {
        return null;
    }
}


function paintMenu() {
    const count = Number($('playerCount').value);

    const prev = [
        ...$('playerInputs').querySelectorAll('.player-line')
    ].map(line => ({
        name: line.querySelector('input').value,
        avatar: line.querySelector('select').value
    }));

    $('playerInputs').innerHTML = '';

    for (let i = 0; i < count; i++) {
        const line = document.createElement('div');

        line.className = 'player-line';

        const input = document.createElement('input');

        input.type = 'text';
        input.maxLength = 18;
        input.placeholder = `Nombre del jugador ${i + 1}`;
        input.value = prev[i]?.name ?? `Jugador ${i + 1}`;

        input.setAttribute(
            'aria-label',
            `Nombre del jugador ${i + 1}`
        );

        const select = document.createElement('select');

        select.setAttribute(
            'aria-label',
            `Personaje del jugador ${i + 1}`
        );

        const avatarNames = {
            '🦊': 'Zorro',
            '🐼': 'Poo',
            '🐸': 'Rana rene',
            '🐱': 'Miau',
            '🐯': 'Toño',
            '🐙': 'Octavius',
            '🐧': 'Gunter',
            '🦄': 'Triple 7'
        };

        avatars.forEach(a => {
            const opt = document.createElement('option');

            opt.value = a;
            opt.textContent = `${a} ${avatarNames[a]}`;

            select.append(opt);
        });

        select.value = prev[i]?.avatar ?? avatars[i];

        line.append(input, select);

        $('playerInputs').append(line);
    }

    $('continueButton').classList.toggle(
        'hidden',
        !savedGame()
    );
}


function reset() {
    clearInterval(interval);

    state = null;
    locked = false;
    currentOverlay = null;

    $('modalBackdrop').classList.add('hidden');
    $('gameScreen').classList.add('hidden');
    $('menuScreen').classList.remove('hidden');

    paintMenu();
}


function start() {
    const players = [
        ...$('playerInputs').querySelectorAll('.player-line')
    ].map((line, i) => ({
        name:
            line.querySelector('input').value
                .trim()
                .slice(0, 18) ||
            `Jugador ${i + 1}`,

        avatar: line.querySelector('select').value,
        color: colors[i],
        position: 0,
        score: 0,
        streak: 0,
        maxStreak: 0,
        correct: 0,
        wrong: 0,
        hint: false,
        double: false,
        extra: false
    }));

    state = {
        version: 1,
        players,
        current: 0,
        deck: makeDeck(),
        cycle: 1,
        question: null,
        rolled: null,
        phase: 'roll',
        timer: !!$('timerSetting').checked,
        asked: 0,
        totalCorrect: 0,
        totalWrong: 0,
        winner: null
    };

    $('menuScreen').classList.add('hidden');
    $('gameScreen').classList.remove('hidden');

    render();
    save();
}


function resume() {
    const s = savedGame();

    if (!s) {
        toast('No se encontró una partida guardada.');
        paintMenu();
        return;
    }

    state = s;

    state.phase =
        state.winner !== null
            ? 'won'
            : state.phase === 'feedback'
                ? 'feedback'
                : state.question
                    ? 'question'
                    : 'roll';

    $('menuScreen').classList.add('hidden');
    $('gameScreen').classList.remove('hidden');

    render();

    if (
        state.phase === 'question' ||
        state.phase === 'feedback'
    ) {
        showQuestion(state.phase === 'feedback');
    }

    if (state.phase === 'won')
        showWinner();
}


function typeFor(n) {
    for (const [type, set] of Object.entries(special)) {
        if (set.has(n))
            return type;
    }

    return '';
}


function renderBoard() {
    const board = $('board');

    board.replaceChildren();

    for (let visual = 0; visual < 100; visual++) {
        const row = Math.floor(visual / 10);
        const col = visual % 10;

        const n =
            row % 2 === 0
                ? 100 - row * 10 - col
                : 100 - row * 10 - 9 + col;

        const cell = document.createElement('div');

        const type = typeFor(n);

        cell.className =
            `cell ${type} ${n === 100 ? 'finish' : ''} ${
                state.players[state.current].position === n
                    ? 'active-cell'
                    : ''
            }`;

        cell.setAttribute('role', 'gridcell');

        cell.setAttribute(
            'aria-label',
            `Casilla ${n}${
                type
                    ? ' especial ' + type
                    : ''
            }`
        );

        const num = document.createElement('span');

        num.className = 'num';
        num.textContent = n;

        const symbol = document.createElement('span');

        symbol.className = 'symbol';

        symbol.textContent =
            n === 100
                ? '🏁'
                : icons[type] ?? '';

        const tokens = document.createElement('div');

        tokens.className = 'tokens';

        for (
            const p of state.players.filter(
                p => p.position === n
            )
        ) {
            const token = document.createElement('span');

            token.className = 'token';
            token.style.setProperty(
                '--token-color',
                p.color
            );

            token.title = p.name;
            token.textContent = p.avatar;

            tokens.append(token);
        }

        cell.append(num, symbol, tokens);

        board.append(cell);
    }
}


function render() {
    if (!state)
        return;

    renderBoard();

    const p = state.players[state.current];

    $('turnStatus').textContent =
        state.winner !== null
            ? '¡Tenemos ganador!'
            : `Turno ${state.current + 1}/${state.players.length} · ${p.name} ${p.avatar}`;

    $('activeName').textContent =
        `${p.avatar} ${p.name}`;

    $('die').textContent =
        state.rolled
            ? FACE[state.rolled - 1]
            : '⚀';

    $('rollText').textContent =
        state.rolled
            ? `Resultado: ${state.rolled}`
            : '¡Prepárate para lanzar!';

    $('rollButton').disabled =
        state.phase !== 'roll';

    $('scoreboard').innerHTML =
        state.players
            .map(
                (a, i) =>
                    `<div class="score-row ${
                        i === state.current
                            ? 'current'
                            : ''
                    }" style="--token-color:${a.color}">
                        <div class="score-top">
                            <span class="score-name">
                                ${a.avatar} ${escapeHTML(a.name)}
                            </span>
                            <b>${a.score} pts</b>
                        </div>

                        <div class="score-meta">
                            <span>📍 ${a.position}/100</span>
                            <span>🔥 ${a.streak}</span>
                            ${a.hint ? '<span>💡</span>' : ''}
                            ${a.double ? '<span>×2</span>' : ''}
                            ${a.extra ? '<span>↻</span>' : ''}
                        </div>

                        <div class="progress-track">
                            <div
                                class="progress-fill"
                                style="width:${a.position}%"
                            ></div>
                        </div>
                    </div>`
            )
            .join('');

    $('statsContent').innerHTML =
        `<div class="statline">
            <span>Verbos vistos</span>
            <b>${state.asked}/100</b>
        </div>

        <div class="statline">
            <span>Ronda del mazo</span>
            <b>${state.cycle}</b>
        </div>

        <div class="statline">
            <span>Respuestas correctas</span>
            <b>${state.totalCorrect}</b>
        </div>

        <div class="statline">
            <span>Respuestas incorrectas</span>
            <b>${state.totalWrong}</b>
        </div>

        <div class="statline">
            <span>Precisión general</span>
            <b>${
                state.totalCorrect + state.totalWrong
                    ? Math.round(
                        100 *
                        state.totalCorrect /
                        (state.totalCorrect + state.totalWrong)
                    )
                    : 0
            }%</b>
        </div>`;
}


function drawVerb() {
    if (!state.deck.length) {
        state.deck = makeDeck();
        state.cycle++;
        state.asked = 0;

        toast(
            '¡Los 100 verbos completados! Se mezcló el mazo otra vez.'
        );
    }

    state.asked++;

    return state.deck.pop();
}


function roll() {
    if (
        !state ||
        state.phase !== 'roll' ||
        locked
    ) {
        return;
    }

    locked = true;
    state.phase = 'rolling';

    const roll = 1 + randomInt(6);

    state.rolled = roll;

    beep('roll');

    $('rollButton').disabled = true;

    $('die').classList.add('rolling');
    $('die').textContent = FACE[roll - 1];

    setTimeout(() => {
        if (
            !state ||
            state.phase !== 'rolling'
        ) {
            return;
        }

        $('die').classList.remove('rolling');

        state.question = createQuestion(
            drawVerb(),
            MODES[randomInt(MODES.length)].key
        );

        state.phase = 'question';

        locked = false;

        render();
        save();
        showQuestion();
    }, 560);
}


function openModal(
    title,
    body,
    {
        wide = false,
        close = true,
        type = 'info'
    } = {}
) {
    clearInterval(interval);

    currentOverlay = type;

    $('modalTitle').textContent = title;

    $('modalBody').replaceChildren();

    if (typeof body === 'string')
        $('modalBody').innerHTML = body;
    else
        $('modalBody').append(body);

    $('modal').classList.toggle(
        'wide',
        wide
    );

    $('modalClose').classList.toggle(
        'hidden',
        !close
    );

    $('modalBackdrop').classList.remove('hidden');
}


function closeModal() {
    if (
        currentOverlay === 'question' &&
        state?.phase === 'question'
    ) {
        return;
    }

    $('modalBackdrop').classList.add('hidden');

    currentOverlay = null;
}


function showQuestion(
    restoringFeedback = false
) {
    if (!state?.question)
        return;

    const q = state.question;
    const p = state.players[state.current];
    const v = VERBS[q.verbId];

    const wrapper = document.createElement('div');

    wrapper.innerHTML =
        `<div class="question-label">
            ${escapeHTML(
                MODES.find(
                    m => m.key === q.mode
                ).label
            )}
            · Verbo ${state.asked} de 100
            ${p.double
                ? ' · ✨ PUNTOS DOBLES'
                : ''}
        </div>

        <div class="question-prompt">
            ${escapeHTML(q.prompt)}
        </div>

        ${
            p.hint
                ? `<p class="feedback">
                    💡 Pista:
                    ${escapeHTML(v.spanish)}
                    · Inicial:
                    ${escapeHTML(
                        q.options[q.correct]
                            .charAt(0)
                            .toUpperCase()
                    )}
                </p>`
                : ''
        }

        <div
            class="option-list"
            id="answerOptions"
        ></div>

        <div
            id="timerWrap"
            class="${state.timer ? '' : 'hidden'}"
        >
            <div class="timer-bar">
                <div
                    class="timer-fill"
                    id="timerFill"
                ></div>
            </div>

            <div class="question-foot">
                <span>
                    ⏱️ Tiempo restante:
                    <strong id="remaining">20</strong> s
                </span>

                <span>
                    +100 pts por acierto
                </span>
            </div>
        </div>

        <div
            id="feedbackArea"
            aria-live="polite"
        ></div>

        <div class="modal-bottom">
            <button
                id="nextButton"
                class="primary hidden"
            >
                Continuar →
            </button>
        </div>`;

    openModal(
        `🎯 Turno de ${p.name}`,
        wrapper,
        {
            close: false,
            type: 'question'
        }
    );

    q.options.forEach((a, i) => {
        const b = document.createElement('button');

        b.className = 'option';
        b.textContent =
            `${'ABCD'[i]}. ${a}`;

        b.addEventListener(
            'click',
            () => answer(i)
        );

        $('answerOptions').append(b);
    });

    $('nextButton').addEventListener(
        'click',
        endQuestion
    );

    if (restoringFeedback) {
        const correct = state.lastCorrect;
        const index = state.lastIndex;

        [
            ...$('answerOptions').children
        ].forEach((b, i) => {
            b.disabled = true;

            if (i === q.correct)
                b.classList.add('correct');
            else if (i === index)
                b.classList.add('incorrect');
        });

        $('feedbackArea').innerHTML =
            `<div class="feedback ${
                correct ? '' : 'bad'
            }">
                ${
                    correct
                        ? `✅ ¡Correcto! +${state.lastGain} puntos`
                        : (
                            index === -1
                                ? '⏰ ¡Se acabó el tiempo!'
                                : '❌ Respuesta incorrecta'
                        )
                }

                <div class="meaning">
                    ${escapeHTML(v.base)}
                    ·
                    ${escapeHTML(v.past)}
                    ·
                    ${escapeHTML(v.participle)}
                    =
                    ${escapeHTML(v.spanish)}
                </div>
            </div>`;

        $('nextButton').classList.remove(
            'hidden'
        );

        $('timerWrap').classList.add(
            'hidden'
        );

        return;
    }

    if (state.timer) {
        let end =
            performance.now() + 20000;

        interval = setInterval(() => {
            const ms = Math.max(
                0,
                end - performance.now()
            );

            if (!$('remaining'))
                return;

            $('remaining').textContent =
                Math.ceil(ms / 1000);

            $('timerFill').style.width =
                `${100 * ms / 20000}%`;

            if (ms <= 0)
                answer(-1);
        }, 100);
    }
}


function answer(index) {
    if (
        !state ||
        state.phase !== 'question' ||
        locked
    ) {
        return;
    }

    locked = true;

    clearInterval(interval);

    const q = state.question;
    const p = state.players[state.current];
    const v = VERBS[q.verbId];

    const correct =
        index === q.correct;

    p.hint = false;

    const answers = [
        ...$('answerOptions').children
    ];

    answers.forEach((b, i) => {
        b.disabled = true;

        if (i === q.correct)
            b.classList.add('correct');
        else if (i === index)
            b.classList.add('incorrect');
    });

    let gain = 0;

    if (correct) {
        gain = p.double ? 200 : 100;

        p.score += gain;
        p.correct++;
        p.streak++;

        p.maxStreak =
            Math.max(
                p.maxStreak,
                p.streak
            );

        state.totalCorrect++;

        if (p.streak % 3 === 0) {
            gain += 150;
            p.score += 150;
        }

        beep('good');
    }
    else {
        p.wrong++;
        p.streak = 0;

        state.totalWrong++;

        beep('bad');
    }

    p.double = false;

    state.phase = 'feedback';

    const title =
        correct
            ? `✅ ¡Correcto! +${gain} puntos`
            : (
                index === -1
                    ? '⏰ ¡Se acabó el tiempo!'
                    : '❌ Respuesta incorrecta'
            );

    $('feedbackArea').innerHTML =
        `<div class="feedback ${
            correct ? '' : 'bad'
        }">
            ${title}

            <div class="meaning">
                ${escapeHTML(v.base)}
                ·
                ${escapeHTML(v.past)}
                ·
                ${escapeHTML(v.participle)}
                =
                ${escapeHTML(v.spanish)}
            </div>

            ${
                correct &&
                p.streak % 3 === 0
                    ? '<div>🔥 Bono de 3 aciertos consecutivos: +150 puntos</div>'
                    : ''
            }
        </div>`;

    $('nextButton').classList.remove(
        'hidden'
    );

    $('remaining') &&
        ($('remaining').textContent = '0');

    state.lastCorrect = correct;
    state.lastIndex = index;
    state.lastGain = gain;

    save();
    render();
}


function endQuestion() {
    if (
        !state ||
        state.phase !== 'feedback'
    ) {
        return;
    }

    const p = state.players[state.current];
    const correct = state.lastCorrect;

    state.question = null;

    locked = false;

    closeModal();

    if (correct) {
        p.position =
            Math.min(
                100,
                p.position + state.rolled
            );

        if (p.position < 100) {
            const type =
                typeFor(p.position);

            if (type === 'green') {
                p.position =
                    Math.min(
                        100,
                        p.position + 2
                    );

                toast(
                    '🟢 ¡Avanzas 2 casillas extra!'
                );
            }

            if (type === 'red') {
                p.position =
                    Math.max(
                        0,
                        p.position - 3
                    );

                toast(
                    '🔴 Retrocedes 3 casillas.'
                );
            }

            if (type === 'blue') {
                p.hint = true;

                toast(
                    '🔵 Pista activada para tu próxima pregunta.'
                );
            }

            if (type === 'yellow') {
                p.extra = true;

                toast(
                    '🟡 ¡Ganaste un turno extra!'
                );
            }

            if (type === 'purple') {
                p.double = true;

                toast(
                    '🟣 Tu siguiente respuesta correcta vale el doble.'
                );
            }
        }

        if (p.position >= 100) {
            state.winner = state.current;
            state.phase = 'won';

            save();
            render();

            beep('win');

            showWinner();

            return;
        }
    }

    state.rolled = null;

    if (p.extra) {
        p.extra = false;

        toast(
            `↻ ¡${p.name} juega otra vez!`
        );
    }
    else {
        state.current =
            (state.current + 1) %
            state.players.length;
    }

    state.phase = 'roll';

    render();
    save();
}


function showWinner() {
    const p =
        state.players[state.winner];

    openModal(
        '🏆 ¡Fin de la aventura!',
        `<div class="winner-banner">
            <div class="trophy">
                ${p.avatar} 🏆
            </div>

            <h3>
                ¡Ganó ${escapeHTML(p.name)}!
            </h3>

            <p>
                Conquistó la casilla 100 con
                <b>${p.score} puntos</b>.<br>
                Respondió ${p.correct}
                preguntas correctamente y alcanzó
                una racha máxima de
                ${p.maxStreak}.
            </p>

            <div class="scoreboard">
                ${state.players
                    .map(
                        a =>
                            `<div class="score-row">
                                <div class="score-top">
                                    <span>
                                        ${a.avatar}
                                        ${escapeHTML(a.name)}
                                    </span>

                                    <strong>
                                        ${a.score} pts
                                        · casilla ${a.position}
                                    </strong>
                                </div>
                            </div>`
                    )
                    .join('')}
            </div>

            <button
                class="primary"
                id="playAgain"
            >
                Jugar de nuevo ↻
            </button>
        </div>`,
        {
            close: false,
            type: 'winner'
        }
    );

    $('playAgain').addEventListener(
        'click',
        () => {
            localStorage.removeItem(
                SAVE_KEY
            );

            reset();
        }
    );
}


function dictionary() {
    const content =
        document.createElement('div');

    content.innerHTML =
        `<p class="muted">
            Consulta los 100 verbos irregulares,
            sus tres formas y su traducción.
        </p>

        <input
            class="search"
            id="dictSearch"
            type="search"
            placeholder="Buscar: go, went, ir..."
            aria-label="Buscar verbos"
        >

        <p
            id="dictCount"
            class="dict-count"
        ></p>

        <div class="dictionary-scroll">
            <table class="dictionary-table">
                <thead>
                    <tr>
                        <th>Infinitive</th>
                        <th>Past simple</th>
                        <th>Past participle</th>
                        <th>Español</th>
                    </tr>
                </thead>

                <tbody id="dictRows"></tbody>
            </table>
        </div>`;

    openModal(
        '📚 Diccionario de verbos',
        content,
        {
            wide: true,
            type: 'dictionary'
        }
    );

    const rows = () => {
        const term =
            $('dictSearch')
                .value
                .trim()
                .toLocaleLowerCase();

        const results =
            VERBS.filter(
                v =>
                    [
                        v.base,
                        v.past,
                        v.participle,
                        v.spanish
                    ].some(
                        s =>
                            s
                                .toLocaleLowerCase()
                                .includes(term)
                    )
            );

        $('dictCount').textContent =
            `${results.length} de ${VERBS.length} verbos`;

        $('dictRows').innerHTML =
            results
                .map(
                    v =>
                        `<tr>
                            <td>
                                <strong>
                                    ${escapeHTML(v.base)}
                                </strong>
                            </td>

                            <td>
                                ${escapeHTML(v.past)}
                            </td>

                            <td>
                                ${escapeHTML(v.participle)}
                            </td>

                            <td>
                                ${escapeHTML(v.spanish)}
                            </td>
                        </tr>`
                )
                .join('');
    };

    $('dictSearch').addEventListener(
        'input',
        rows
    );

    rows();
}


function rules() {
    openModal(
        '❔ ¿Cómo se juega?',
        `<div class="rule-grid">

            <p>
                <strong>Objetivo.</strong>
                Llega primero a la casilla 100.
                De 1 a 4 jugadores comparten el mismo dispositivo.
                Todos empiezan en la casilla 0.
            </p>

            <p>
                <strong>Turnos.</strong>
                Lanza un dado de 1 a 6 y contesta una pregunta
                de opción múltiple.
                Si aciertas, avanzas las casillas indicadas;
                si fallas, no te mueves y pierdes el turno.
                Con temporizador activado dispones de 20 segundos
                por respuesta.
            </p>

            <p>
                <strong>Temas.</strong>
                Pasado simple, participio pasado,
                traducción al español y completar pasado + participio.
                Cada respuesta tiene cuatro opciones y solo una es correcta.
            </p>

            <p>
                <strong>Casillas especiales.</strong>
                🟢 avanza 2;
                🔴 retrocede 3;
                🔵 da una pista en tu siguiente pregunta;
                🟡 concede un turno extra;
                🟣 duplica los puntos de tu siguiente respuesta correcta
                (no el bono de racha).
                Solo se aplica la casilla donde terminas después del dado;
                un desplazamiento especial no encadena otro efecto.
            </p>

            <p>
                <strong>Marcador.</strong>
                +100 por acierto, 0 por error,
                +150 adicionales por cada grupo de tres
                aciertos consecutivos (3, 6, 9...).
                El doble de puntos aplica a la puntuación básica
                de tu próxima respuesta correcta;
                se consume al responder, incluso si fallas.
                La pista se consume al mostrar tu siguiente pregunta.
            </p>

            <p>
                <strong>Reglas.</strong>
                Los 100 verbos salen una sola vez por juego.
                Despues de usar todos, se vuelven a colocar al azar.
                El diccionario solo se puede abrir fuera de las preguntas.
                Queda prohibido la ayuda externa.
            </p>

            <p>
                <strong>Final.</strong>
                Gana quien alcance o supere la casilla 100 con el mayor puntuaje.
                La posición máxima es 100.
                La partida se guarda automáticamente en tu navegador.
            </p>

        </div>`,
        {
            type: 'rules'
        }
    );
}


function restart() {
    if (!state)
        return;

    if (
        confirm(
            '¿Reiniciar esta partida? Se borrará el progreso guardado.'
        )
    ) {
        localStorage.removeItem(
            SAVE_KEY
        );

        reset();
    }
}


$('playerCount').addEventListener(
    'change',
    paintMenu
);


$('startButton').addEventListener(
    'click',
    start
);


$('continueButton').addEventListener(
    'click',
    resume
);


$('rollButton').addEventListener(
    'click',
    roll
);


$('dictionaryButton').addEventListener(
    'click',
    () => {
        if (
            state?.phase === 'question' ||
            state?.phase === 'feedback'
        ) {
            toast(
                'Termina la pregunta antes de abrir el diccionario.'
            );

            return;
        }

        dictionary();
    }
);


$('rulesButton').addEventListener(
    'click',
    () => {
        if (
            state?.phase === 'question' ||
            state?.phase === 'feedback'
        ) {
            toast(
                'Termina la pregunta antes de abrir las instrucciones.'
            );

            return;
        }

        rules();
    }
);


$('gameRules').addEventListener(
    'click',
    rules
);


$('restartButton').addEventListener(
    'click',
    restart
);


$('modalClose').addEventListener(
    'click',
    closeModal
);


$('modalBackdrop').addEventListener(
    'click',
    event => {
        if (
            event.target ===
            $('modalBackdrop')
        ) {
            closeModal();
        }
    }
);


$('homeBrand').addEventListener(
    'click',
    e => {
        e.preventDefault();

        if (
            state &&
            (
                state.phase === 'question' ||
                state.phase === 'feedback' ||
                state.phase === 'rolling'
            )
        ) {
            toast(
                'Termina tu pregunta antes de salir.'
            );

            return;
        }

        if (
            state &&
            state.phase !== 'won' &&
            !confirm(
                '¿Volver al menú? Tu progreso está guardado.'
            )
        ) {
            return;
        }

        closeModal();

        $('gameScreen').classList.add(
            'hidden'
        );

        $('menuScreen').classList.remove(
            'hidden'
        );

        paintMenu();
    }
);


$('soundButton').addEventListener(
    'click',
    () => {
        soundOn = !soundOn;

        localStorage.setItem(
            'ia-sound',
            soundOn ? 'on' : 'off'
        );

        updateSound();

        beep('roll');
    }
);


function updateSound() {
    $('soundButton').textContent =
        soundOn
            ? '🔊 Sonido'
            : '🔇 Silencio';

    $('soundButton').setAttribute(
        'aria-pressed',
        String(soundOn)
    );
}


window.addEventListener(
    'keydown',
    e => {
        if (e.key === 'Escape')
            closeModal();
    }
);


updateSound();
paintMenu();