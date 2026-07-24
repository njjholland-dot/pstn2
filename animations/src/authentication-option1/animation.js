// PSTN2 Authentication Option 1: Direct Query Animation

let currentScene = 1;
const totalScenes = 10;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

const sceneDurations = {
    "1": 10000,
    "2": 14000,
    "3": 13000,
    "4": 13000,
    "5": 10000,
    "6": 13000,
    "7": 14000,
    "8": 12000,
    "9": 12000,
    "10": 12000
};

document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    setupScene1();
    updateProgress();

    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {
            speechSynthesis.getVoices();
        };
    }

    setTimeout(() => {
        const narration = document.querySelector('#scene-1 .narration');
        if (narration) {
            const text = narration.getAttribute('data-speech');
            speak(text, speechEndCallback);
        }
    }, 1500);
});

function setupControls() {
    document.getElementById('prev-btn').addEventListener('click', previousScene);
    document.getElementById('next-btn').addEventListener('click', nextScene);
    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('audio-btn').addEventListener('click', toggleAudio);
    updateButtons();
}

function speak(text, onComplete) {
    if (!audioEnabled || !text) {
        if (onComplete) setTimeout(onComplete, 100);
        return;
    }
    stopSpeech();
    if ('speechSynthesis' in window) {
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            voice.lang.startsWith('en-GB') ||
            voice.lang === 'en-gb' ||
            voice.name.includes('Daniel') ||
            voice.name.includes('British') ||
            voice.name.includes('UK')
        ) || voices.find(voice =>
            voice.lang.startsWith('en-GB')
        ) || voices.find(voice =>
            voice.lang.startsWith('en')
        );
        if (preferredVoice) {
            currentUtterance.voice = preferredVoice;
        }
        speechSynthesis.speak(currentUtterance);
    } else if (onComplete) {
        onComplete();
    }
}

function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    currentUtterance = null;
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const audioBtn = document.getElementById('audio-btn');
    if (audioEnabled) {
        audioBtn.textContent = '🔊 Audio On';
        audioBtn.classList.remove('audio-off');
        const narration = document.querySelector(`#scene-${currentScene} .narration`);
        if (narration) speak(narration.getAttribute('data-speech'));
    } else {
        audioBtn.textContent = '🔇 Audio Off';
        audioBtn.classList.add('audio-off');
        stopSpeech();
    }
}

function previousScene() { if (currentScene > 1) goToScene(currentScene - 1); else window.location.href = '/index.html'; }
function nextScene() { if (currentScene < totalScenes) goToScene(currentScene + 1); else window.location.href = '/index.html'; }

function goToScene(sceneNumber) {
    stopSpeech();
    document.getElementById(`scene-${currentScene}`).style.display = 'none';
    currentScene = sceneNumber;
    document.getElementById(`scene-${currentScene}`).style.display = 'block';
    setupSceneAnimations(currentScene);
    updateButtons();
    updateProgress();
    document.getElementById('current-scene').textContent = currentScene;
    setTimeout(() => {
        const narration = document.querySelector(`#scene-${currentScene} .narration`);
        if (narration) speak(narration.getAttribute('data-speech'), speechEndCallback);
    }, 800);
}

function updateButtons() {
    // Keep buttons enabled - they navigate to homepage at boundaries
    document.getElementById('prev-btn').disabled = false;
    document.getElementById('next-btn').disabled = false;
}

function updateProgress() {
    const progress = (currentScene / totalScenes) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
}

function togglePlay() {
    isPlaying = !isPlaying;
    const playBtn = document.getElementById('play-btn');
    if (isPlaying) {
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');
        autoPlay();
    } else {
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
        if (playInterval) {
            clearTimeout(playInterval);
            playInterval = null;
        }
    }
}

function autoPlay() {
    if (!isPlaying) return;
    if (audioEnabled) {
        speechEndCallback = () => {
            if (!isPlaying) return;
            if (currentScene < totalScenes) {
                nextScene();
                autoPlay();
            } else {
                isPlaying = false;
                document.getElementById('play-btn').textContent = '▶ Play';
                document.getElementById('play-btn').classList.remove('playing');
            }
        };
    } else {
        const duration = sceneDurations[currentScene];
        playInterval = setTimeout(() => {
            if (currentScene < totalScenes) {
                nextScene();
                autoPlay();
            } else {
                isPlaying = false;
                document.getElementById('play-btn').textContent = '▶ Play';
                document.getElementById('play-btn').classList.remove('playing');
            }
        }, duration);
    }
}

function setupSceneAnimations(sceneNum) {
    const setupFn = window[`setupScene${sceneNum}`];
    if (typeof setupFn === 'function') setupFn();
}

// Scene 1: The Problem - Show spoofing attack
function setupScene1() {
    const svg = d3.select('#scene-1-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    const width = 700;
    const height = 400;

    // Fraudster
    const fraudster = svg.append('g')
        .attr('transform', 'translate(100, 200)')
        .style('opacity', 0);

    fraudster.append('circle')
        .attr('r', 40)
        .attr('fill', '#1f2937');

    fraudster.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 5)
        .attr('font-size', '30px')
        .text('😈');

    fraudster.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 70)
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#ef4444')
        .text('Fraudster');

    // Victim
    const victim = svg.append('g')
        .attr('transform', 'translate(600, 200)')
        .style('opacity', 0);

    victim.append('circle')
        .attr('r', 40)
        .attr('fill', '#3b82f6');

    victim.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 5)
        .attr('font-size', '30px')
        .text('👤');

    victim.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 70)
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#3b82f6')
        .text('Victim');

    // Animate elements
    fraudster.transition().duration(800).delay(300).style('opacity', 1);
    victim.transition().duration(800).delay(600).style('opacity', 1);

    // Spoofed call arrow
    setTimeout(() => {
        const arrow = svg.append('path')
            .attr('d', 'M 150 200 L 550 200')
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 3)
            .attr('fill', 'none')
            .attr('marker-end', 'url(#arrowhead-red)')
            .attr('stroke-dasharray', '10,5')
            .style('opacity', 0);

        svg.append('defs').append('marker')
            .attr('id', 'arrowhead-red')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 9)
            .attr('refY', 3)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3, 0 6')
            .attr('fill', '#ef4444');

        arrow.transition().duration(600).style('opacity', 1);

        // Fake caller ID label
        const label = svg.append('text')
            .attr('x', 350)
            .attr('y', 170)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', '#ef4444')
            .text('📞 "Your Bank"')
            .style('opacity', 0);

        label.transition().duration(600).delay(300).style('opacity', 1);
    }, 1200);
}

// Scene 2: PSTN2 Authentication - Show CP structure
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    const width = 700;
    const height = 400;

    // CP1 (Terminating)
    const cp1 = svg.append('g')
        .attr('transform', 'translate(150, 200)')
        .style('opacity', 0);

    cp1.append('rect')
        .attr('x', -60)
        .attr('y', -50)
        .attr('width', 120)
        .attr('height', 100)
        .attr('rx', 8)
        .attr('fill', '#3b82f6')
        .attr('stroke', '#1e40af')
        .attr('stroke-width', 2);

    cp1.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 5)
        .attr('font-size', '20px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text('CP1');

    cp1.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 25)
        .attr('font-size', '12px')
        .attr('fill', 'white')
        .text('(Terminating)');

    // CP2 (Originating)
    const cp2 = svg.append('g')
        .attr('transform', 'translate(550, 200)')
        .style('opacity', 0);

    cp2.append('rect')
        .attr('x', -60)
        .attr('y', -50)
        .attr('width', 120)
        .attr('height', 100)
        .attr('rx', 8)
        .attr('fill', '#10b981')
        .attr('stroke', '#059669')
        .attr('stroke-width', 2);

    cp2.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 5)
        .attr('font-size', '20px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text('CP2');

    cp2.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 25)
        .attr('font-size', '12px')
        .attr('fill', 'white')
        .text('(Originating)');

    // Animate
    cp1.transition().duration(800).delay(300).style('opacity', 1);
    cp2.transition().duration(800).delay(600).style('opacity', 1);

    // Query arrow
    setTimeout(() => {
        const arrow = svg.append('path')
            .attr('d', 'M 220 200 L 480 200')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 3)
            .attr('fill', 'none')
            .attr('marker-end', 'url(#arrowhead-orange)')
            .style('opacity', 0);

        svg.append('defs').append('marker')
            .attr('id', 'arrowhead-orange')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 9)
            .attr('refY', 3)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3, 0 6')
            .attr('fill', '#f59e0b');

        arrow.transition().duration(600).style('opacity', 1);

        const label = svg.append('text')
            .attr('x', 350)
            .attr('y', 180)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', '#f59e0b')
            .text('Auth Query')
            .style('opacity', 0);

        label.transition().duration(600).delay(200).style('opacity', 1);
    }, 1200);
}

// Scene 3: The Query Flow - Step by step message exchange
function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    const width = 700;
    const height = 400;

    // CP1
    const cp1 = svg.append('g').attr('transform', 'translate(100, 200)');
    cp1.append('rect').attr('x', -50).attr('y', -40).attr('width', 100).attr('height', 80).attr('rx', 8).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('fill', 'white').attr('font-weight', 'bold').text('CP1');

    // CP2
    const cp2 = svg.append('g').attr('transform', 'translate(600, 200)');
    cp2.append('rect').attr('x', -50).attr('y', -40).attr('width', 100).attr('height', 80).attr('rx', 8).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('fill', 'white').attr('font-weight', 'bold').text('CP2');

    // Step 1: Query
    setTimeout(() => {
        const query = svg.append('path')
            .attr('d', 'M 160 200 L 540 200')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-query)')
            .style('opacity', 0);

        svg.append('defs').append('marker').attr('id', 'arrow-query').attr('markerWidth', 10).attr('markerHeight', 10)
            .attr('refX', 9).attr('refY', 3).attr('orient', 'auto')
            .append('polygon').attr('points', '0 0, 10 3, 0 6').attr('fill', '#f59e0b');

        query.transition().duration(800).style('opacity', 1);

        const queryLabel = svg.append('text')
            .attr('x', 350).attr('y', 170)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('fill', '#f59e0b')
            .attr('font-weight', 'bold')
            .text('1. Query: Did you originate +44...?')
            .style('opacity', 0);

        queryLabel.transition().duration(600).delay(400).style('opacity', 1);
    }, 500);

    // Step 2: Database check
    setTimeout(() => {
        const db = svg.append('g').attr('transform', 'translate(600, 100)');
        db.append('circle').attr('r', 25).attr('fill', '#8b5cf6').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
        db.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('fill', 'white').attr('font-size', '20px').text('💾').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        const checkLabel = svg.append('text')
            .attr('x', 600).attr('y', 60)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#8b5cf6')
            .text('2. Check DB')
            .style('opacity', 0);

        checkLabel.transition().duration(600).delay(300).style('opacity', 1);
    }, 2000);

    // Step 3: Response
    setTimeout(() => {
        const response = svg.append('path')
            .attr('d', 'M 540 220 L 160 220')
            .attr('stroke', '#10b981')
            .attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-response)')
            .style('opacity', 0);

        svg.append('defs').append('marker').attr('id', 'arrow-response').attr('markerWidth', 10).attr('markerHeight', 10)
            .attr('refX', 9).attr('refY', 3).attr('orient', 'auto')
            .append('polygon').attr('points', '0 0, 10 3, 0 6').attr('fill', '#10b981');

        response.transition().duration(800).style('opacity', 1);

        const responseLabel = svg.append('text')
            .attr('x', 350).attr('y', 250)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('fill', '#10b981')
            .attr('font-weight', 'bold')
            .text('3. Response: ✓ Verified')
            .style('opacity', 0);

        responseLabel.transition().duration(600).delay(400).style('opacity', 1);
    }, 3500);
}

// Continue with remaining scenes...
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Show porting chain: CP1 -> CP2 -> CP3
    const cps = [
        { x: 100, y: 200, name: 'CP1', color: '#3b82f6' },
        { x: 350, y: 200, name: 'CP2', color: '#f59e0b' },
        { x: 600, y: 200, name: 'CP3', color: '#10b981' }
    ];

    cps.forEach((cp, i) => {
        const g = svg.append('g').attr('transform', `translate(${cp.x}, ${cp.y})`).style('opacity', 0);
        g.append('rect').attr('x', -50).attr('y', -40).attr('width', 100).attr('height', 80).attr('rx', 8).attr('fill', cp.color);
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('fill', 'white').attr('font-weight', 'bold').text(cp.name);
        g.transition().duration(600).delay(300 + i * 300).style('opacity', 1);
    });

    // Porting arrows
    setTimeout(() => {
        [[150, 200, 290, 200, 'Ported →'], [400, 200, 540, 200, 'Ported →']].forEach((arrow, i) => {
            const line = svg.append('path')
                .attr('d', `M ${arrow[0]} ${arrow[1]} L ${arrow[2]} ${arrow[3]}`)
                .attr('stroke', '#ef4444')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .style('opacity', 0);
            line.transition().duration(600).delay(i * 400).style('opacity', 1);

            const label = svg.append('text')
                .attr('x', (arrow[0] + arrow[2]) / 2)
                .attr('y', arrow[1] - 10)
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .attr('fill', '#ef4444')
                .text(arrow[4])
                .style('opacity', 0);
            label.transition().duration(600).delay(i * 400 + 200).style('opacity', 1);
        });
    }, 1500);
}

function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Speedometer showing <100ms
    const centerX = 350;
    const centerY = 200;
    const radius = 100;

    const speedometer = svg.append('g').attr('transform', `translate(${centerX}, ${centerY})`);

    // Arc background
    const arc = d3.arc()
        .innerRadius(radius - 20)
        .outerRadius(radius)
        .startAngle(-Math.PI * 0.75)
        .endAngle(Math.PI * 0.75);

    speedometer.append('path')
        .attr('d', arc)
        .attr('fill', '#e5e7eb');

    // Speed arc (animates)
    const speedArc = d3.arc()
        .innerRadius(radius - 20)
        .outerRadius(radius)
        .startAngle(-Math.PI * 0.75);

    const speed = speedometer.append('path')
        .attr('fill', '#10b981')
        .attr('d', speedArc.endAngle(-Math.PI * 0.75));

    speed.transition()
        .duration(1500)
        .delay(500)
        .attrTween('d', () => {
            const interpolate = d3.interpolate(-Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 0.3);
            return t => speedArc.endAngle(interpolate(t))();
        });

    // Center text
    speedometer.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', -10)
        .attr('font-size', '48px')
        .attr('font-weight', 'bold')
        .attr('fill', '#10b981')
        .text('< 100')
        .style('opacity', 0)
        .transition().duration(600).delay(800).style('opacity', 1);

    speedometer.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 30)
        .attr('font-size', '24px')
        .attr('fill', '#6b7280')
        .text('milliseconds')
        .style('opacity', 0)
        .transition().duration(600).delay(1000).style('opacity', 1);
}

// Scene 6: Fraud Prevention - Show fraudster blocked
function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Fraudster
    const fraudster = svg.append('g').attr('transform', 'translate(100, 200)').style('opacity', 0);
    fraudster.append('circle').attr('r', 40).attr('fill', '#1f2937');
    fraudster.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('😈');
    fraudster.append('text').attr('text-anchor', 'middle').attr('dy', 70).attr('font-size', '14px').attr('fill', '#ef4444').attr('font-weight', 'bold').text('Fraudster');
    fraudster.transition().duration(800).delay(300).style('opacity', 1);

    // CP1 (terminating)
    const cp1 = svg.append('g').attr('transform', 'translate(350, 200)').style('opacity', 0);
    cp1.append('rect').attr('x', -50).attr('y', -40).attr('width', 100).attr('height', 80).attr('rx', 8).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('fill', 'white').attr('font-weight', 'bold').text('CP1');
    cp1.transition().duration(800).delay(600).style('opacity', 1);

    // Victim
    const victim = svg.append('g').attr('transform', 'translate(600, 200)').style('opacity', 0);
    victim.append('circle').attr('r', 40).attr('fill', '#10b981');
    victim.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('👤');
    victim.append('text').attr('text-anchor', 'middle').attr('dy', 70).attr('font-size', '14px').attr('fill', '#10b981').attr('font-weight', 'bold').text('Victim');
    victim.transition().duration(800).delay(900).style('opacity', 1);

    // Spoofed call attempt
    setTimeout(() => {
        const callLine = svg.append('path')
            .attr('d', 'M 150 200 L 290 200')
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 3)
            .attr('stroke-dasharray', '10,5')
            .style('opacity', 0);
        callLine.transition().duration(600).style('opacity', 1);

        const fakeLabel = svg.append('text')
            .attr('x', 220).attr('y', 180)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#ef4444')
            .attr('font-weight', 'bold')
            .text('Spoofed Call')
            .style('opacity', 0);
        fakeLabel.transition().duration(600).delay(200).style('opacity', 1);
    }, 1500);

    // Auth check fails
    setTimeout(() => {
        const xMark = svg.append('g').attr('transform', 'translate(350, 120)').style('opacity', 0);
        xMark.append('circle').attr('r', 30).attr('fill', '#ef4444');
        xMark.append('text').attr('text-anchor', 'middle').attr('dy', 10).attr('font-size', '36px')
            .attr('fill', 'white').attr('font-weight', 'bold').text('✗');
        xMark.transition().duration(600).style('opacity', 1);

        const blockedLabel = svg.append('text')
            .attr('x', 350).attr('y', 90)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#ef4444')
            .attr('font-weight', 'bold')
            .text('Auth Failed - BLOCKED')
            .style('opacity', 0);
        blockedLabel.transition().duration(600).delay(200).style('opacity', 1);
    }, 2500);

    // No call to victim
    setTimeout(() => {
        const shield = svg.append('g').attr('transform', 'translate(600, 120)').style('opacity', 0);
        shield.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '40px').text('🛡️');
        shield.transition().duration(600).style('opacity', 1);

        const protectedLabel = svg.append('text')
            .attr('x', 600).attr('y', 90)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#10b981')
            .attr('font-weight', 'bold')
            .text('Protected')
            .style('opacity', 0);
        protectedLabel.transition().duration(600).delay(200).style('opacity', 1);
    }, 3500);
}

// Scene 7: STIR/SHAKEN Comparison - Side by side
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // STIR/SHAKEN column
    const stirColumn = svg.append('g').attr('transform', 'translate(150, 100)').style('opacity', 0);
    stirColumn.append('rect').attr('x', -100).attr('y', 0).attr('width', 200).attr('height', 280).attr('rx', 12)
        .attr('fill', '#fee').attr('stroke', '#f59e0b').attr('stroke-width', 2);
    stirColumn.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '20px')
        .attr('font-weight', 'bold').attr('fill', '#f59e0b').text('STIR/SHAKEN');

    const stirItems = [
        { y: 70, text: 'Attestation Levels', icon: '📊' },
        { y: 120, text: 'A, B, C ratings', icon: '🔤' },
        { y: 170, text: 'Complex PKI', icon: '🔐' },
        { y: 220, text: 'Cert Management', icon: '📜' },
        { y: 260, text: 'Unclear Results', icon: '🤷' }
    ];

    stirItems.forEach((item, i) => {
        const g = stirColumn.append('g').attr('transform', `translate(0, ${item.y})`);
        g.append('text').attr('text-anchor', 'middle').attr('x', -50).attr('font-size', '20px').text(item.icon);
        g.append('text').attr('text-anchor', 'start').attr('x', -25).attr('dy', 5)
            .attr('font-size', '13px').attr('fill', '#78350f').text(item.text);
    });

    stirColumn.transition().duration(800).delay(300).style('opacity', 1);

    // PSTN2 column
    const pstn2Column = svg.append('g').attr('transform', 'translate(550, 100)').style('opacity', 0);
    pstn2Column.append('rect').attr('x', -100).attr('y', 0).attr('width', 200).attr('height', 280).attr('rx', 12)
        .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
    pstn2Column.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '20px')
        .attr('font-weight', 'bold').attr('fill', '#10b981').text('PSTN2');

    const pstn2Items = [
        { y: 70, text: 'Yes/No Answer', icon: '✓' },
        { y: 120, text: 'Definitive', icon: '✔️' },
        { y: 170, text: 'Direct Queries', icon: '📨' },
        { y: 220, text: 'No Certificates', icon: '🚫' },
        { y: 260, text: 'Clear Results', icon: '💯' }
    ];

    pstn2Items.forEach((item, i) => {
        const g = pstn2Column.append('g').attr('transform', `translate(0, ${item.y})`);
        g.append('text').attr('text-anchor', 'middle').attr('x', -50).attr('font-size', '20px').text(item.icon);
        g.append('text').attr('text-anchor', 'start').attr('x', -25).attr('dy', 5)
            .attr('font-size', '13px').attr('fill', '#065f46').text(item.text);
    });

    pstn2Column.transition().duration(800).delay(900).style('opacity', 1);
}

// Scene 8: Security - Show security layers
function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    const securityLayers = [
        { y: 80, label: 'TLS 1.3 Encryption', icon: '🔒', color: '#3b82f6' },
        { y: 160, label: 'Message Signing', icon: '✍️', color: '#10b981' },
        { y: 240, label: 'Rate Limiting', icon: '⏱️', color: '#f59e0b' },
        { y: 320, label: 'Audit Logging', icon: '📝', color: '#8b5cf6' }
    ];

    securityLayers.forEach((layer, i) => {
        const g = svg.append('g').attr('transform', `translate(350, ${layer.y})`).style('opacity', 0);

        g.append('rect')
            .attr('x', -150)
            .attr('y', -30)
            .attr('width', 300)
            .attr('height', 60)
            .attr('rx', 8)
            .attr('fill', layer.color)
            .attr('opacity', 0.2)
            .attr('stroke', layer.color)
            .attr('stroke-width', 2);

        g.append('text')
            .attr('x', -120)
            .attr('dy', 5)
            .attr('font-size', '30px')
            .text(layer.icon);

        g.append('text')
            .attr('x', -70)
            .attr('dy', 8)
            .attr('font-size', '18px')
            .attr('font-weight', 'bold')
            .attr('fill', layer.color)
            .text(layer.label);

        g.transition().duration(600).delay(500 + i * 400).style('opacity', 1);
    });
}

// Scene 9: Implementation - API endpoint diagram
function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // CP Server (moved up by 70px)
    const server = svg.append('g').attr('transform', 'translate(350, 50)').style('opacity', 0);
    server.append('rect').attr('x', -80).attr('y', -50).attr('width', 160).attr('height', 100).attr('rx', 8)
        .attr('fill', '#3b82f6').attr('stroke', '#1e40af').attr('stroke-width', 2);
    server.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('fill', 'white')
        .attr('font-size', '20px').attr('font-weight', 'bold').text('CP Server');
    server.transition().duration(800).delay(300).style('opacity', 1);

    // API Endpoint (moved up by 70px)
    const api = svg.append('g').attr('transform', 'translate(350, 170)').style('opacity', 0);
    api.append('rect').attr('x', -120).attr('y', -35).attr('width', 240).attr('height', 70).attr('rx', 8)
        .attr('fill', '#10b981').attr('stroke', '#059669').attr('stroke-width', 2);
    api.append('text').attr('text-anchor', 'middle').attr('dy', -8).attr('fill', 'white')
        .attr('font-size', '14px').attr('font-weight', 'bold').text('POST /auth/verify');
    api.append('text').attr('text-anchor', 'middle').attr('dy', 15).attr('fill', 'white')
        .attr('font-size', '12px').text('Check origination & respond');
    api.transition().duration(800).delay(800).style('opacity', 1);

    // Database (moved up by 70px)
    const db = svg.append('g').attr('transform', 'translate(350, 270)').style('opacity', 0);
    db.append('circle').attr('r', 35).attr('fill', '#8b5cf6');
    db.append('text').attr('text-anchor', 'middle').attr('dy', 8).attr('fill', 'white')
        .attr('font-size', '30px').text('💾');
    db.append('text').attr('text-anchor', 'middle').attr('dy', 65).attr('font-size', '12px')
        .attr('fill', '#8b5cf6').attr('font-weight', 'bold').text('Call Records');
    db.transition().duration(800).delay(1300).style('opacity', 1);

    // Arrows (adjusted for moved graphics)
    setTimeout(() => {
        [[350, 110, 350, 125], [350, 215, 350, 230]].forEach((coords, i) => {
            svg.append('path')
                .attr('d', `M ${coords[0]} ${coords[1]} L ${coords[2]} ${coords[3]}`)
                .attr('stroke', '#6b7280')
                .attr('stroke-width', 2)
                .attr('marker-end', 'url(#arrow-gray)')
                .style('opacity', 0)
                .transition().duration(400).delay(i * 300).style('opacity', 1);
        });

        svg.append('defs').append('marker').attr('id', 'arrow-gray')
            .attr('markerWidth', 10).attr('markerHeight', 10).attr('refX', 9).attr('refY', 3).attr('orient', 'auto')
            .append('polygon').attr('points', '0 0, 10 3, 0 6').attr('fill', '#6b7280');
    }, 1800);
}

// Scene 10: Impact - Show before/after metrics
function setupScene10() {
    const svg = d3.select('#scene-10-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Before column
    const before = svg.append('g').attr('transform', 'translate(175, 100)').style('opacity', 0);
    before.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', '18px')
        .attr('font-weight', 'bold').attr('fill', '#ef4444').text('Before PSTN2');

    const beforeStats = [
        { y: 50, value: '$38B', label: 'Fraud Losses', color: '#ef4444' },
        { y: 130, value: '90%', label: 'Distrust Calls', color: '#ef4444' },
        { y: 210, value: '0%', label: 'Verification', color: '#ef4444' }
    ];

    beforeStats.forEach((stat, i) => {
        const g = before.append('g').attr('transform', `translate(0, ${stat.y})`);
        g.append('rect').attr('x', -70).attr('y', 0).attr('width', 140).attr('height', 60).attr('rx', 8)
            .attr('fill', '#fee').attr('stroke', stat.color).attr('stroke-width', 2);
        g.append('text').attr('text-anchor', 'middle').attr('y', 28).attr('font-size', '24px')
            .attr('font-weight', 'bold').attr('fill', stat.color).text(stat.value);
        g.append('text').attr('text-anchor', 'middle').attr('y', 48).attr('font-size', '12px')
            .attr('fill', '#991b1b').text(stat.label);
    });

    before.transition().duration(800).delay(300).style('opacity', 1);

    // After column
    const after = svg.append('g').attr('transform', 'translate(525, 100)').style('opacity', 0);
    after.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', '18px')
        .attr('font-weight', 'bold').attr('fill', '#10b981').text('With PSTN2');

    const afterStats = [
        { y: 50, value: '$6B', label: '80% Reduction', color: '#10b981' },
        { y: 130, value: '95%', label: 'Trust Calls', color: '#10b981' },
        { y: 210, value: '100%', label: 'Verification', color: '#10b981' }
    ];

    afterStats.forEach((stat, i) => {
        const g = after.append('g').attr('transform', `translate(0, ${stat.y})`);
        g.append('rect').attr('x', -70).attr('y', 0).attr('width', 140).attr('height', 60).attr('rx', 8)
            .attr('fill', '#d1fae5').attr('stroke', stat.color).attr('stroke-width', 2);
        g.append('text').attr('text-anchor', 'middle').attr('y', 28).attr('font-size', '24px')
            .attr('font-weight', 'bold').attr('fill', stat.color).text(stat.value);
        g.append('text').attr('text-anchor', 'middle').attr('y', 48).attr('font-size', '12px')
            .attr('fill', '#065f46').text(stat.label);
    });

    after.transition().duration(800).delay(900).style('opacity', 1);

    // Arrow between
    setTimeout(() => {
        const arrow = svg.append('path')
            .attr('d', 'M 260 200 L 430 200')
            .attr('stroke', '#10b981')
            .attr('stroke-width', 4)
            .attr('marker-end', 'url(#arrow-impact)')
            .style('opacity', 0);

        svg.append('defs').append('marker').attr('id', 'arrow-impact')
            .attr('markerWidth', 12).attr('markerHeight', 12).attr('refX', 11).attr('refY', 3).attr('orient', 'auto')
            .append('polygon').attr('points', '0 0, 12 3, 0 6').attr('fill', '#10b981');

        arrow.transition().duration(800).style('opacity', 1);
    }, 1800);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextScene();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousScene();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        togglePlay();
    }
});
