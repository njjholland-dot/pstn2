// PSTN2 Authentication Option 2: Token Pool Animation

let currentScene = 1;
const totalScenes = 11;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

const sceneDurations = {
    "1": 13000,
    "2": 13000,
    "3": 12000,
    "4": 12000,
    "5": 13000,
    "6": 11000,
    "7": 12000,
    "8": 13000,
    "9": 13000,
    "10": 12000,
    "11": 13000
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

function setupScene1() {
    const svg = d3.select('#scene-1-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Title
    svg.append('text')
        .attr('x', 350)
        .attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('font-size', '20px')
        .attr('font-weight', 'bold')
        .attr('fill', '#1f2937')
        .text('Direct Query vs Token Pool');

    // Option 1: Direct Query (left side)
    const option1 = svg.append('g').attr('transform', 'translate(80, 100)');

    option1.append('text')
        .attr('x', 90)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#3b82f6')
        .text('Option 1: Direct Query');

    // CP1
    const cp1 = option1.append('g').attr('transform', 'translate(20, 40)');
    cp1.append('circle').attr('r', 30).attr('fill', '#3b82f6').style('opacity', 0)
        .transition().duration(600).delay(300).style('opacity', 1);
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '24px').text('📱').style('opacity', 0)
        .transition().duration(600).delay(300).style('opacity', 1);
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 50)
        .attr('font-size', '12px').attr('fill', '#1f2937').text('CP1').style('opacity', 0)
        .transition().duration(600).delay(300).style('opacity', 1);

    // CP2
    const cp2 = option1.append('g').attr('transform', 'translate(160, 40)');
    cp2.append('circle').attr('r', 30).attr('fill', '#10b981').style('opacity', 0)
        .transition().duration(600).delay(500).style('opacity', 1);
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '24px').text('📡').style('opacity', 0)
        .transition().duration(600).delay(500).style('opacity', 1);
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 50)
        .attr('font-size', '12px').attr('fill', '#1f2937').text('CP2').style('opacity', 0)
        .transition().duration(600).delay(500).style('opacity', 1);

    // Bidirectional arrow
    setTimeout(() => {
        option1.append('path')
            .attr('d', 'M 55 40 L 125 40')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrow)')
            .style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        option1.append('path')
            .attr('d', 'M 125 50 L 55 50')
            .attr('stroke', '#10b981')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrow)')
            .style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        option1.append('text')
            .attr('x', 90)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#6b7280')
            .text('Direct messaging').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 700);

    // Option 2: Token Pool (right side)
    const option2 = svg.append('g').attr('transform', 'translate(420, 100)');

    option2.append('text')
        .attr('x', 90)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#8b5cf6')
        .text('Option 2: Token Pool').style('opacity', 0)
        .transition().duration(600).delay(900).style('opacity', 1);

    // CP1
    const cp1b = option2.append('g').attr('transform', 'translate(20, 80)');
    cp1b.append('circle').attr('r', 25).attr('fill', '#3b82f6').style('opacity', 0)
        .transition().duration(600).delay(1100).style('opacity', 1);
    cp1b.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '20px').text('📱').style('opacity', 0)
        .transition().duration(600).delay(1100).style('opacity', 1);
    cp1b.append('text').attr('text-anchor', 'middle').attr('y', 45)
        .attr('font-size', '10px').attr('fill', '#1f2937').text('CP1').style('opacity', 0)
        .transition().duration(600).delay(1100).style('opacity', 1);

    // Token Pool (center)
    const pool = option2.append('g').attr('transform', 'translate(90, 30)');
    pool.append('rect')
        .attr('width', 60)
        .attr('height', 50)
        .attr('rx', 5)
        .attr('fill', '#8b5cf6')
        .style('opacity', 0)
        .transition().duration(600).delay(1300).style('opacity', 1);
    pool.append('text')
        .attr('x', 30)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-size', '20px')
        .text('🎫').style('opacity', 0)
        .transition().duration(600).delay(1300).style('opacity', 1);
    pool.append('text')
        .attr('x', 30)
        .attr('y', 65)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#1f2937')
        .text('Token Pool').style('opacity', 0)
        .transition().duration(600).delay(1300).style('opacity', 1);

    // CP2
    const cp2b = option2.append('g').attr('transform', 'translate(160, 80)');
    cp2b.append('circle').attr('r', 25).attr('fill', '#10b981').style('opacity', 0)
        .transition().duration(600).delay(1500).style('opacity', 1);
    cp2b.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '20px').text('📡').style('opacity', 0)
        .transition().duration(600).delay(1500).style('opacity', 1);
    cp2b.append('text').attr('text-anchor', 'middle').attr('y', 45)
        .attr('font-size', '10px').attr('fill', '#1f2937').text('CP2').style('opacity', 0)
        .transition().duration(600).delay(1500).style('opacity', 1);

    // Arrows to/from pool
    setTimeout(() => {
        // Define arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 9)
            .attr('refY', 5)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', '#f59e0b');

        option2.append('path')
            .attr('d', 'M 45 70 L 85 60')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrow)')
            .style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        option2.append('path')
            .attr('d', 'M 155 70 L 155 60')
            .attr('stroke', '#10b981')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrow)')
            .style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        option2.append('text')
            .attr('x', 50)
            .attr('y', 60)
            .attr('font-size', '9px')
            .attr('fill', '#6b7280')
            .text('Write').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        option2.append('text')
            .attr('x', 160)
            .attr('y', 60)
            .attr('font-size', '9px')
            .attr('fill', '#6b7280')
            .text('Read').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 1700);

    // Benefits comparison
    const benefits = svg.append('g').attr('transform', 'translate(50, 220)');

    const compareItems = [
        { x: 0, label: 'Full Control', opt1: '✓', opt2: '—', color1: '#10b981', color2: '#9ca3af' },
        { x: 150, label: 'Simplicity', opt1: '—', opt2: '✓', color1: '#9ca3af', color2: '#10b981' },
        { x: 300, label: 'Scalability', opt1: '—', opt2: '✓', color1: '#9ca3af', color2: '#10b981' },
        { x: 450, label: 'No Governance', opt1: '✓', opt2: '—', color1: '#10b981', color2: '#9ca3af' }
    ];

    compareItems.forEach((item, i) => {
        const g = benefits.append('g').attr('transform', `translate(${item.x}, 0)`).style('opacity', 0)
            .transition().duration(600).delay(1900 + i * 200).style('opacity', 1);

        g.append('text')
            .attr('x', 60)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .attr('fill', '#1f2937')
            .text(item.label);

        g.append('text')
            .attr('x', 30)
            .attr('y', 25)
            .attr('text-anchor', 'middle')
            .attr('font-size', '16px')
            .attr('fill', item.color1)
            .text(item.opt1);

        g.append('text')
            .attr('x', 90)
            .attr('y', 25)
            .attr('text-anchor', 'middle')
            .attr('font-size', '16px')
            .attr('fill', item.color2)
            .text(item.opt2);
    });
}
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Define arrow marker
    svg.append('defs').append('marker')
        .attr('id', 'arrow-gen')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#f59e0b');

    // CP1 initiating call
    const cp1 = svg.append('g').attr('transform', 'translate(100, 150)').style('opacity', 0);
    cp1.append('circle').attr('r', 40).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '30px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '14px').attr('fill', '#1f2937').text('CP1');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 80)
        .attr('font-size', '11px').attr('fill', '#6b7280').text('Originating');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    // Step 1: Generate token
    setTimeout(() => {
        const tokenBox = svg.append('g').attr('transform', 'translate(250, 120)').style('opacity', 0);
        tokenBox.append('rect')
            .attr('width', 200)
            .attr('height', 120)
            .attr('rx', 5)
            .attr('fill', '#fef3c7')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2);

        tokenBox.append('text')
            .attr('x', 100)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', '#92400e')
            .text('Token Generated');

        const fields = [
            { y: 45, label: 'From:', value: '+442071234567' },
            { y: 65, label: 'To:', value: '+14155551234' },
            { y: 85, label: 'Time:', value: '2025-01-15 14:23:11' },
            { y: 105, label: 'Expires:', value: '30 seconds' }
        ];

        fields.forEach(field => {
            tokenBox.append('text')
                .attr('x', 10)
                .attr('y', field.y)
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#92400e')
                .text(field.label);

            tokenBox.append('text')
                .attr('x', 50)
                .attr('y', field.y)
                .attr('font-size', '10px')
                .attr('fill', '#78350f')
                .text(field.value);
        });

        tokenBox.transition().duration(800).style('opacity', 1);
    }, 500);

    // Step 2: Arrow to pool
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 450 180 L 540 180')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-gen)')
            .style('opacity', 0)
            .transition().duration(600).style('opacity', 1);

        svg.append('text')
            .attr('x', 495)
            .attr('y', 170)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('fill', '#92400e')
            .text('Write token').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 1500);

    // Token Pool
    setTimeout(() => {
        const pool = svg.append('g').attr('transform', 'translate(540, 130)').style('opacity', 0);
        pool.append('rect')
            .attr('width', 80)
            .attr('height', 100)
            .attr('rx', 5)
            .attr('fill', '#8b5cf6')
            .attr('stroke', '#6d28d9')
            .attr('stroke-width', 2);

        pool.append('text')
            .attr('x', 40)
            .attr('y', 35)
            .attr('text-anchor', 'middle')
            .attr('font-size', '30px')
            .text('🎫');

        pool.append('text')
            .attr('x', 40)
            .attr('y', 70)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'white')
            .attr('font-weight', 'bold')
            .text('Token');

        pool.append('text')
            .attr('x', 40)
            .attr('y', 85)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'white')
            .attr('font-weight', 'bold')
            .text('Pool');

        pool.transition().duration(600).style('opacity', 1);
    }, 2100);

    // Expiry timer
    setTimeout(() => {
        const timer = svg.append('g').attr('transform', 'translate(560, 250)').style('opacity', 0);
        timer.append('text')
            .attr('x', 20)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .text('⏱️');

        timer.append('text')
            .attr('x', 20)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#6b7280')
            .text('30s TTL');

        timer.transition().duration(600).style('opacity', 1);
    }, 2700);
}
function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return;

    svg.selectAll('*').remove();

    // Define markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-verify')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#10b981');

    // Token Pool (appears first)
    const pool = svg.append('g').attr('transform', 'translate(310, 80)').style('opacity', 0);
    pool.append('rect').attr('width', 80).attr('height', 80).attr('rx', 5)
        .attr('fill', '#8b5cf6').attr('stroke', '#6d28d9').attr('stroke-width', 2);
    pool.append('text').attr('x', 40).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '30px').text('🎫');
    pool.append('text').attr('x', 40).attr('y', 65).attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', 'white').text('Token Pool');
    pool.transition().duration(600).delay(300).style('opacity', 1);

    // CP2 receiving call
    const cp2 = svg.append('g').attr('transform', 'translate(100, 220)').style('opacity', 0);
    cp2.append('circle').attr('r', 35).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '28px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 55)
        .attr('font-size', '13px').attr('fill', '#1f2937').text('CP2');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 73)
        .attr('font-size', '10px').attr('fill', '#6b7280').text('Terminating');
    cp2.transition().duration(600).delay(500).style('opacity', 1);

    // Step 1: Check pool (700ms)
    setTimeout(() => {
        svg.append('path').attr('d', 'M 135 205 L 310 150')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-verify)').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 210).attr('y', 170)
            .attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#92400e').text('1. Check token').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 700);

    // Step 2: Token found (1500ms)
    setTimeout(() => {
        const found = svg.append('g').attr('transform', 'translate(420, 100)').style('opacity', 0);
        found.append('circle').attr('r', 25).attr('fill', '#10b981');
        found.append('text').attr('text-anchor', 'middle').attr('dy', 8)
            .attr('font-size', '24px').text('✓');
        found.append('text').attr('text-anchor', 'middle').attr('y', 45)
            .attr('font-size', '11px').attr('fill', '#065f46').text('Match!');
        found.transition().duration(600).style('opacity', 1);
    }, 1500);

    // Step 3: Consume token (2300ms)
    setTimeout(() => {
        svg.append('path').attr('d', 'M 390 130 L 500 130')
            .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('stroke-dasharray', '5,5')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 550).attr('y', 120)
            .attr('font-size', '10px').attr('fill', '#991b1b').text('2. Token').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 550).attr('y', 135)
            .attr('font-size', '10px').attr('fill', '#991b1b').text('consumed').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 2300);

    // Step 4: Authentication success (3100ms)
    setTimeout(() => {
        const success = svg.append('g').attr('transform', 'translate(520, 220)').style('opacity', 0);
        success.append('rect').attr('width', 140).attr('height', 50).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        success.append('text').attr('x', 70).attr('y', 20)
            .attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('✓ Verified');
        success.append('text').attr('x', 70).attr('y', 38)
            .attr('text-anchor', 'middle').attr('font-size', '10px')
            .attr('fill', '#047857').text('Call accepted');
        success.transition().duration(800).style('opacity', 1);
    }, 3100);
}
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Consortium governance
    const consortium = svg.append('g').attr('transform', 'translate(250, 60)').style('opacity', 0);
    consortium.append('rect').attr('width', 200).attr('height', 60).attr('rx', 8)
        .attr('fill', '#3b82f6').attr('stroke', '#1e40af').attr('stroke-width', 2);
    consortium.append('text').attr('x', 100).attr('y', 30).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('fill', 'white').attr('font-weight', 'bold').text('Consortium');
    consortium.append('text').attr('x', 100).attr('y', 48).attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', '#dbeafe').text('Major CPs + Regulator');
    consortium.transition().duration(800).delay(300).style('opacity', 1);

    // Token Pool infrastructure
    const pools = [
        { x: 150, y: 180, label: 'Pool A' },
        { x: 300, y: 180, label: 'Pool B' },
        { x: 450, y: 180, label: 'Pool C' }
    ];

    pools.forEach((pool, i) => {
        const g = svg.append('g').attr('transform', `translate(${pool.x}, ${pool.y})`).style('opacity', 0);
        g.append('rect').attr('width', 70).attr('height', 70).attr('rx', 5)
            .attr('fill', '#8b5cf6').attr('stroke', '#6d28d9').attr('stroke-width', 2);
        g.append('text').attr('x', 35).attr('y', 35).attr('text-anchor', 'middle')
            .attr('font-size', '24px').text('🎫');
        g.append('text').attr('x', 35).attr('y', 60).attr('text-anchor', 'middle')
            .attr('font-size', '10px').attr('fill', 'white').text(pool.label);
        g.transition().duration(600).delay(900 + i * 200).style('opacity', 1);
    });

    // CPs using pools
    const cps = [
        { x: 80, y: 310, label: 'CP1', color: '#3b82f6' },
        { x: 250, y: 310, label: 'CP2', color: '#10b981' },
        { x: 420, y: 310, label: 'CP3', color: '#f59e0b' },
        { x: 590, y: 310, label: 'CP4', color: '#ef4444' }
    ];

    cps.forEach((cp, i) => {
        const g = svg.append('g').attr('transform', `translate(${cp.x}, ${cp.y})`).style('opacity', 0);
        g.append('circle').attr('r', 25).attr('fill', cp.color);
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '20px').text('📡');
        g.append('text').attr('text-anchor', 'middle').attr('y', 45)
            .attr('font-size', '10px').attr('fill', '#1f2937').text(cp.label);
        g.transition().duration(600).delay(1500 + i * 150).style('opacity', 1);
    });
}

function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Small CP (left)
    const smallCP = svg.append('g').attr('transform', 'translate(80, 150)').style('opacity', 0);
    smallCP.append('circle').attr('r', 30).attr('fill', '#10b981');
    smallCP.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '24px').text('🏢');
    smallCP.append('text').attr('text-anchor', 'middle').attr('y', 50)
        .attr('font-size', '12px').attr('fill', '#1f2937').text('Small CP');
    smallCP.append('text').attr('text-anchor', 'middle').attr('y', 67)
        .attr('font-size', '10px').attr('fill', '#6b7280').text('10K users');
    smallCP.transition().duration(600).delay(300).style('opacity', 1);

    // Simple API integration
    setTimeout(() => {
        const api = svg.append('g').attr('transform', 'translate(200, 130)').style('opacity', 0);
        api.append('rect').attr('width', 120).attr('height', 70).attr('rx', 5)
            .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        api.append('text').attr('x', 60).attr('y', 25).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1e40af').text('Simple API');
        api.append('text').attr('x', 60).attr('y', 45).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', '#1e40af').text('• Write tokens');
        api.append('text').attr('x', 60).attr('y', 60).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', '#1e40af').text('• Read tokens');
        api.transition().duration(600).style('opacity', 1);
    }, 900);

    // Token Pool (right)
    setTimeout(() => {
        const pool = svg.append('g').attr('transform', 'translate(400, 130)').style('opacity', 0);
        pool.append('rect').attr('width', 100).attr('height', 90).attr('rx', 5)
            .attr('fill', '#8b5cf6').attr('stroke', '#6d28d9').attr('stroke-width', 2);
        pool.append('text').attr('x', 50).attr('y', 40).attr('text-anchor', 'middle')
            .attr('font-size', '30px').text('🎫');
        pool.append('text').attr('x', 50).attr('y', 70).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', 'white').text('Token Pool');
        pool.transition().duration(600).style('opacity', 1);
    }, 1500);

    // Benefits
    const benefits = [
        { y: 270, icon: '✓', text: 'No infrastructure to manage', color: '#10b981' },
        { y: 295, icon: '✓', text: 'No incoming API to implement', color: '#10b981' },
        { y: 320, icon: '✓', text: 'Lower development cost', color: '#10b981' }
    ];

    benefits.forEach((benefit, i) => {
        setTimeout(() => {
            const g = svg.append('g').attr('transform', `translate(150, ${benefit.y})`).style('opacity', 0);
            g.append('text').attr('x', 0).attr('y', 0)
                .attr('font-size', '16px').attr('fill', benefit.color).text(benefit.icon);
            g.append('text').attr('x', 25).attr('y', 0)
                .attr('font-size', '12px').attr('fill', '#1f2937').text(benefit.text);
            g.transition().duration(600).style('opacity', 1);
        }, 2100 + i * 200);
    });
}

function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Three token pools
    const pools = [
        { x: 150, y: 120, label: 'Pool US-East', status: 'Active' },
        { x: 350, y: 120, label: 'Pool US-West', status: 'Active' },
        { x: 550, y: 120, label: 'Pool EU', status: 'Down ✗' }
    ];

    pools.forEach((pool, i) => {
        const g = svg.append('g').attr('transform', `translate(${pool.x}, ${pool.y})`).style('opacity', 0);
        const isDown = pool.status.includes('Down');
        g.append('rect').attr('width', 90).attr('height', 80).attr('rx', 5)
            .attr('fill', isDown ? '#fee2e2' : '#8b5cf6')
            .attr('stroke', isDown ? '#ef4444' : '#6d28d9').attr('stroke-width', 2);
        g.append('text').attr('x', 45).attr('y', 35).attr('text-anchor', 'middle')
            .attr('font-size', '24px').text(isDown ? '❌' : '🎫');
        g.append('text').attr('x', 45).attr('y', 58).attr('text-anchor', 'middle')
            .attr('font-size', '10px').attr('fill', isDown ? '#991b1b' : 'white').text(pool.label);
        g.append('text').attr('x', 45).attr('y', 73).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', isDown ? '#991b1b' : '#ddd6fe').text(pool.status);
        g.transition().duration(600).delay(300 + i * 200).style('opacity', 1);
    });

    // CPs (bottom)
    const cps = [
        { x: 100, label: 'CP1' },
        { x: 300, label: 'CP2' },
        { x: 500, label: 'CP3' }
    ];

    cps.forEach((cp, i) => {
        const g = svg.append('g').attr('transform', `translate(${cp.x}, 280)`).style('opacity', 0);
        g.append('circle').attr('r', 25).attr('fill', '#3b82f6');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '20px').text('📡');
        g.append('text').attr('text-anchor', 'middle').attr('y', 43)
            .attr('font-size', '10px').attr('fill', '#1f2937').text(cp.label);
        g.transition().duration(600).delay(1200 + i * 150).style('opacity', 1);
    });

    // Arrows showing redundancy
    setTimeout(() => {
        svg.append('path').attr('d', 'M 125 265 L 175 200')
            .attr('stroke', '#10b981').attr('stroke-width', 2).attr('stroke-dasharray', '4,2')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('path').attr('d', 'M 300 265 L 375 200')
            .attr('stroke', '#10b981').attr('stroke-width', 2).attr('stroke-dasharray', '4,2')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1800);
}
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Security layers
    const securityLayers = [
        { y: 70, label: 'Encryption (TLS)', icon: '🔒', color: '#3b82f6' },
        { y: 140, label: 'Token Signing', icon: '✍️', color: '#10b981' },
        { y: 210, label: 'Rate Limiting', icon: '⏱️', color: '#f59e0b' },
        { y: 280, label: 'Audit Logging', icon: '📋', color: '#8b5cf6' },
        { y: 350, label: 'Network Isolation', icon: '🛡️', color: '#ef4444' }
    ];

    securityLayers.forEach((layer, i) => {
        const g = svg.append('g').attr('transform', `translate(250, ${layer.y})`).style('opacity', 0);
        g.append('rect').attr('width', 200).attr('height', 50).attr('rx', 5)
            .attr('fill', layer.color).attr('opacity', 0.2).attr('stroke', layer.color).attr('stroke-width', 2);
        g.append('text').attr('x', 15).attr('y', 30).attr('font-size', '24px').text(layer.icon);
        g.append('text').attr('x', 55).attr('y', 32).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#1f2937').text(layer.label);
        g.transition().duration(600).delay(300 + i * 200).style('opacity', 1);
    });
}

function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Small CP comparison
    svg.append('text').attr('x', 350).attr('y', 30).attr('text-anchor', 'middle')
        .attr('font-size', '18px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Small CP: Before vs After');

    // Before (left) - complex
    const before = svg.append('g').attr('transform', 'translate(80, 80)');
    before.append('text').attr('x', 90).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#ef4444').text('Option 1: Complex');

    before.append('circle').attr('cx', 90).attr('cy', 60).attr('r', 30)
        .attr('fill', '#10b981').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);
    before.append('text').attr('x', 90).attr('y', 65).attr('text-anchor', 'middle')
        .attr('font-size', '20px').text('🏢').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const tasks = [
        { y: 130, text: '❌ Build auth API', color: '#ef4444' },
        { y: 155, text: '❌ Handle queries', color: '#ef4444' },
        { y: 180, text: '❌ Manage infra', color: '#ef4444' },
        { y: 205, text: '❌ High cost', color: '#ef4444' }
    ];

    tasks.forEach((task, i) => {
        before.append('text').attr('x', 10).attr('y', task.y)
            .attr('font-size', '11px').attr('fill', task.color).text(task.text)
            .style('opacity', 0).transition().duration(600).delay(900 + i * 150).style('opacity', 1);
    });

    // After (right) - simple
    const after = svg.append('g').attr('transform', 'translate(420, 80)');
    after.append('text').attr('x', 90).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#10b981').text('Option 2: Simple').style('opacity', 0)
        .transition().duration(600).delay(1500).style('opacity', 1);

    after.append('circle').attr('cx', 90).attr('cy', 60).attr('r', 30)
        .attr('fill', '#10b981').style('opacity', 0).transition().duration(600).delay(1700).style('opacity', 1);
    after.append('text').attr('x', 90).attr('y', 65).attr('text-anchor', 'middle')
        .attr('font-size', '20px').text('🏢').style('opacity', 0).transition().duration(600).delay(1700).style('opacity', 1);

    const benefits = [
        { y: 130, text: '✓ Use token pool API', color: '#10b981' },
        { y: 155, text: '✓ No incoming queries', color: '#10b981' },
        { y: 180, text: '✓ Shared infra', color: '#10b981' },
        { y: 205, text: '✓ Low cost', color: '#10b981' }
    ];

    benefits.forEach((benefit, i) => {
        after.append('text').attr('x', 10).attr('y', benefit.y)
            .attr('font-size', '11px').attr('fill', benefit.color).text(benefit.text)
            .style('opacity', 0).transition().duration(600).delay(2100 + i * 150).style('opacity', 1);
    });
}

function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Hybrid approach
    svg.append('text').attr('x', 350).attr('y', 35).attr('text-anchor', 'middle')
        .attr('font-size', '18px').attr('font-weight', 'bold').attr('fill', '#1f2937').text('Hybrid Deployment');

    // Large CP (left)
    const largeCP = svg.append('g').attr('transform', 'translate(80, 120)').style('opacity', 0);
    largeCP.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    largeCP.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('🏢');
    largeCP.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '12px')
        .attr('fill', '#1f2937').text('Large CP');
    largeCP.append('text').attr('text-anchor', 'middle').attr('y', 72).attr('font-size', '10px')
        .attr('fill', '#6b7280').text('Direct queries');
    largeCP.transition().duration(600).delay(300).style('opacity', 1);

    // Small CP (left bottom)
    const smallCP = svg.append('g').attr('transform', 'translate(80, 260)').style('opacity', 0);
    smallCP.append('circle').attr('r', 28).attr('fill', '#10b981');
    smallCP.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '20px').text('🏢');
    smallCP.append('text').attr('text-anchor', 'middle').attr('y', 48).attr('font-size', '11px')
        .attr('fill', '#1f2937').text('Small CP');
    smallCP.append('text').attr('text-anchor', 'middle').attr('y', 63).attr('font-size', '9px')
        .attr('fill', '#6b7280').text('Token pool');
    smallCP.transition().duration(600).delay(500).style('opacity', 1);

    // Token Pool (center)
    setTimeout(() => {
        const pool = svg.append('g').attr('transform', 'translate(310, 180)').style('opacity', 0);
        pool.append('rect').attr('width', 80).attr('height', 80).attr('rx', 5)
            .attr('fill', '#8b5cf6').attr('stroke', '#6d28d9').attr('stroke-width', 2);
        pool.append('text').attr('x', 40).attr('y', 40).attr('text-anchor', 'middle')
            .attr('font-size', '28px').text('🎫');
        pool.append('text').attr('x', 40).attr('y', 65).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('fill', 'white').text('Token Pool');
        pool.transition().duration(600).style('opacity', 1);
    }, 1100);

    // Terminating CP (right)
    setTimeout(() => {
        const termCP = svg.append('g').attr('transform', 'translate(550, 180)').style('opacity', 0);
        termCP.append('circle').attr('r', 40).attr('fill', '#f59e0b');
        termCP.append('text').attr('text-anchor', 'middle').attr('dy', 8).attr('font-size', '30px').text('📡');
        termCP.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '13px')
            .attr('fill', '#1f2937').text('Terminating');
        termCP.append('text').attr('text-anchor', 'middle').attr('y', 78).attr('font-size', '10px')
            .attr('fill', '#6b7280').text('Checks both');
        termCP.transition().duration(600).style('opacity', 1);
    }, 1700);

    // Arrows
    setTimeout(() => {
        svg.append('path').attr('d', 'M 120 130 L 540 200')
            .attr('stroke', '#3b82f6').attr('stroke-width', 2).attr('stroke-dasharray', '4,2')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('path').attr('d', 'M 115 255 L 305 235')
            .attr('stroke', '#10b981').attr('stroke-width', 2)
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('path').attr('d', 'M 390 220 L 510 200')
            .attr('stroke', '#8b5cf6').attr('stroke-width', 2)
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2300);
}

function setupScene10() {
    const svg = d3.select('#scene-10-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Trade-offs comparison
    svg.append('text').attr('x', 180).attr('y', 35).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#3b82f6').text('Option 1: Direct Query');
    svg.append('text').attr('x', 520).attr('y', 35).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#8b5cf6').text('Option 2: Token Pool');

    const pros1 = [
        { y: 80, text: '✓ Full control', color: '#10b981' },
        { y: 110, text: '✓ No governance', color: '#10b981' },
        { y: 140, text: '✓ Direct messaging', color: '#10b981' }
    ];

    const cons1 = [
        { y: 190, text: '✗ API required', color: '#ef4444' },
        { y: 220, text: '✗ Handle queries', color: '#ef4444' },
        { y: 250, text: '✗ More complexity', color: '#ef4444' }
    ];

    const pros2 = [
        { y: 80, text: '✓ Simplicity', color: '#10b981' },
        { y: 110, text: '✓ Scalability', color: '#10b981' },
        { y: 140, text: '✓ Shared infra', color: '#10b981' }
    ];

    const cons2 = [
        { y: 190, text: '✗ Governance needed', color: '#ef4444' },
        { y: 220, text: '✗ Central dependency', color: '#ef4444' },
        { y: 250, text: '✗ Less control', color: '#ef4444' }
    ];

    pros1.concat(cons1).forEach((item, i) => {
        svg.append('text').attr('x', 50).attr('y', item.y).attr('font-size', '12px')
            .attr('fill', item.color).text(item.text).style('opacity', 0)
            .transition().duration(500).delay(300 + i * 100).style('opacity', 1);
    });

    pros2.concat(cons2).forEach((item, i) => {
        svg.append('text').attr('x', 390).attr('y', item.y).attr('font-size', '12px')
            .attr('fill', item.color).text(item.text).style('opacity', 0)
            .transition().duration(500).delay(900 + i * 100).style('opacity', 1);
    });
}

function setupScene11() {
    const svg = d3.select('#scene-11-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Implementation path
    svg.append('text').attr('x', 350).attr('y', 30).attr('text-anchor', 'middle')
        .attr('font-size', '18px').attr('font-weight', 'bold').attr('fill', '#1f2937').text('Token Pool Operators');

    const operators = [
        { x: 100, y: 100, icon: '🏛️', label: 'Industry', sublabel: 'Consortiums' },
        { x: 300, y: 100, icon: '⚖️', label: 'Regulators', sublabel: 'Government' },
        { x: 500, y: 100, icon: '🏢', label: 'Commercial', sublabel: 'Providers' }
    ];

    operators.forEach((op, i) => {
        const g = svg.append('g').attr('transform', `translate(${op.x}, ${op.y})`).style('opacity', 0);
        g.append('circle').attr('r', 40).attr('fill', '#3b82f6').attr('opacity', 0.2)
            .attr('stroke', '#3b82f6').attr('stroke-width', 2);
        g.append('text').attr('text-anchor', 'middle').attr('dy', 8).attr('font-size', '30px').text(op.icon);
        g.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '13px')
            .attr('fill', '#1f2937').text(op.label);
        g.append('text').attr('text-anchor', 'middle').attr('y', 77).attr('font-size', '10px')
            .attr('fill', '#6b7280').text(op.sublabel);
        g.transition().duration(600).delay(300 + i * 200).style('opacity', 1);
    });

    // Key principles
    const principles = [
        { y: 230, icon: '🤝', text: 'Neutral and open access', color: '#10b981' },
        { y: 270, icon: '✓', text: 'All qualified CPs can join', color: '#10b981' },
        { y: 310, icon: '🌍', text: 'Democratizes authentication', color: '#10b981' }
    ];

    principles.forEach((principle, i) => {
        const g = svg.append('g').attr('transform', `translate(200, ${principle.y})`).style('opacity', 0);
        g.append('text').attr('x', 0).attr('y', 0).attr('font-size', '20px').text(principle.icon);
        g.append('text').attr('x', 35).attr('y', 0).attr('font-size', '14px')
            .attr('fill', principle.color).text(principle.text);
        g.transition().duration(600).delay(1200 + i * 200).style('opacity', 1);
    });
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
