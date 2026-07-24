// PSTN2 Distributed Database: Eventual Consistency Animation

let currentScene = 1;
const totalScenes = 12;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

const sceneDurations = {
    "1": 13000,
    "2": 13000,
    "3": 12000,
    "4": 13000,
    "5": 13000,
    "6": 12000,
    "7": 12000,
    "8": 13000,
    "9": 13000,
    "10": 11000,
    "11": 12000,
    "12": 13000
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

// Scene 1: The Central Database Myth
function setupScene1() {
    const svg = d3.select('#scene-1-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-central')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    // Central database (the myth)
    const central = svg.append('g').attr('transform', 'translate(350, 150)').style('opacity', 0);
    central.append('rect')
        .attr('x', -80).attr('y', -60).attr('width', 160).attr('height', 120)
        .attr('rx', 5).attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 3);
    central.append('text').attr('text-anchor', 'middle').attr('y', -30)
        .attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#991b1b')
        .text('Central Database');
    central.append('text').attr('text-anchor', 'middle').attr('y', 0)
        .attr('font-size', '30px').text('🏛️');
    central.append('text').attr('text-anchor', 'middle').attr('y', 35)
        .attr('font-size', '12px').attr('fill', '#991b1b')
        .text('£5 Billion to build');
    central.transition().duration(800).delay(300).style('opacity', 1);

    // Multiple CPs around the central database
    const cpPositions = [
        { x: 120, y: 50, label: 'CP1' },
        { x: 580, y: 50, label: 'CP2' },
        { x: 120, y: 250, label: 'CP3' },
        { x: 580, y: 250, label: 'CP4' }
    ];

    cpPositions.forEach((pos, i) => {
        setTimeout(() => {
            const cp = svg.append('g').attr('transform', `translate(${pos.x}, ${pos.y})`).style('opacity', 0);
            cp.append('circle').attr('r', 30).attr('fill', '#3b82f6');
            cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                .attr('font-size', '20px').text('📱');
            cp.append('text').attr('text-anchor', 'middle').attr('y', 50)
                .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
                .text(pos.label);
            cp.transition().duration(600).style('opacity', 1);

            // Arrows pointing to central
            setTimeout(() => {
                const dx = 350 - pos.x;
                const dy = 150 - pos.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const startX = pos.x + (dx / length) * 35;
                const startY = pos.y + (dy / length) * 35;
                const endX = pos.x + (dx / length) * (length - 90);
                const endY = pos.y + (dy / length) * (length - 90);

                svg.append('path')
                    .attr('d', `M ${startX} ${startY} L ${endX} ${endY}`)
                    .attr('stroke', '#ef4444').attr('stroke-width', 2)
                    .attr('marker-end', 'url(#arrow-central)')
                    .attr('stroke-dasharray', '5,3')
                    .style('opacity', 0).transition().duration(600).style('opacity', 1);
            }, 300);
        }, 1000 + i * 400);
    });

    // Problem label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#ef4444')
            .text('❌ Too expensive. Has blocked progress for decades.')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3200);
}

// Scene 2: Data Already Exists
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // 5 CPs, each with their own database
    const cps = [
        { x: 100, y: 120, label: 'CP1', numbers: ['0201', '0202', '0203'] },
        { x: 250, y: 120, label: 'CP2', numbers: ['0204', '0205', '0206'] },
        { x: 400, y: 120, label: 'CP3', numbers: ['0207', '0208', '0209'] },
        { x: 550, y: 120, label: 'CP4', numbers: ['0210', '0211', '0212'] }
    ];

    cps.forEach((cp, i) => {
        setTimeout(() => {
            const group = svg.append('g').attr('transform', `translate(${cp.x}, ${cp.y})`).style('opacity', 0);

            // CP icon
            group.append('circle').attr('r', 25).attr('fill', '#10b981');
            group.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                .attr('font-size', '20px').text('📱');
            group.append('text').attr('text-anchor', 'middle').attr('y', 40)
                .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
                .text(cp.label);

            // Database below
            const db = group.append('g').attr('transform', 'translate(0, 90)');
            db.append('rect')
                .attr('x', -50).attr('y', -40).attr('width', 100).attr('height', 80)
                .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
            db.append('text').attr('text-anchor', 'middle').attr('y', -15)
                .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#065f46')
                .text('Local DB');

            // Number list
            cp.numbers.forEach((num, j) => {
                db.append('text').attr('text-anchor', 'middle').attr('y', 5 + j * 15)
                    .attr('font-size', '10px').attr('fill', '#065f46')
                    .text(num + 'xxx');
            });

            group.transition().duration(600).style('opacity', 1);
        }, 500 + i * 600);
    });

    // Key insight label
    setTimeout(() => {
        const insight = svg.append('g').attr('transform', 'translate(350, 310)').style('opacity', 0);
        insight.append('rect')
            .attr('x', -200).attr('y', -30).attr('width', 400).attr('height', 60)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        insight.append('text').attr('text-anchor', 'middle').attr('y', -5)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('✓ Data Already Exists');
        insight.append('text').attr('text-anchor', 'middle').attr('y', 15)
            .attr('font-size', '12px').attr('fill', '#1e40af')
            .text('No duplication needed!');
        insight.transition().duration(800).style('opacity', 1);
    }, 3200);
}

// Scene 3: Distributed Systems Theory
function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Tech company examples
    const companies = [
        { x: 120, y: 120, name: 'Google', icon: '🔍', color: '#3b82f6' },
        { x: 350, y: 120, name: 'Facebook', icon: '👥', color: '#10b981' },
        { x: 580, y: 120, name: 'Amazon', icon: '📦', color: '#f59e0b' }
    ];

    companies.forEach((company, i) => {
        setTimeout(() => {
            const group = svg.append('g').attr('transform', `translate(${company.x}, ${company.y})`).style('opacity', 0);

            group.append('circle').attr('r', 40).attr('fill', company.color);
            group.append('text').attr('text-anchor', 'middle').attr('dy', 10)
                .attr('font-size', '30px').text(company.icon);
            group.append('text').attr('text-anchor', 'middle').attr('y', 60)
                .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
                .text(company.name);
            group.append('text').attr('text-anchor', 'middle').attr('y', 80)
                .attr('font-size', '11px').attr('fill', '#4b5563')
                .text('Distributed DB');

            group.transition().duration(600).style('opacity', 1);
        }, 600 + i * 500);
    });

    // Proven techniques label
    setTimeout(() => {
        const label = svg.append('g').attr('transform', 'translate(350, 250)').style('opacity', 0);
        label.append('rect')
            .attr('x', -180).attr('y', -35).attr('width', 360).attr('height', 70)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        label.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('✓ Proven at Internet Scale');
        label.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '12px').attr('fill', '#065f46')
            .text('Billions of users, trillions of queries');
        label.transition().duration(800).style('opacity', 1);
    }, 2200);
}

// Scene 4: Eventual Consistency
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-sync')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#10b981');

    // Timeline showing gradual propagation
    svg.append('text').attr('x', 350).attr('y', 30)
        .attr('text-anchor', 'middle').attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Information Spreads Gradually')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    // 4 CPs in a row with sync status
    const times = ['T=0', 'T=5min', 'T=30min', 'T=2hr'];
    const syncStatus = [
        { synced: 1, label: '1 CP knows' },
        { synced: 2, label: '2 CPs know' },
        { synced: 3, label: '3 CPs know' },
        { synced: 4, label: 'All CPs know' }
    ];

    times.forEach((time, i) => {
        setTimeout(() => {
            const x = 100 + i * 150;
            const y = 200;

            // Time label
            svg.append('text').attr('x', x).attr('y', 80)
                .attr('text-anchor', 'middle').attr('font-size', '12px')
                .attr('font-weight', 'bold').attr('fill', '#1e40af')
                .text(time)
                .style('opacity', 0).transition().duration(400).style('opacity', 1);

            // CPs (4 small circles stacked)
            for (let j = 0; j < 4; j++) {
                const cy = y + j * 30;
                const isSynced = j < syncStatus[i].synced;
                const circle = svg.append('circle')
                    .attr('cx', x).attr('cy', cy).attr('r', 12)
                    .attr('fill', isSynced ? '#10b981' : '#d1d5db')
                    .attr('stroke', isSynced ? '#065f46' : '#9ca3af')
                    .attr('stroke-width', 2)
                    .style('opacity', 0);
                circle.transition().duration(400).delay(j * 100).style('opacity', 1);

                if (isSynced) {
                    svg.append('text').attr('x', x).attr('y', cy + 4)
                        .attr('text-anchor', 'middle').attr('font-size', '12px')
                        .attr('fill', '#ffffff').text('✓')
                        .style('opacity', 0).transition().duration(400).delay(j * 100).style('opacity', 1);
                }
            }

            // Status label
            svg.append('text').attr('x', x).attr('y', 340)
                .attr('text-anchor', 'middle').attr('font-size', '11px')
                .attr('fill', '#4b5563').text(syncStatus[i].label)
                .style('opacity', 0).transition().duration(400).style('opacity', 1);

            // Arrow to next if not last
            if (i < times.length - 1) {
                setTimeout(() => {
                    svg.append('path')
                        .attr('d', `M ${x + 50} 200 L ${x + 100} 200`)
                        .attr('stroke', '#10b981').attr('stroke-width', 2)
                        .attr('marker-end', 'url(#arrow-sync)')
                        .style('opacity', 0).transition().duration(600).style('opacity', 1);
                }, 200);
            }
        }, 800 + i * 1200);
    });
}

// Scene 5: Caching Mechanism
function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-cache')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#3b82f6');

    // CP1 with cache
    const cp1 = svg.append('g').attr('transform', 'translate(120, 150)').style('opacity', 0);
    cp1.append('circle').attr('r', 35).attr('fill', '#3b82f6');
    cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '26px').text('📱');
    cp1.append('text').attr('text-anchor', 'middle').attr('y', 55)
        .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('CP1');
    cp1.transition().duration(600).delay(300).style('opacity', 1);

    // CP2
    setTimeout(() => {
        const cp2 = svg.append('g').attr('transform', 'translate(580, 150)').style('opacity', 0);
        cp2.append('circle').attr('r', 35).attr('fill', '#10b981');
        cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '26px').text('📱');
        cp2.append('text').attr('text-anchor', 'middle').attr('y', 55)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('CP2');
        cp2.transition().duration(600).style('opacity', 1);
    }, 900);

    // Step 1: Query
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 160 150 L 540 150')
            .attr('stroke', '#3b82f6').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-cache)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 350).attr('y', 135)
            .attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#1e40af').text('Query: Number info?')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1600);

    // Step 2: Response
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 540 170 L 160 170')
            .attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-cache)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 350).attr('y', 190)
            .attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#065f46').text('Response: Here\'s the data')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2400);

    // Step 3: Cache created
    setTimeout(() => {
        const cache = svg.append('g').attr('transform', 'translate(120, 280)').style('opacity', 0);
        cache.append('rect')
            .attr('x', -70).attr('y', -40).attr('width', 140).attr('height', 80)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        cache.append('text').attr('text-anchor', 'middle').attr('y', -15)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('Cache Entry');
        cache.append('text').attr('text-anchor', 'middle').attr('y', 5)
            .attr('font-size', '10px').attr('fill', '#1e40af')
            .text('TTL: 4 hours');
        cache.append('text').attr('text-anchor', 'middle').attr('y', 20)
            .attr('font-size', '18px').text('💾');
        cache.transition().duration(800).style('opacity', 1);
    }, 3200);

    // Next call uses cache
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 360)
            .attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Next call: Use cache (no query needed)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 4000);
}

// Scene 6: Cache Invalidation
function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Number porting scenario
    svg.append('text').attr('x', 350).attr('y', 35)
        .attr('text-anchor', 'middle').attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Number Porting: 02012345 moves from CP2 to CP3')
        .style('opacity', 0).transition().duration(800).delay(300).style('opacity', 1);

    // CP2 (old provider)
    const cp2 = svg.append('g').attr('transform', 'translate(200, 120)').style('opacity', 0);
    cp2.append('circle').attr('r', 30).attr('fill', '#ef4444');
    cp2.append('text').attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', '22px').text('📱');
    cp2.append('text').attr('text-anchor', 'middle').attr('y', 50)
        .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('CP2 (Old)');
    cp2.transition().duration(600).delay(800).style('opacity', 1);

    // CP3 (new provider)
    setTimeout(() => {
        const cp3 = svg.append('g').attr('transform', 'translate(500, 120)').style('opacity', 0);
        cp3.append('circle').attr('r', 30).attr('fill', '#10b981');
        cp3.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📱');
        cp3.append('text').attr('text-anchor', 'middle').attr('y', 50)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('CP3 (New)');
        cp3.transition().duration(600).style('opacity', 1);
    }, 1400);

    // Port arrow
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 235 120 L 465 120')
            .attr('stroke', '#f59e0b').attr('stroke-width', 4)
            .attr('marker-end', 'url(#arrow-cache)')
            .style('opacity', 0).transition().duration(1000).style('opacity', 1);

        svg.append('text').attr('x', 350).attr('y', 110)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('font-weight', 'bold').attr('fill', '#92400e')
            .text('Port →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2000);

    // Invalidation notifications
    setTimeout(() => {
        const notif = svg.append('g').attr('transform', 'translate(350, 230)').style('opacity', 0);
        notif.append('rect')
            .attr('x', -140).attr('y', -35).attr('width', 280).attr('height', 70)
            .attr('rx', 5).attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
        notif.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#92400e')
            .text('Invalidation Notifications Sent');
        notif.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '11px').attr('fill', '#92400e')
            .text('All cached entries marked stale');
        notif.transition().duration(800).style('opacity', 1);
    }, 3000);

    // Result
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340)
            .attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Next query: Fresh data from CP3')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3800);
}

// Scene 7: Directory Servers
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Directory server (optional, non-authoritative)
    const directory = svg.append('g').attr('transform', 'translate(350, 100)').style('opacity', 0);
    directory.append('rect')
        .attr('x', -90).attr('y', -45).attr('width', 180).attr('height', 90)
        .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
    directory.append('text').attr('text-anchor', 'middle').attr('y', -20)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1e40af')
        .text('Directory Server');
    directory.append('text').attr('text-anchor', 'middle').attr('y', 0)
        .attr('font-size', '11px').attr('fill', '#1e40af')
        .text('(Optional cache)');
    directory.append('text').attr('text-anchor', 'middle').attr('y', 20)
        .attr('font-size', '24px').text('📚');
    directory.transition().duration(800).delay(300).style('opacity', 1);

    // CPs at bottom (authoritative sources)
    const cps = [
        { x: 150, y: 280, label: 'CP1\n(Authoritative)' },
        { x: 350, y: 280, label: 'CP2\n(Authoritative)' },
        { x: 550, y: 280, label: 'CP3\n(Authoritative)' }
    ];

    cps.forEach((cp, i) => {
        setTimeout(() => {
            const group = svg.append('g').attr('transform', `translate(${cp.x}, ${cp.y})`).style('opacity', 0);
            group.append('circle').attr('r', 30).attr('fill', '#10b981').attr('stroke', '#065f46').attr('stroke-width', 3);
            group.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                .attr('font-size', '22px').text('📱');
            group.append('text').attr('text-anchor', 'middle').attr('y', 50)
                .attr('font-size', '10px').attr('font-weight', 'bold').attr('fill', '#065f46')
                .text('Authoritative');
            group.transition().duration(600).style('opacity', 1);

            // Arrow from CP to directory
            setTimeout(() => {
                const dy = 100 - 280;
                svg.append('path')
                    .attr('d', `M ${cp.x} ${cp.y - 35} L ${cp.x} ${100 + 50}`)
                    .attr('stroke', '#10b981').attr('stroke-width', 2)
                    .attr('stroke-dasharray', '5,3')
                    .style('opacity', 0).transition().duration(600).style('opacity', 1);
            }, 300);
        }, 1100 + i * 500);
    });

    // Label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 360)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('Directory helps, but CPs remain authoritative')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3000);
}

// Scene 8: Conflict Resolution
function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Title
    svg.append('text').attr('x', 350).attr('y', 35)
        .attr('text-anchor', 'middle').attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('Conflicting Information About 02012345')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    // CP1 thinks it belongs to CP2
    setTimeout(() => {
        const cp1 = svg.append('g').attr('transform', 'translate(180, 140)').style('opacity', 0);
        cp1.append('circle').attr('r', 30).attr('fill', '#3b82f6');
        cp1.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📱');
        cp1.append('text').attr('text-anchor', 'middle').attr('y', 50)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('CP1');

        const belief1 = cp1.append('g').attr('transform', 'translate(0, 90)');
        belief1.append('rect')
            .attr('x', -75).attr('y', -30).attr('width', 150).attr('height', 60)
            .attr('rx', 5).attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 2);
        belief1.append('text').attr('text-anchor', 'middle').attr('y', -5)
            .attr('font-size', '11px').attr('fill', '#991b1b')
            .text('Belongs to CP2');
        belief1.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '10px').attr('fill', '#991b1b')
            .text('Timestamp: 10:00');

        cp1.transition().duration(600).style('opacity', 1);
    }, 900);

    // CP4 thinks it belongs to CP3
    setTimeout(() => {
        const cp4 = svg.append('g').attr('transform', 'translate(520, 140)').style('opacity', 0);
        cp4.append('circle').attr('r', 30).attr('fill', '#3b82f6');
        cp4.append('text').attr('text-anchor', 'middle').attr('dy', 5)
            .attr('font-size', '22px').text('📱');
        cp4.append('text').attr('text-anchor', 'middle').attr('y', 50)
            .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('CP4');

        const belief2 = cp4.append('g').attr('transform', 'translate(0, 90)');
        belief2.append('rect')
            .attr('x', -75).attr('y', -30).attr('width', 150).attr('height', 60)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        belief2.append('text').attr('text-anchor', 'middle').attr('y', -5)
            .attr('font-size', '11px').attr('fill', '#065f46')
            .text('Belongs to CP3');
        belief2.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '10px').attr('fill', '#065f46')
            .text('Timestamp: 10:30');

        cp4.transition().duration(600).style('opacity', 1);
    }, 1500);

    // Resolution rule
    setTimeout(() => {
        const resolution = svg.append('g').attr('transform', 'translate(350, 300)').style('opacity', 0);
        resolution.append('rect')
            .attr('x', -160).attr('y', -35).attr('width', 320).attr('height', 70)
            .attr('rx', 5).attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 3);
        resolution.append('text').attr('text-anchor', 'middle').attr('y', -10)
            .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#1e40af')
            .text('Resolution: Latest Timestamp Wins');
        resolution.append('text').attr('text-anchor', 'middle').attr('y', 10)
            .attr('font-size', '12px').attr('fill', '#1e40af')
            .text('10:30 > 10:00');
        resolution.append('text').attr('text-anchor', 'middle').attr('y', 25)
            .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('✓ Number belongs to CP3');
        resolution.transition().duration(800).style('opacity', 1);
    }, 2200);
}

// Scene 9: No Single Point of Failure
function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Network of CPs
    const cpPositions = [
        { x: 150, y: 100, label: 'CP1', status: 'active' },
        { x: 350, y: 100, label: 'CP2', status: 'failed' },
        { x: 550, y: 100, label: 'CP3', status: 'active' },
        { x: 250, y: 250, label: 'CP4', status: 'active' },
        { x: 450, y: 250, label: 'CP5', status: 'active' }
    ];

    cpPositions.forEach((pos, i) => {
        setTimeout(() => {
            const cp = svg.append('g').attr('transform', `translate(${pos.x}, ${pos.y})`).style('opacity', 0);

            if (pos.status === 'failed') {
                // Failed CP
                cp.append('circle').attr('r', 30).attr('fill', '#ef4444').attr('opacity', 0.5);
                cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                    .attr('font-size', '22px').text('❌');
                cp.append('text').attr('text-anchor', 'middle').attr('y', 50)
                    .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#991b1b')
                    .text('FAILED');
            } else {
                // Active CP
                cp.append('circle').attr('r', 30).attr('fill', '#10b981');
                cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                    .attr('font-size', '22px').text('📱');
                cp.append('text').attr('text-anchor', 'middle').attr('y', 50)
                    .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#065f46')
                    .text('ACTIVE');
            }

            cp.append('text').attr('text-anchor', 'middle').attr('y', -45)
                .attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', '#1f2937')
                .text(pos.label);

            cp.transition().duration(600).style('opacity', 1);
        }, 500 + i * 400);
    });

    // Connections between active CPs (skip failed)
    setTimeout(() => {
        const connections = [
            { from: 0, to: 2 }, // CP1 to CP3
            { from: 0, to: 3 }, // CP1 to CP4
            { from: 2, to: 4 }, // CP3 to CP5
            { from: 3, to: 4 }  // CP4 to CP5
        ];

        connections.forEach((conn, i) => {
            setTimeout(() => {
                const from = cpPositions[conn.from];
                const to = cpPositions[conn.to];
                svg.append('path')
                    .attr('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`)
                    .attr('stroke', '#10b981').attr('stroke-width', 2).attr('opacity', 0.3)
                    .style('opacity', 0).transition().duration(600).style('opacity', 1);
            }, i * 200);
        });
    }, 2500);

    // Resilience label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ System continues operating despite failure')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3500);
}

// Scene 10: Scalability Properties
function setupScene10() {
    const svg = d3.select('#scene-10-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Small network (5 CPs)
    const small = svg.append('g').attr('transform', 'translate(150, 120)').style('opacity', 0);
    small.append('text').attr('text-anchor', 'middle').attr('y', -60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
        .text('5 CPs');

    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * 50;
        const y = Math.sin(angle) * 50;
        small.append('circle').attr('cx', x).attr('cy', y).attr('r', 12).attr('fill', '#3b82f6');
    }

    small.append('text').attr('text-anchor', 'middle').attr('y', 80)
        .attr('font-size', '12px').attr('fill', '#4b5563')
        .text('Capacity: 5x');

    small.transition().duration(600).delay(500).style('opacity', 1);

    // Large network (15 CPs)
    setTimeout(() => {
        const large = svg.append('g').attr('transform', 'translate(500, 120)').style('opacity', 0);
        large.append('text').attr('text-anchor', 'middle').attr('y', -80)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937')
            .text('15 CPs');

        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * 70;
            const y = Math.sin(angle) * 70;
            large.append('circle').attr('cx', x).attr('cy', y).attr('r', 10).attr('fill', '#10b981');
        }

        large.append('text').attr('text-anchor', 'middle').attr('y', 100)
            .attr('font-size', '12px').attr('fill', '#4b5563')
            .text('Capacity: 15x');

        large.transition().duration(800).style('opacity', 1);
    }, 1300);

    // Arrow showing growth
    setTimeout(() => {
        svg.append('path')
            .attr('d', 'M 230 120 L 420 120')
            .attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-sync)')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);

        svg.append('text').attr('x', 325).attr('y', 110)
            .attr('text-anchor', 'middle').attr('font-size', '12px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('Add more CPs →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2100);

    // Horizontal scaling label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 300)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Capacity grows linearly with participants')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2900);
}

// Scene 11: Global Consistency
function setupScene11() {
    const svg = d3.select('#scene-11-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Add arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrow-propagate')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#10b981');

    // Network of 6 CPs in circle
    const cpCount = 6;
    const radius = 100;
    const centerX = 350;
    const centerY = 180;

    for (let i = 0; i < cpCount; i++) {
        setTimeout(() => {
            const angle = (i / cpCount) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            const cp = svg.append('g').attr('transform', `translate(${x}, ${y})`).style('opacity', 0);
            cp.append('circle').attr('r', 25).attr('fill', i === 0 ? '#10b981' : '#d1d5db');
            cp.append('text').attr('text-anchor', 'middle').attr('dy', 5)
                .attr('font-size', '18px').text(i === 0 ? '✓' : '');
            cp.transition().duration(400).style('opacity', 1);
        }, 500 + i * 200);
    }

    // Animate propagation waves
    setTimeout(() => {
        const waves = [1, 2, 3, 4, 5];
        waves.forEach((target, idx) => {
            setTimeout(() => {
                const angle = (target / cpCount) * Math.PI * 2 - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                // Update CP to show it now knows
                svg.selectAll('g').filter(function() {
                    const transform = d3.select(this).attr('transform');
                    return transform && transform.includes(`translate(${x}, ${y})`);
                }).select('circle').transition().duration(400).attr('fill', '#10b981');

                svg.selectAll('g').filter(function() {
                    const transform = d3.select(this).attr('transform');
                    return transform && transform.includes(`translate(${x}, ${y})`);
                }).select('text').transition().duration(400).text('✓');

            }, idx * 600);
        });
    }, 2000);

    // Convergence label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 330)
            .attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Information propagates, system converges')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 5500);
}

// Scene 12: Cost Implications
function setupScene12() {
    const svg = d3.select('#scene-12-diagram');
    if (!svg.node()) return;
    svg.selectAll('*').remove();

    // Central approach cost
    const central = svg.append('g').attr('transform', 'translate(180, 160)').style('opacity', 0);
    central.append('rect')
        .attr('x', -100).attr('y', -90).attr('width', 200).attr('height', 180)
        .attr('rx', 5).attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 3);
    central.append('text').attr('text-anchor', 'middle').attr('y', -60)
        .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#991b1b')
        .text('Central Database');
    central.append('text').attr('text-anchor', 'middle').attr('y', -30)
        .attr('font-size', '30px').text('🏛️');

    central.append('text').attr('text-anchor', 'middle').attr('y', 10)
        .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#991b1b')
        .text('Build: £5 billion');
    central.append('text').attr('text-anchor', 'middle').attr('y', 30)
        .attr('font-size', '12px').attr('fill', '#991b1b')
        .text('Operate: £100M/year');
    central.append('text').attr('text-anchor', 'middle').attr('y', 60)
        .attr('font-size', '16px').attr('fill', '#991b1b')
        .text('❌');

    central.transition().duration(800).delay(500).style('opacity', 1);

    // PSTN2 distributed approach cost
    setTimeout(() => {
        const distributed = svg.append('g').attr('transform', 'translate(520, 160)').style('opacity', 0);
        distributed.append('rect')
            .attr('x', -100).attr('y', -90).attr('width', 200).attr('height', 180)
            .attr('rx', 5).attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        distributed.append('text').attr('text-anchor', 'middle').attr('y', -60)
            .attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('PSTN2 Distributed');

        // Multiple small CP icons
        for (let i = 0; i < 4; i++) {
            const x = -40 + (i % 2) * 80;
            const y = -20 + Math.floor(i / 2) * 40;
            distributed.append('circle').attr('cx', x).attr('cy', y).attr('r', 15).attr('fill', '#10b981');
            distributed.append('text').attr('x', x).attr('y', y + 4)
                .attr('text-anchor', 'middle').attr('font-size', '12px').text('📱');
        }

        distributed.append('text').attr('text-anchor', 'middle').attr('y', 60)
            .attr('font-size', '13px').attr('font-weight', 'bold').attr('fill', '#065f46')
            .text('Cost: £0 centrally');
        distributed.append('text').attr('text-anchor', 'middle').attr('y', 80)
            .attr('font-size', '12px').attr('fill', '#065f46')
            .text('(Use existing infrastructure)');

        distributed.transition().duration(800).style('opacity', 1);
    }, 1300);

    // Savings label
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 320)
            .attr('text-anchor', 'middle').attr('font-size', '16px')
            .attr('font-weight', 'bold').attr('fill', '#10b981')
            .text('✓ Savings: £5 billion + £100M annually')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2200);
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
