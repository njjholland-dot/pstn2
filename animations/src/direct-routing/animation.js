// PSTN2 Direct Routing with Encryption Animation

let currentScene = 1;
const totalScenes = 12;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;
let speechSessionId = 0;
let narrationTimer = null;
let cachedVoices = [];

const sceneDurations = {
    "1": 11000,
    "2": 11000,
    "3": 13000,
    "4": 12000,
    "5": 12000,
    "6": 12000,
    "7": 13000,
    "8": 12000,
    "9": 13000,
    "10": 14000,
    "11": 13000,
    "12": 12000
};

document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    setupScene1();
    updateProgress();

    if ('speechSynthesis' in window) {
        cachedVoices = speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {
            cachedVoices = speechSynthesis.getVoices();
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
    // Cancel any current speech first; then take a fresh session id so this
    // utterance's own callbacks remain valid (stale sessions are ignored).
    stopSpeech();
    const thisSessionId = ++speechSessionId;

    if (!audioEnabled || !text) {
        if (onComplete) {
            setTimeout(() => {
                if (speechSessionId === thisSessionId) onComplete();
            }, 100);
        }
        return;
    }

    if ('speechSynthesis' in window) {
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;

        const voices = cachedVoices.length ? cachedVoices : speechSynthesis.getVoices();
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

        currentUtterance.onend = () => {
            if (onComplete && speechSessionId === thisSessionId) onComplete();
        };

        currentUtterance.onerror = (e) => {
            // Deliberate cancellation (scene change, stop) is not an error and
            // must not trigger the completion callback (would double-advance).
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.error('Speech error:', e);
            if (onComplete && speechSessionId === thisSessionId) onComplete();
        };

        speechSynthesis.speak(currentUtterance);
    } else if (onComplete) {
        if (speechSessionId === thisSessionId) onComplete();
    }
}

function stopSpeech() {
    // Invalidate any pending speech callbacks before cancelling
    speechSessionId++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    currentUtterance = null;
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const audioBtn = document.getElementById('audio-btn');
    if (audioEnabled) {
        audioBtn.textContent = '🔊 Audio On';
        audioBtn.classList.remove('audio-off');
        // Leaving audio-off mode: clear any timer-based auto-advance
        if (playInterval) {
            clearTimeout(playInterval);
            playInterval = null;
        }
        // If autoplaying, re-establish the speech auto-advance callback
        if (isPlaying) autoPlay();
        const narration = document.querySelector(`#scene-${currentScene} .narration`);
        if (narration) speak(narration.getAttribute('data-speech'), isPlaying ? speechEndCallback : null);
    } else {
        audioBtn.textContent = '🔇 Audio Off';
        audioBtn.classList.add('audio-off');
        stopSpeech();
        speechEndCallback = null;
        if (playInterval) {
            clearTimeout(playInterval);
            playInterval = null;
        }
        // If autoplaying, switch to timer-based auto-advance
        if (isPlaying) autoPlay();
    }
}

function previousScene() { if (currentScene > 1) goToScene(currentScene - 1); else window.location.href = '/index.html'; }
function nextScene() { if (currentScene < totalScenes) goToScene(currentScene + 1); else window.location.href = '/index.html'; }

function goToScene(sceneNumber) {
    // Cancel any pending narration from a previous scene change
    if (narrationTimer) {
        clearTimeout(narrationTimer);
        narrationTimer = null;
    }
    stopSpeech();

    document.getElementById(`scene-${currentScene}`).style.display = 'none';
    currentScene = sceneNumber;
    document.getElementById(`scene-${currentScene}`).style.display = 'block';
    setupSceneAnimations(currentScene);
    updateButtons();
    updateProgress();
    document.getElementById('current-scene').textContent = currentScene;

    narrationTimer = setTimeout(() => {
        narrationTimer = null;
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
        if (audioEnabled) {
            // (Re)start the current scene's narration with the auto-advance callback
            const narration = document.querySelector(`#scene-${currentScene} .narration`);
            if (narration) speak(narration.getAttribute('data-speech'), speechEndCallback);
        }
    } else {
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
        speechEndCallback = null;
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
                speechEndCallback = null;
                document.getElementById('play-btn').textContent = '▶ Play';
                document.getElementById('play-btn').classList.remove('playing');
            }
        };
    } else {
        const duration = sceneDurations[currentScene];
        playInterval = setTimeout(() => {
            if (!isPlaying) return;
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

    // Traditional routing: CP1 → Transit1 → Transit2 → CP2
    const cp1 = svg.append('g').attr('transform', 'translate(50, 200)').style('opacity', 0);
    cp1.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    const transit1 = svg.append('g').attr('transform', 'translate(220, 200)').style('opacity', 0);
    transit1.append('circle').attr('r', 30).attr('fill', '#ef4444');
    transit1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '22px').text('💵');
    transit1.append('text').attr('text-anchor', 'middle').attr('y', 50).attr('font-size', '11px').attr('fill', '#1f2937').text('Transit 1');
    transit1.transition().duration(600).delay(600).style('opacity', 1);

    const transit2 = svg.append('g').attr('transform', 'translate(400, 200)').style('opacity', 0);
    transit2.append('circle').attr('r', 30).attr('fill', '#ef4444');
    transit2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '22px').text('💵');
    transit2.append('text').attr('text-anchor', 'middle').attr('y', 50).attr('font-size', '11px').attr('fill', '#1f2937').text('Transit 2');
    transit2.transition().duration(600).delay(900).style('opacity', 1);

    const cp2 = svg.append('g').attr('transform', 'translate(580, 200)').style('opacity', 0);
    cp2.append('circle').attr('r', 35).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP2');
    cp2.transition().duration(600).delay(1200).style('opacity', 1);

    // Animated call flow
    setTimeout(() => {
        const defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-route').attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse').append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#f59e0b');

        svg.append('path').attr('d', 'M 90 200 L 185 200')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrow-route)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('path').attr('d', 'M 255 200 L 365 200')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrow-route)')
            .style('opacity', 0).transition().duration(800).delay(400).style('opacity', 1);
        svg.append('path').attr('d', 'M 435 200 L 540 200')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrow-route)')
            .style('opacity', 0).transition().duration(800).delay(800).style('opacity', 1);
    }, 1500);

    // Cost labels
    setTimeout(() => {
        svg.append('text').attr('x', 220).attr('y', 160).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#dc2626').attr('font-weight', 'bold').text('$$')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 400).attr('y', 160).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#dc2626').attr('font-weight', 'bold').text('$$')
            .style('opacity', 0).transition().duration(600).delay(200).style('opacity', 1);
    }, 2500);
}
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Direct routing: CP1 → CP2
    const cp1 = svg.append('g').attr('transform', 'translate(180, 200)').style('opacity', 0);
    cp1.append('circle').attr('r', 40).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px').attr('fill', '#1f2937').text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    const cp2 = svg.append('g').attr('transform', 'translate(520, 200)').style('opacity', 0);
    cp2.append('circle').attr('r', 40).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px').attr('fill', '#1f2937').text('CP2');
    cp2.transition().duration(600).delay(600).style('opacity', 1);

    // Direct connection arrow
    setTimeout(() => {
        const defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-direct').attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse').append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#10b981');

        svg.append('path').attr('d', 'M 225 200 L 475 200')
            .attr('stroke', '#10b981').attr('stroke-width', 4).attr('marker-end', 'url(#arrow-direct)')
            .style('opacity', 0).transition().duration(1000).style('opacity', 1);

        svg.append('text').attr('x', 350).attr('y', 180).attr('text-anchor', 'middle')
            .attr('font-size', '14px').attr('fill', '#059669').attr('font-weight', 'bold').text('Direct Connection')
            .style('opacity', 0).transition().duration(800).delay(400).style('opacity', 1);
    }, 1200);

    // Benefits
    const benefits = [
        { y: 100, icon: '✓', text: 'No middlemen', color: '#10b981' },
        { y: 310, icon: '✓', text: 'Lower cost', color: '#10b981' },
        { y: 100, icon: '✓', text: 'Lower latency', color: '#10b981' },
        { y: 310, icon: '✓', text: 'Better quality', color: '#10b981' }
    ];

    setTimeout(() => {
        svg.append('text').attr('x', 60).attr('y', benefits[0].y).attr('font-size', '13px')
            .attr('fill', benefits[0].color).text(`${benefits[0].icon} ${benefits[0].text}`)
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 60).attr('y', benefits[1].y).attr('font-size', '13px')
            .attr('fill', benefits[1].color).text(`${benefits[1].icon} ${benefits[1].text}`)
            .style('opacity', 0).transition().duration(600).delay(200).style('opacity', 1);
        svg.append('text').attr('x', 540).attr('y', benefits[2].y).attr('font-size', '13px')
            .attr('fill', benefits[2].color).text(`${benefits[2].icon} ${benefits[2].text}`)
            .style('opacity', 0).transition().duration(600).delay(400).style('opacity', 1);
        svg.append('text').attr('x', 540).attr('y', benefits[3].y).attr('font-size', '13px')
            .attr('fill', benefits[3].color).text(`${benefits[3].icon} ${benefits[3].text}`)
            .style('opacity', 0).transition().duration(600).delay(600).style('opacity', 1);
    }, 2200);
}

function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // CP1 looking up destination
    const cp1 = svg.append('g').attr('transform', 'translate(100, 250)').style('opacity', 0);
    cp1.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    // Directory database
    const directory = svg.append('g').attr('transform', 'translate(325, 120)').style('opacity', 0);
    directory.append('rect').attr('width', 100).attr('height', 90).attr('rx', 5)
        .attr('fill', '#8b5cf6').attr('stroke', '#6d28d9').attr('stroke-width', 2);
    directory.append('text').attr('x', 50).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '30px').text('📚');
    directory.append('text').attr('x', 50).attr('y', 70).attr('text-anchor', 'middle')
        .attr('font-size', '12px').attr('fill', 'white').text('Directory');
    directory.transition().duration(600).delay(600).style('opacity', 1);

    // CP2 information
    const cp2 = svg.append('g').attr('transform', 'translate(580, 250)').style('opacity', 0);
    cp2.append('circle').attr('r', 35).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP2');
    cp2.transition().duration(600).delay(900).style('opacity', 1);

    // Query flow
    setTimeout(() => {
        const defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-lookup').attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse').append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#f59e0b');

        // 1. Lookup query
        svg.append('path').attr('d', 'M 135 235 L 320 180')
            .attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('marker-end', 'url(#arrow-lookup)')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 200).attr('y', 200).attr('font-size', '10px')
            .attr('fill', '#92400e').text('1. Lookup +1415...').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 1200);

    setTimeout(() => {
        // 2. Response with IP
        svg.append('path').attr('d', 'M 430 180 L 545 235')
            .attr('stroke', '#10b981').attr('stroke-width', 2).attr('marker-end', 'url(#arrow-lookup)')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
        svg.append('text').attr('x', 450).attr('y', 200).attr('font-size', '10px')
            .attr('fill', '#065f46').text('2. CP2: 192.168.1.1').style('opacity', 0)
            .transition().duration(600).style('opacity', 1);
    }, 1800);

    setTimeout(() => {
        // 3. Direct connect
        svg.append('path').attr('d', 'M 140 260 L 540 260')
            .attr('stroke', '#3b82f6').attr('stroke-width', 3).attr('marker-end', 'url(#arrow-lookup)')
            .attr('stroke-dasharray', '5,5').style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 340).attr('y', 295).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('fill', '#1e40af').text('3. Connect directly')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2400);
}
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Cost Comparison');

    // Traditional routing costs
    const traditional = svg.append('g').attr('transform', 'translate(100, 100)');
    traditional.append('text').attr('x', 100).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#ef4444')
        .text('Traditional PSTN').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const tradCosts = [
        { y: 40, label: 'Origination', cost: '$0.01', color: '#f59e0b' },
        { y: 75, label: 'Transit 1', cost: '$0.02', color: '#ef4444' },
        { y: 110, label: 'Transit 2', cost: '$0.02', color: '#ef4444' },
        { y: 145, label: 'Termination', cost: '$0.01', color: '#f59e0b' },
        { y: 190, label: 'TOTAL', cost: '$0.06/min', color: '#dc2626', bold: true }
    ];

    tradCosts.forEach((item, i) => {
        const g = traditional.append('g').attr('transform', `translate(0, ${item.y})`).style('opacity', 0);
        g.append('text').attr('x', 10).attr('y', 0).attr('font-size', item.bold ? '14px' : '12px')
            .attr('font-weight', item.bold ? 'bold' : 'normal').attr('fill', '#1f2937').text(item.label);
        g.append('text').attr('x', 150).attr('y', 0).attr('text-anchor', 'end')
            .attr('font-size', item.bold ? '14px' : '12px').attr('font-weight', item.bold ? 'bold' : 'normal')
            .attr('fill', item.color).text(item.cost);
        g.transition().duration(500).delay(600 + i * 200).style('opacity', 1);
    });

    // PSTN2 direct routing costs
    const pstn2 = svg.append('g').attr('transform', 'translate(450, 100)');
    pstn2.append('text').attr('x', 100).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#10b981')
        .text('PSTN2 Direct').style('opacity', 0).transition().duration(600).delay(1500).style('opacity', 1);

    const pstn2Costs = [
        { y: 40, label: 'Origination', cost: '$0.01', color: '#f59e0b' },
        { y: 75, label: 'Direct Connect', cost: '$0.00', color: '#10b981' },
        { y: 110, label: 'Termination', cost: '$0.01', color: '#f59e0b' },
        { y: 190, label: 'TOTAL', cost: '$0.015/min', color: '#059669', bold: true }
    ];

    pstn2Costs.forEach((item, i) => {
        const g = pstn2.append('g').attr('transform', `translate(0, ${item.y})`).style('opacity', 0);
        g.append('text').attr('x', 10).attr('y', 0).attr('font-size', item.bold ? '14px' : '12px')
            .attr('font-weight', item.bold ? 'bold' : 'normal').attr('fill', '#1f2937').text(item.label);
        g.append('text').attr('x', 150).attr('y', 0).attr('text-anchor', 'end')
            .attr('font-size', item.bold ? '14px' : '12px').attr('font-weight', item.bold ? 'bold' : 'normal')
            .attr('fill', item.color).text(item.cost);
        g.transition().duration(500).delay(1800 + i * 200).style('opacity', 1);
    });

    // Savings badge
    setTimeout(() => {
        const savings = svg.append('g').attr('transform', 'translate(300, 320)').style('opacity', 0);
        savings.append('circle').attr('r', 50).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        savings.append('text').attr('text-anchor', 'middle').attr('y', -5).attr('font-size', '20px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('75%');
        savings.append('text').attr('text-anchor', 'middle').attr('y', 15).attr('font-size', '14px')
            .attr('fill', '#047857').text('Savings');
        savings.transition().duration(800).style('opacity', 1);
    }, 2800);
}

function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Latency Comparison');

    // Traditional routing - 5 hops
    const tradRoute = svg.append('g').attr('transform', 'translate(50, 120)');
    tradRoute.append('text').attr('x', 150).attr('y', -10).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#ef4444')
        .text('Traditional: 5-7 hops').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const hops = [0, 1, 2, 3, 4];
    hops.forEach((hop, i) => {
        const g = tradRoute.append('g').attr('transform', `translate(${i * 70}, 30)`).style('opacity', 0);
        g.append('circle').attr('r', 20).attr('fill', i === 0 || i === 4 ? '#3b82f6' : '#ef4444');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '16px')
            .attr('fill', 'white').text(i === 0 ? '📱' : i === 4 ? '📡' : '🔄');
        if (i < 4) {
            g.append('path').attr('d', 'M 25 0 L 40 0').attr('stroke', '#f59e0b')
                .attr('stroke-width', 2).attr('marker-end', 'url(#arrow-hop)');
        }
        g.transition().duration(500).delay(600 + i * 200).style('opacity', 1);
    });

    tradRoute.append('text').attr('x', 150).attr('y', 80).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#dc2626')
        .text('~200ms latency').style('opacity', 0).transition().duration(600).delay(1800).style('opacity', 1);

    // PSTN2 direct - 1 hop
    const directRoute = svg.append('g').attr('transform', 'translate(150, 240)');
    directRoute.append('text').attr('x', 150).attr('y', -10).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#10b981')
        .text('PSTN2 Direct: 1 hop').style('opacity', 0).transition().duration(600).delay(2100).style('opacity', 1);

    const direct = [0, 1];
    direct.forEach((hop, i) => {
        const g = directRoute.append('g').attr('transform', `translate(${i * 200}, 30)`).style('opacity', 0);
        g.append('circle').attr('r', 25).attr('fill', i === 0 ? '#3b82f6' : '#10b981');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '20px')
            .attr('fill', 'white').text(i === 0 ? '📱' : '📡');
        if (i < 1) {
            g.append('path').attr('d', 'M 30 0 L 165 0').attr('stroke', '#10b981')
                .attr('stroke-width', 3).attr('marker-end', 'url(#arrow-hop)');
        }
        g.transition().duration(500).delay(2400 + i * 200).style('opacity', 1);
    });

    directRoute.append('text').attr('x', 150).attr('y', 80).attr('text-anchor', 'middle')
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#059669')
        .text('~50ms latency').style('opacity', 0).transition().duration(600).delay(2800).style('opacity', 1);

    // Arrow marker
    svg.append('defs').append('marker').attr('id', 'arrow-hop').attr('viewBox', '0 0 10 10')
        .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto-start-reverse').append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#f59e0b');
}

function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Encryption Key Exchange');

    // CP1
    const cp1 = svg.append('g').attr('transform', 'translate(100, 180)').style('opacity', 0);
    cp1.append('circle').attr('r', 40).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px')
        .attr('fill', '#1f2937').text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    // CP2
    const cp2 = svg.append('g').attr('transform', 'translate(600, 180)').style('opacity', 0);
    cp2.append('circle').attr('r', 40).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px')
        .attr('fill', '#1f2937').text('CP2');
    cp2.transition().duration(600).delay(500).style('opacity', 1);

    // Key exchange flow
    setTimeout(() => {
        const defs = svg.append('defs');
        defs.append('marker').attr('id', 'arrow-key').attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse').append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#8b5cf6');

        // Step 1: Key offer
        const key1 = svg.append('g').attr('transform', 'translate(200, 150)').style('opacity', 0);
        key1.append('rect').attr('width', 80).attr('height', 30).attr('rx', 5)
            .attr('fill', '#ddd6fe').attr('stroke', '#8b5cf6').attr('stroke-width', 2);
        key1.append('text').attr('x', 40).attr('y', 20).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#5b21b6').text('🔑 Key A');
        key1.transition().duration(600).style('opacity', 1);

        svg.append('path').attr('d', 'M 145 170 L 555 170')
            .attr('stroke', '#8b5cf6').attr('stroke-width', 2).attr('marker-end', 'url(#arrow-key)')
            .attr('stroke-dasharray', '5,5').style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 1100);

    setTimeout(() => {
        // Step 2: Key response
        const key2 = svg.append('g').attr('transform', 'translate(420, 210)').style('opacity', 0);
        key2.append('rect').attr('width', 80).attr('height', 30).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        key2.append('text').attr('x', 40).attr('y', 20).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#065f46').text('🔑 Key B');
        key2.transition().duration(600).style('opacity', 1);

        svg.append('path').attr('d', 'M 555 190 L 145 190')
            .attr('stroke', '#10b981').attr('stroke-width', 2).attr('marker-end', 'url(#arrow-key)')
            .attr('stroke-dasharray', '5,5').style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 1900);

    // Encrypted connection
    setTimeout(() => {
        const encrypted = svg.append('g').attr('transform', 'translate(250, 280)').style('opacity', 0);
        encrypted.append('rect').attr('width', 200).attr('height', 50).attr('rx', 5)
            .attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
        encrypted.append('text').attr('x', 100).attr('y', 20).attr('text-anchor', 'middle')
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#92400e').text('🔒 SRTP Encrypted');
        encrypted.append('text').attr('x', 100).attr('y', 38).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('fill', '#78350f').text('End-to-end secure');
        encrypted.transition().duration(800).style('opacity', 1);
    }, 2700);
}
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Media Path Security');

    // Unencrypted path (traditional)
    const unencrypted = svg.append('g').attr('transform', 'translate(50, 100)');
    unencrypted.append('text').attr('x', 150).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#ef4444')
        .text('Traditional: Exposed').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const unencPath = [
        { x: 20, label: 'CP1', icon: '📱' },
        { x: 120, label: 'Transit', icon: '👁️' },
        { x: 220, label: 'Transit', icon: '👁️' },
        { x: 320, label: 'CP2', icon: '📡' }
    ];

    unencPath.forEach((node, i) => {
        const g = unencrypted.append('g').attr('transform', `translate(${node.x}, 40)`).style('opacity', 0);
        g.append('circle').attr('r', 25).attr('fill', i === 0 || i === 3 ? '#3b82f6' : '#ef4444');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '18px')
            .attr('fill', 'white').text(node.icon);
        g.append('text').attr('text-anchor', 'middle').attr('y', 45).attr('font-size', '10px')
            .attr('fill', '#1f2937').text(node.label);
        g.transition().duration(500).delay(600 + i * 150).style('opacity', 1);
    });

    unencrypted.append('text').attr('x', 170).attr('y', 95).attr('text-anchor', 'middle')
        .attr('font-size', '12px').attr('fill', '#dc2626').text('❌ Can be intercepted')
        .style('opacity', 0).transition().duration(600).delay(1200).style('opacity', 1);

    // Encrypted path (PSTN2)
    const encrypted = svg.append('g').attr('transform', 'translate(50, 240)');
    encrypted.append('text').attr('x', 150).attr('y', 0).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#10b981')
        .text('PSTN2: End-to-End Encrypted').style('opacity', 0).transition().duration(600).delay(1800).style('opacity', 1);

    const encPath = [
        { x: 70, label: 'CP1', icon: '📱' },
        { x: 270, label: 'CP2', icon: '📡' }
    ];

    encPath.forEach((node, i) => {
        const g = encrypted.append('g').attr('transform', `translate(${node.x}, 40)`).style('opacity', 0);
        g.append('circle').attr('r', 30).attr('fill', '#10b981');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '22px')
            .attr('fill', 'white').text(node.icon);
        g.append('text').attr('text-anchor', 'middle').attr('y', 50).attr('font-size', '11px')
            .attr('fill', '#1f2937').text(node.label);
        g.transition().duration(500).delay(2100 + i * 150).style('opacity', 1);
    });

    setTimeout(() => {
        encrypted.append('path').attr('d', 'M 105 40 L 235 40')
            .attr('stroke', '#10b981').attr('stroke-width', 4).attr('stroke-dasharray', '10,5')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        encrypted.append('text').attr('x', 170).attr('y', 30).attr('text-anchor', 'middle')
            .attr('font-size', '18px').text('🔒').style('opacity', 0).transition().duration(600).style('opacity', 1);
        encrypted.append('text').attr('x', 170).attr('y', 95).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#059669').text('✓ Private by default')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2400);
}

function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Quality of Service');

    // CP1 and CP2
    const cp1 = svg.append('g').attr('transform', 'translate(120, 180)').style('opacity', 0);
    cp1.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    const cp2 = svg.append('g').attr('transform', 'translate(580, 180)').style('opacity', 0);
    cp2.append('circle').attr('r', 35).attr('fill', '#10b981');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📡');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '13px').attr('fill', '#1f2937').text('CP2');
    cp2.transition().duration(600).delay(500).style('opacity', 1);

    // QoS negotiation
    const qosBox = svg.append('g').attr('transform', 'translate(250, 100)').style('opacity', 0);
    qosBox.append('rect').attr('width', 200).attr('height', 100).attr('rx', 5)
        .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
    qosBox.append('text').attr('x', 100).attr('y', 25).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1e40af').text('Negotiate QoS');

    const qosItems = [
        { y: 50, text: '✓ HD Voice codec', icon: '🎵' },
        { y: 70, text: '✓ Video support', icon: '📹' },
        { y: 90, text: '✓ Bandwidth: 100kbps', icon: '📊' }
    ];

    qosItems.forEach((item, i) => {
        qosBox.append('text').attr('x', 15).attr('y', item.y).attr('font-size', '11px')
            .attr('fill', '#1e40af').text(`${item.icon} ${item.text}`);
    });
    qosBox.transition().duration(800).delay(1100).style('opacity', 1);

    // Connection arrow
    setTimeout(() => {
        svg.append('path').attr('d', 'M 160 180 L 540 180')
            .attr('stroke', '#10b981').attr('stroke-width', 4)
            .style('opacity', 0).transition().duration(1000).style('opacity', 1);
        svg.append('text').attr('x', 350).attr('y', 300).attr('text-anchor', 'middle')
            .attr('font-size', '13px').attr('fill', '#059669').attr('font-weight', 'bold')
            .text('No middleman limitations').style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1900);
}

function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Network Effects');

    // 10 CPs network
    svg.append('text').attr('x', 180).attr('y', 90).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#3b82f6')
        .text('10 CPs = 90 connections').style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const network10 = svg.append('g').attr('transform', 'translate(50, 110)');
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const x = 130 + Math.cos(angle) * 80;
        const y = 100 + Math.sin(angle) * 80;
        const cp = network10.append('g').attr('transform', `translate(${x}, ${y})`).style('opacity', 0);
        cp.append('circle').attr('r', 15).attr('fill', '#3b82f6');
        cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '10px').attr('fill', 'white').text(i + 1);
        cp.transition().duration(400).delay(600 + i * 100).style('opacity', 1);
    }

    // 100 CPs network
    svg.append('text').attr('x', 520).attr('y', 90).attr('text-anchor', 'middle')
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#10b981')
        .text('100 CPs = 9,900 connections').style('opacity', 0).transition().duration(600).delay(1800).style('opacity', 1);

    const network100 = svg.append('g').attr('transform', 'translate(390, 110)');
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2 - Math.PI / 2;
        const x = 130 + Math.cos(angle) * 80;
        const y = 100 + Math.sin(angle) * 80;
        const cp = network100.append('g').attr('transform', `translate(${x}, ${y})`).style('opacity', 0);
        cp.append('circle').attr('r', 8).attr('fill', '#10b981');
        cp.transition().duration(300).delay(2100 + i * 50).style('opacity', 1);
    }

    // Growth arrow
    setTimeout(() => {
        svg.append('path').attr('d', 'M 280 150 L 370 150')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrow-growth)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('defs').append('marker').attr('id', 'arrow-growth').attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse').append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#f59e0b');
    }, 3100);
}

function setupScene10() {
    const svg = d3.select('#scene-10-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Fallback to Traditional');

    // PSTN2-enabled CPs
    const pstn2CP1 = svg.append('g').attr('transform', 'translate(100, 130)').style('opacity', 0);
    pstn2CP1.append('circle').attr('r', 35).attr('fill', '#10b981');
    pstn2CP1.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📱');
    pstn2CP1.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '12px')
        .attr('fill', '#1f2937').text('CP1 ✓');
    pstn2CP1.transition().duration(600).delay(300).style('opacity', 1);

    const pstn2CP2 = svg.append('g').attr('transform', 'translate(350, 130)').style('opacity', 0);
    pstn2CP2.append('circle').attr('r', 35).attr('fill', '#10b981');
    pstn2CP2.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📡');
    pstn2CP2.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '12px')
        .attr('fill', '#1f2937').text('CP2 ✓');
    pstn2CP2.transition().duration(600).delay(500).style('opacity', 1);

    // Direct connection
    setTimeout(() => {
        svg.append('path').attr('d', 'M 140 130 L 310 130')
            .attr('stroke', '#10b981').attr('stroke-width', 4)
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 225).attr('y', 115).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#059669').text('PSTN2 Direct')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1100);

    // Legacy CP
    const legacyCP = svg.append('g').attr('transform', 'translate(600, 130)').style('opacity', 0);
    legacyCP.append('circle').attr('r', 35).attr('fill', '#9ca3af');
    legacyCP.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('📞');
    legacyCP.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '12px')
        .attr('fill', '#1f2937').text('CP3 ✗');
    legacyCP.transition().duration(600).delay(1900).style('opacity', 1);

    // Fallback connection
    setTimeout(() => {
        svg.append('path').attr('d', 'M 390 130 L 560 130')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('stroke-dasharray', '5,5')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 475).attr('y', 115).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#92400e').text('Fallback PSTN')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2500);

    // Success message
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 260).attr('text-anchor', 'middle')
            .attr('font-size', '14px').attr('fill', '#059669').attr('font-weight', 'bold')
            .text('✓ Call completes either way').style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3300);
}

function setupScene11() {
    const svg = d3.select('#scene-11-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Peering Agreements');

    // CPs
    const cps = [
        { x: 100, y: 200, label: 'CP1', color: '#3b82f6' },
        { x: 300, y: 120, label: 'CP2', color: '#10b981' },
        { x: 500, y: 120, label: 'CP3', color: '#f59e0b' },
        { x: 600, y: 200, label: 'CP4', color: '#8b5cf6' }
    ];

    cps.forEach((cp, i) => {
        const g = svg.append('g').attr('transform', `translate(${cp.x}, ${cp.y})`).style('opacity', 0);
        g.append('circle').attr('r', 30).attr('fill', cp.color);
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '20px').attr('fill', 'white').text('📡');
        g.append('text').attr('text-anchor', 'middle').attr('y', 50)
            .attr('font-size', '12px').attr('fill', '#1f2937').text(cp.label);
        g.transition().duration(500).delay(300 + i * 200).style('opacity', 1);
    });

    // Peering connections
    const connections = [
        { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 },
        { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 3 }
    ];

    setTimeout(() => {
        connections.forEach((conn, i) => {
            svg.append('line')
                .attr('x1', cps[conn.from].x).attr('y1', cps[conn.from].y)
                .attr('x2', cps[conn.to].x).attr('y2', cps[conn.to].y)
                .attr('stroke', '#10b981').attr('stroke-width', 2).attr('opacity', 0.3)
                .style('opacity', 0).transition().duration(500).delay(i * 150).style('opacity', 0.3);
        });
    }, 1300);

    // Agreement details
    const agreement = svg.append('g').attr('transform', 'translate(200, 290)').style('opacity', 0);
    agreement.append('rect').attr('width', 300).attr('height', 70).attr('rx', 5)
        .attr('fill', '#f0fdf4').attr('stroke', '#10b981').attr('stroke-width', 2);
    agreement.append('text').attr('x', 150).attr('y', 25).attr('text-anchor', 'middle')
        .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#065f46')
        .text('Automated Peering');
    agreement.append('text').attr('x', 150).attr('y', 45).attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', '#047857').text('• No manual negotiation');
    agreement.append('text').attr('x', 150).attr('y', 60).attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', '#047857').text('• Standard protocols');
    agreement.transition().duration(800).delay(2200).style('opacity', 1);
}

function setupScene12() {
    const svg = d3.select('#scene-12-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 40).attr('text-anchor', 'middle')
        .attr('font-size', '20px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Geographic Optimization');

    // Map background
    svg.append('rect').attr('x', 50).attr('y', 70).attr('width', 600).attr('height', 250).attr('rx', 5)
        .attr('fill', '#f0f9ff').attr('stroke', '#3b82f6').attr('stroke-width', 2).style('opacity', 0.3);

    // CP1 locations
    const cp1Locs = [
        { x: 100, y: 150, label: 'NY' },
        { x: 200, y: 200, label: 'London ✓' }
    ];

    cp1Locs.forEach((loc, i) => {
        const g = svg.append('g').attr('transform', `translate(${loc.x}, ${loc.y})`).style('opacity', 0);
        g.append('circle').attr('r', 20).attr('fill', '#3b82f6');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '16px').attr('fill', 'white').text('📱');
        g.append('text').attr('text-anchor', 'middle').attr('y', 35)
            .attr('font-size', '10px').attr('fill', '#1f2937').text(`CP1-${loc.label}`);
        g.transition().duration(500).delay(300 + i * 200).style('opacity', 1);
    });

    // CP2 locations
    const cp2Locs = [
        { x: 550, y: 150, label: 'Tokyo' },
        { x: 450, y: 200, label: 'London ✓' }
    ];

    cp2Locs.forEach((loc, i) => {
        const g = svg.append('g').attr('transform', `translate(${loc.x}, ${loc.y})`).style('opacity', 0);
        g.append('circle').attr('r', 20).attr('fill', '#10b981');
        g.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '16px').attr('fill', 'white').text('📡');
        g.append('text').attr('text-anchor', 'middle').attr('y', 35)
            .attr('font-size', '10px').attr('fill', '#1f2937').text(`CP2-${loc.label}`);
        g.transition().duration(500).delay(700 + i * 200).style('opacity', 1);
    });

    // Inefficient route (NY to Tokyo)
    setTimeout(() => {
        svg.append('path').attr('d', 'M 100 150 Q 325 100 550 150')
            .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('fill', 'none')
            .attr('stroke-dasharray', '5,5').style('opacity', 0).transition().duration(800).style('opacity', 0.5);
        svg.append('text').attr('x', 325).attr('y', 90).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('fill', '#dc2626').text('❌ Slow')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1300);

    // Optimized route (London to London)
    setTimeout(() => {
        svg.append('path').attr('d', 'M 225 200 L 425 200')
            .attr('stroke', '#10b981').attr('stroke-width', 4)
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 325).attr('y', 190).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#059669').attr('font-weight', 'bold').text('✓ Optimized')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2100);

    // Benefits
    svg.append('text').attr('x', 350).attr('y', 340).attr('text-anchor', 'middle')
        .attr('font-size', '13px').attr('fill', '#1f2937').text('Route through closest datacenters')
        .style('opacity', 0).transition().duration(800).delay(2900).style('opacity', 1);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        // No-op on the last scene (button click still exits to homepage)
        if (currentScene < totalScenes) nextScene();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // No-op on the first scene
        if (currentScene > 1) previousScene();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        togglePlay();
    }
});
