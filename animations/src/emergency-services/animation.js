// PSTN2 Emergency Services Location Animation

let currentScene = 1;
const totalScenes = 9;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

const sceneDurations = {
    "1": 12000,
    "2": 13000,
    "3": 13000,
    "4": 13000,
    "5": 14000,
    "6": 13000,
    "7": 13000,
    "8": 12000,
    "9": 12000
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

// Scene 1: The Life-or-Death Problem
function setupScene1() {
    const svg = d3.select('#scene-1-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow marker
    svg.append('defs').append('marker')
        .attr('id', 'arrow-emergency')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    // Emergency caller
    const caller = svg.append('g')
        .attr('transform', 'translate(100, 150)')
        .style('opacity', 0);
    caller.append('circle').attr('r', 40).attr('fill', '#ef4444');
    caller.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '30px').text('🆘');
    caller.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Emergency');
    caller.transition().duration(600).delay(300).style('opacity', 1);

    // Clock showing time is critical
    setTimeout(() => {
        const clock = svg.append('g').attr('transform', 'translate(350, 100)').style('opacity', 0);
        clock.append('circle').attr('r', 50).attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 3);
        clock.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '40px').text('⏱️');
        clock.append('text').attr('text-anchor', 'middle').attr('y', 80)
            .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#ef4444')
            .text('EVERY SECOND COUNTS');
        clock.transition().duration(800).style('opacity', 1);
    }, 1000);

    // Ambulance
    setTimeout(() => {
        const ambulance = svg.append('g').attr('transform', 'translate(600, 150)').style('opacity', 0);
        ambulance.append('circle').attr('r', 40).attr('fill', '#3b82f6');
        ambulance.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '30px').text('🚑');
        ambulance.append('text').attr('text-anchor', 'middle').attr('y', 60)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('Responder');
        ambulance.transition().duration(600).style('opacity', 1);
    }, 1800);

    // Problem: Inaccurate location
    setTimeout(() => {
        const problem = svg.append('g').attr('transform', 'translate(350, 280)').style('opacity', 0);
        problem.append('rect')
            .attr('x', -120).attr('y', -40).attr('width', 240).attr('height', 80)
            .attr('rx', 5).attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 2);
        problem.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#991b1b')
            .text('❌ Outdated Location Data');
        problem.append('text').attr('text-anchor', 'middle').attr('y', 15)
            .attr('font-size', '12px').attr('fill', '#991b1b')
            .text('Responders can\'t find caller');
        problem.transition().duration(800).style('opacity', 1);
    }, 2500);
}

// Scene 2: Current System Limitations
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow marker
    svg.append('defs').append('marker')
        .attr('id', 'arrow-batch')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#f59e0b');

    // CP with database
    const cp = svg.append('g').attr('transform', 'translate(100, 150)').style('opacity', 0);
    cp.append('circle').attr('r', 40).attr('fill', '#3b82f6');
    cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '26px').text('📱');
    cp.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('CP');
    cp.transition().duration(600).delay(300).style('opacity', 1);

    // Batch file (24hr old)
    setTimeout(() => {
        const batch = svg.append('g').attr('transform', 'translate(350, 120)').style('opacity', 0);
        batch.append('rect')
            .attr('width', 180).attr('height', 100).attr('rx', 5)
            .attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
        batch.append('text').attr('x', 90).attr('y', 25).attr('text-anchor', 'middle')
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#92400e')
            .text('Location Database');
        batch.append('text').attr('x', 90).attr('y', 50).attr('text-anchor', 'middle')
            .attr('font-size', '12px').attr('fill', '#92400e')
            .text('Updated: 24hrs ago');
        batch.append('text').attr('x', 90).attr('y', 75).attr('text-anchor', 'middle')
            .attr('font-size', '20px').text('📄');
        batch.transition().duration(800).style('opacity', 1);
    }, 1000);

    // Arrow from CP to batch
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 145 150 L 260 150')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-batch)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 200).attr('y', 140)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('fill', '#92400e').text('Daily batch')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 1500);

    // Emergency services receiving old data
    setTimeout(() => {
        const emergency = svg.append('g').attr('transform', 'translate(600, 150)').style('opacity', 0);
        emergency.append('circle').attr('r', 40).attr('fill', '#ef4444');
        emergency.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '26px').text('🚨');
        emergency.append('text').attr('text-anchor', 'middle').attr('y', 60)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('Emergency Services');
        emergency.transition().duration(600).style('opacity', 1);
    }, 2200);

    // Arrow from batch to emergency
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 535 170 L 560 170')
            .attr('stroke', '#f59e0b').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-batch)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2800);

    // Problem label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 280)
            .attr('text-anchor', 'middle').attr('font-size', '16px')
            .attr('font-weight', 'bold').attr('fill', '#ef4444')
            .text('⚠️ Data can be up to 24 hours old')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3500);
}

// Scene 3: Precision Problems
function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Large postcode area (imprecise)
    const postcodeArea = svg.append('g').attr('transform', 'translate(350, 200)').style('opacity', 0);
    postcodeArea.append('rect')
        .attr('x', -150).attr('y', -120).attr('width', 300).attr('height', 240)
        .attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 3)
        .attr('stroke-dasharray', '10,5');
    postcodeArea.append('text').attr('text-anchor', 'middle').attr('y', -90)
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#991b1b')
        .text('Postcode Area: SW1A');
    postcodeArea.append('text').attr('text-anchor', 'middle').attr('y', -65)
        .attr('font-size', '14px').attr('fill', '#991b1b')
        .text('~3 square kilometers');
    postcodeArea.transition().duration(800).delay(300).style('opacity', 1);

    // Multiple buildings within area
    setTimeout(() => {
        const buildings = [
            { x: -80, y: -40, label: '🏢' },
            { x: -20, y: -40, label: '🏢' },
            { x: 40, y: -40, label: '🏢' },
            { x: 100, y: -40, label: '🏢' },
            { x: -80, y: 20, label: '🏢' },
            { x: -20, y: 20, label: '🏢' },
            { x: 40, y: 20, label: '🏢' },
            { x: 100, y: 20, label: '🏢' },
            { x: -80, y: 80, label: '🏢' },
            { x: -20, y: 80, label: '🏢' },
            { x: 40, y: 80, label: '🏢' },
            { x: 100, y: 80, label: '🏢' }
        ];

        buildings.forEach((building, i) => {
            const b = postcodeArea.append('g').attr('transform', `translate(${building.x}, ${building.y})`).style('opacity', 0);
            b.append('text').attr('text-anchor', 'middle').attr('font-size', '24px').text(building.label);
            b.transition().duration(400).delay(1000 + i * 100).style('opacity', 1);
        });
    }, 0);

    // Actual caller location (one specific building)
    setTimeout(() => {
        const caller = postcodeArea.append('g').attr('transform', 'translate(40, 20)').style('opacity', 0);
        caller.append('circle').attr('r', 25).attr('fill', 'none')
            .attr('stroke', '#10b981').attr('stroke-width', 3);
        caller.append('text').attr('text-anchor', 'middle').attr('dy', 50)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('Actual Location');
        caller.transition().duration(600).style('opacity', 1);
    }, 2500);

    // Problem explanation
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 360)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#ef4444')
            .text('❌ Responders must search dozens of buildings')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3200);
}

// Scene 4: PSTN2 Real-Time Location
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow marker
    svg.append('defs').append('marker')
        .attr('id', 'arrow-realtime')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#10b981');

    // Emergency call comes in
    const emergency = svg.append('g').attr('transform', 'translate(100, 150)').style('opacity', 0);
    emergency.append('circle').attr('r', 40).attr('fill', '#ef4444');
    emergency.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '26px').text('🚨');
    emergency.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('999 Call');
    emergency.transition().duration(600).delay(300).style('opacity', 1);

    // Terminating CP
    setTimeout(() => {
        const termCP = svg.append('g').attr('transform', 'translate(300, 150)').style('opacity', 0);
        termCP.append('circle').attr('r', 35).attr('fill', '#3b82f6');
        termCP.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📞');
        termCP.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('Term CP');
        termCP.transition().duration(600).style('opacity', 1);
    }, 900);

    // Real-time query
    setTimeout(() => {
        const query = svg.append('g').attr('transform', 'translate(350, 250)').style('opacity', 0);
        query.append('rect')
            .attr('x', -90).attr('y', -30).attr('width', 180).attr('height', 60)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        query.append('text').attr('text-anchor', 'middle').attr('y', -5)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('Real-Time Query →');
        query.append('text').attr('text-anchor', 'middle').attr('y', 15)
            .attr('font-size', '12px').attr('fill', '#1e40af')
            .text('Where is this device?');
        query.transition().duration(800).style('opacity', 1);
    }, 1600);

    // Originating CP
    setTimeout(() => {
        const origCP = svg.append('g').attr('transform', 'translate(500, 150)').style('opacity', 0);
        origCP.append('circle').attr('r', 35).attr('fill', '#10b981');
        origCP.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📱');
        origCP.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('Orig CP');
        origCP.transition().duration(600).style('opacity', 1);
    }, 2400);

    // GPS response
    setTimeout(() => {
        const response = svg.append('g').attr('transform', 'translate(350, 60)').style('opacity', 0);
        response.append('rect')
            .attr('x', -110).attr('y', -40).attr('width', 220).attr('height', 80)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        response.append('text').attr('text-anchor', 'middle').attr('y', -15)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('✓ GPS Coordinates');
        response.append('text').attr('text-anchor', 'middle').attr('y', 5)
            .attr('font-size', '12px').attr('fill', '#065f46')
            .text('51.5014° N, 0.1419° W');
        response.append('text').attr('text-anchor', 'middle').attr('y', 25)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('Accuracy: ±10 meters');
        response.transition().duration(800).style('opacity', 1);
    }, 3200);

    // Success indicator
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 360)
            .attr('text-anchor', 'middle').attr('font-size', '16px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Real-time, accurate location in milliseconds')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 4000);
}

// Scene 5: The Query Process
function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-query')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#3b82f6');

    // Step 1: Emergency call arrives
    const termCP = svg.append('g').attr('transform', 'translate(120, 150)').style('opacity', 0);
    termCP.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    termCP.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '22px').text('📞');
    termCP.append('text').attr('text-anchor', 'middle').attr('y', 55)
        .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Terminating CP');
    termCP.transition().duration(600).delay(300).style('opacity', 1);

    // Step 2: Identify emergency number
    setTimeout(() => {
        const identify = svg.append('text').attr('x', 120).attr('y', 230)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('fill', '#1e40af').text('Detects 999/112')
            .style('opacity', 0);
        identify.transition().duration(600).style('opacity', 1);
    }, 900);

    // Step 3: Query sent
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 160 150 L 250 150')
            .attr('stroke', '#3b82f6').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-query)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 205).attr('y', 140)
            .attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#1e40af').text('Location query →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1500);

    // Step 4: Originating CP
    setTimeout(() => {
        const origCP = svg.append('g').attr('transform', 'translate(300, 150)').style('opacity', 0);
        origCP.append('circle').attr('r', 35).attr('fill', '#10b981');
        origCP.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📱');
        origCP.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('Originating CP');
        origCP.transition().duration(600).style('opacity', 1);
    }, 2300);

    // Step 5: Database lookup
    setTimeout(() => {
        const db = svg.append('g').attr('transform', 'translate(480, 150)').style('opacity', 0);
        db.append('rect')
            .attr('x', -60).attr('y', -35).attr('width', 120).attr('height', 70)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        db.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('Location DB');
        db.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '20px').text('💾');
        db.transition().duration(600).style('opacity', 1);

        svg.append('path')
            .attr('d', 'M 340 150 L 415 150')
            .attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-query)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3100);

    // Step 6: Response with location
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 250 170 L 160 170')
            .attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-query)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        const response = svg.append('g').attr('transform', 'translate(205, 200)').style('opacity', 0);
        response.append('text').attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('← Location data');
        response.append('text').attr('text-anchor', 'middle').attr('y', 15)
            .attr('font-size', '10px').attr('fill', '#065f46')
            .text('(< 100ms)');
        response.transition().duration(600).style('opacity', 1);
    }, 3900);

    // Timeline at bottom
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Total time: Milliseconds, not 24 hours')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 4700);
}

// Scene 6: Mobile Device Integration
function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Mobile device at center
    const device = svg.append('g').attr('transform', 'translate(350, 200)').style('opacity', 0);
    device.append('circle').attr('r', 50).attr('fill', '#3b82f6');
    device.append('text').attr('text-anchor', 'middle').attr('dy', 10)
        .attr('font-size', '40px').text('📱');
    device.append('text').attr('text-anchor', 'middle').attr('y', 75)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Mobile Device');
    device.transition().duration(600).delay(300).style('opacity', 1);

    // GPS satellites
    setTimeout(() => {
        const gps = svg.append('g').attr('transform', 'translate(150, 80)').style('opacity', 0);
        gps.append('circle').attr('r', 35).attr('fill', '#10b981').attr('stroke', '#065f46').attr('stroke-width', 2);
        gps.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '26px').text('🛰️');
        gps.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('GPS: ±10m');
        gps.transition().duration(600).style('opacity', 1);

        // Connection line
        svg.append('path')
            .attr('d', 'M 180 110 L 320 180')
            .attr('stroke', '#10b981').attr('stroke-width', 2).attr('stroke-dasharray', '5,3')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1000);

    // Cell towers
    setTimeout(() => {
        const cell = svg.append('g').attr('transform', 'translate(550, 80)').style('opacity', 0);
        cell.append('circle').attr('r', 35).attr('fill', '#f59e0b').attr('stroke', '#92400e').attr('stroke-width', 2);
        cell.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '26px').text('📡');
        cell.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#92400e')
            .text('Cell: ±100m');
        cell.transition().duration(600).style('opacity', 1);

        // Connection line
        svg.append('path')
            .attr('d', 'M 520 110 L 380 180')
            .attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '5,3')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1700);

    // WiFi
    setTimeout(() => {
        const wifi = svg.append('g').attr('transform', 'translate(350, 340)').style('opacity', 0);
        wifi.append('circle').attr('r', 35).attr('fill', '#8b5cf6').attr('stroke', '#5b21b6').attr('stroke-width', 2);
        wifi.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '26px').text('📶');
        wifi.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#5b21b6')
            .text('WiFi: ±50m');
        wifi.transition().duration(600).style('opacity', 1);

        // Connection line
        svg.append('path')
            .attr('d', 'M 350 255 L 350 300')
            .attr('stroke', '#8b5cf6').attr('stroke-width', 2).attr('stroke-dasharray', '5,3')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2400);

    // Aggregated data
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 30)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('All sources aggregated in real-time')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3100);
}

// Scene 7: Fixed Line Intelligence
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Fixed line phone
    const phone = svg.append('g').attr('transform', 'translate(150, 180)').style('opacity', 0);
    phone.append('circle').attr('r', 40).attr('fill', '#3b82f6');
    phone.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '30px').text('☎️');
    phone.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Fixed Line');
    phone.transition().duration(600).delay(300).style('opacity', 1);

    // Old system: outdated address
    setTimeout(() => {
        const oldData = svg.append('g').attr('transform', 'translate(150, 290)').style('opacity', 0);
        oldData.append('rect')
            .attr('x', -90).attr('y', -35).attr('width', 180).attr('height', 70)
            .attr('rx', 5).attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 2);
        oldData.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#991b1b')
            .text('❌ Old System');
        oldData.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '11px').attr('fill', '#991b1b')
            .text('Address from 2022');
        oldData.transition().duration(600).style('opacity', 1);
    }, 1000);

    // PSTN2: Multiple data sources
    setTimeout(() => {
        const pstn2Data = svg.append('g').attr('transform', 'translate(480, 180)').style('opacity', 0);

        // Container
        pstn2Data.append('rect')
            .attr('x', -130).attr('y', -100).attr('width', 260).attr('height', 200)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);

        pstn2Data.append('text').attr('text-anchor', 'middle').attr('y', -75)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('✓ PSTN2 Real-Time Data');

        // Data sources
        const sources = [
            { y: -45, label: '• Billing address (verified 2024)' },
            { y: -20, label: '• Installation records' },
            { y: 5, label: '• Customer portal update' },
            { y: 30, label: '• Service call history' },
            { y: 55, label: '• Building floor plan' }
        ];

        sources.forEach((source, i) => {
            pstn2Data.append('text').attr('text-anchor', 'start').attr('x', -120).attr('y', source.y)
                .attr('font-size', '11px').attr('fill', '#065f46')
                .text(source.label)
                .style('opacity', 0).transition().duration(400).delay(i * 150).style('opacity', 1);
        });

        pstn2Data.transition().duration(600).style('opacity', 1);
    }, 1700);

    // Comparison arrow
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 240 180 L 345 180')
            .attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-realtime)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 290).attr('y', 170)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('Much better →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2500);
}

// Scene 8: Response Time Impact
function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Title
    svg.append('text').attr('x', 350).attr('y', 40)
        .attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Cardiac Arrest Survival Rate vs. Response Time')
        .style('opacity', 0).transition().duration(800).delay(300).style('opacity', 1);

    // Create bar chart comparing survival rates
    const data = [
        { time: '0 min', rate: 90, x: 100 },
        { time: '2 min', rate: 80, x: 200 },
        { time: '4 min', rate: 60, x: 300 },
        { time: '6 min', rate: 40, x: 400 },
        { time: '8 min', rate: 20, x: 500 },
        { time: '10 min', rate: 10, x: 600 }
    ];

    const maxHeight = 200;

    setTimeout(() => {
        data.forEach((d, i) => {
            const barHeight = (d.rate / 100) * maxHeight;
            const bar = svg.append('g').attr('transform', `translate(${d.x}, 280)`);

            // Bar
            bar.append('rect')
                .attr('x', -25).attr('y', -barHeight).attr('width', 50).attr('height', 0)
                .attr('fill', d.rate >= 60 ? '#10b981' : d.rate >= 40 ? '#f59e0b' : '#ef4444')
                .transition().duration(800).delay(i * 150)
                .attr('height', barHeight);

            // Rate label
            bar.append('text').attr('text-anchor', 'middle').attr('y', -barHeight - 10)
                .attr('font-size', '13px').attr('font-weight', 'bold')
                .attr('fill', d.rate >= 60 ? '#065f46' : d.rate >= 40 ? '#92400e' : '#991b1b')
                .text(`${d.rate}%`)
                .style('opacity', 0).transition().duration(600).delay(i * 150 + 400).style('opacity', 1);

            // Time label
            bar.append('text').attr('text-anchor', 'middle').attr('y', 20)
                .attr('font-size', '12px').attr('fill', '#1f2937')
                .text(d.time)
                .style('opacity', 0).transition().duration(600).delay(i * 150).style('opacity', 1);
        });
    }, 800);

    // Highlight: Faster location = faster response
    setTimeout(() => {
        const highlight = svg.append('g').attr('transform', 'translate(350, 330)').style('opacity', 0);
        highlight.append('rect')
            .attr('x', -180).attr('y', -25).attr('width', 360).attr('height', 50)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        highlight.append('text').attr('text-anchor', 'middle').attr('y', 5)
            .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('PSTN2 real-time location saves 2-4 minutes');
        highlight.transition().duration(800).style('opacity', 1);
    }, 2500);
}

// Scene 9: Regulatory Compliance
function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Title
    svg.append('text').attr('x', 350).attr('y', 40)
        .attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('PSTN2 Exceeds Regulatory Requirements')
        .style('opacity', 0).transition().duration(800).delay(300).style('opacity', 1);

    // Regulatory frameworks
    const regulations = [
        {
            x: 120, y: 150,
            name: 'EU eCall',
            icon: '🇪🇺',
            requirements: ['Automatic crash detection', 'GPS location', 'Voice connection'],
            color: '#3b82f6'
        },
        {
            x: 350, y: 150,
            name: 'US E911',
            icon: '🇺🇸',
            requirements: ['Phase II location', 'Wireless accuracy', 'Indoor positioning'],
            color: '#10b981'
        },
        {
            x: 580, y: 150,
            name: 'UK AML',
            icon: '🇬🇧',
            requirements: ['Mobile location', 'SMS to 999', 'Real-time data'],
            color: '#f59e0b'
        }
    ];

    regulations.forEach((reg, i) => {
        setTimeout(() => {
            const group = svg.append('g').attr('transform', `translate(${reg.x}, ${reg.y})`).style('opacity', 0);

            // Circle
            group.append('circle').attr('r', 35).attr('fill', reg.color);
            group.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                .attr('font-size', '26px').text(reg.icon);

            // Name
            group.append('text').attr('text-anchor', 'middle').attr('y', 55)
                .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#1f2937')
                .text(reg.name);

            // Requirements
            reg.requirements.forEach((req, j) => {
                group.append('text').attr('text-anchor', 'middle').attr('y', 80 + j * 18)
                    .attr('font-size', '10px').attr('fill', '#4b5563')
                    .text(`• ${req}`);
            });

            group.transition().duration(600).style('opacity', 1);
        }, 800 + i * 600);
    });

    // PSTN2 exceeds all
    setTimeout(() => {
        const exceeds = svg.append('g').attr('transform', 'translate(350, 310)').style('opacity', 0);
        exceeds.append('rect')
            .attr('x', -200).attr('y', -35).attr('width', 400).attr('height', 70)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        exceeds.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('✓ PSTN2 Meets All Requirements');
        exceeds.append('text').attr('text-anchor', 'middle').attr('y', 15)
            .attr('font-size', '12px').attr('fill', '#065f46')
            .text('Universal real-time location across all carriers');
        exceeds.transition().duration(800).style('opacity', 1);
    }, 2600);
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
