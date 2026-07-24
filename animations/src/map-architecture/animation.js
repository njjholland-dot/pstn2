// PSTN2 MAP Architecture: Democratizing Access Animation

let currentScene = 1;
const totalScenes = 11;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

const sceneDurations = {
    "1": 13000, "2": 13000, "3": 14000, "4": 13000, "5": 12000,
    "6": 13000, "7": 13000, "8": 13000, "9": 12000, "10": 15000, "11": 13000
};

document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    setupScene1();
    updateProgress();
    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
    setTimeout(() => {
        const narration = document.querySelector('#scene-1 .narration');
        if (narration) speak(narration.getAttribute('data-speech'), speechEndCallback);
    }, 1500);
});

function setupControls() {
    document.getElementById('prev-btn').addEventListener('click', previousScene);
    document.getElementById('next-btn').addEventListener('click', nextScene);
    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('audio-btn').addEventListener('click', toggleAudio);
    updateButtons();
}

function previousScene() {
    if (currentScene > 1) {
        goToScene(currentScene - 1);
    } else {
        window.location.href = '/index.html';
    }
}

function nextScene() {
    if (currentScene < totalScenes) {
        goToScene(currentScene + 1);
    } else {
        window.location.href = '/index.html';
    }
}

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
        if (narration) {
            const text = narration.getAttribute('data-speech');
            speak(text, speechEndCallback);
        }
    }, 800);
}

function updateButtons() {
    document.getElementById('prev-btn').disabled = false;
    document.getElementById('next-btn').disabled = false;
}

function updateProgress() {
    const progress = (currentScene / totalScenes) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
}

function stopSpeech() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    currentUtterance = null;
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const audioBtn = document.getElementById('audio-btn');
    if (audioEnabled) {
        audioBtn.textContent = '🔊 Audio On';
        audioBtn.classList.remove('audio-off');
        const narration = document.querySelector(`#scene-${currentScene} .narration`);
        if (narration) {
            const text = narration.getAttribute('data-speech');
            speak(text);
        }
    } else {
        audioBtn.textContent = '🔇 Audio Off';
        audioBtn.classList.add('audio-off');
        stopSpeech();
    }
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
        currentUtterance.onend = () => {
            if (onComplete) onComplete();
        };
        currentUtterance.onerror = (e) => {
            console.error('Speech error:', e);
            if (onComplete) onComplete();
        };
        speechSynthesis.speak(currentUtterance);
    } else if (onComplete) {
        onComplete();
    }
}

function setupSceneAnimations(sceneNum) { const setupFn = window[`setupScene${sceneNum}`]; if (typeof setupFn === 'function') setupFn(); }

// Scene 1: The Small CP Challenge
function setupScene1() {
    const svg = d3.select('#scene-1-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('defs').append('marker').attr('id', 'arrow-map').attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#ef4444');

    // Large CP with resources
    const largeCp = svg.append('g').attr('transform', 'translate(150, 120)').style('opacity', 0);
    largeCp.append('circle').attr('r', 40).attr('fill', '#10b981');
    largeCp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('🏢');
    largeCp.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937').text('Large CP');
    largeCp.transition().duration(600).delay(300).style('opacity', 1);

    setTimeout(() => {
        const resources = [
            { y: 90, label: '✓ Engineering team', color: '#10b981' },
            { y: 110, label: '✓ Infrastructure', color: '#10b981' },
            { y: 130, label: '✓ APIs & TLS', color: '#10b981' }
        ];
        resources.forEach((r, i) => {
            largeCp.append('text').attr('text-anchor', 'middle').attr('y', r.y).attr('font-size', '11px')
                .attr('fill', r.color).text(r.label).style('opacity', 0).transition().duration(400).delay(i * 150).style('opacity', 1);
        });
    }, 1000);

    // Small CP struggling
    setTimeout(() => {
        const smallCp = svg.append('g').attr('transform', 'translate(550, 120)').style('opacity', 0);
        smallCp.append('circle').attr('r', 35).attr('fill', '#ef4444');
        smallCp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '26px').text('🏠');
        smallCp.append('text').attr('text-anchor', 'middle').attr('y', 55).attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#1f2937').text('Small CP');
        smallCp.transition().duration(600).style('opacity', 1);

        setTimeout(() => {
            const lacks = [
                { y: 85, label: '❌ No tech staff', color: '#991b1b' },
                { y: 105, label: '❌ No infrastructure', color: '#991b1b' },
                { y: 125, label: '❌ Can\'t build PSTN2', color: '#991b1b' }
            ];
            lacks.forEach((l, i) => {
                smallCp.append('text').attr('text-anchor', 'middle').attr('y', l.y).attr('font-size', '11px')
                    .attr('fill', l.color).text(l.label).style('opacity', 0).transition().duration(400).delay(i * 150).style('opacity', 1);
            });
        }, 400);
    }, 1700);

    // Problem statement
    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 330).attr('text-anchor', 'middle').attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#ef4444').text('Problem: Small CPs locked out of PSTN2 benefits')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2800);
}

// Scene 2: Managed Access Providers
function setupScene2() {
    const svg = d3.select('#scene-2-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    // MAP in center (cloud service)
    const map = svg.append('g').attr('transform', 'translate(350, 150)').style('opacity', 0);
    map.append('rect').attr('x', -100).attr('y', -70).attr('width', 200).attr('height', 140).attr('rx', 10)
        .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 3);
    map.append('text').attr('text-anchor', 'middle').attr('y', -40).attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', '#1e40af').text('MAP');
    map.append('text').attr('text-anchor', 'middle').attr('y', -20).attr('font-size', '12px').attr('fill', '#1e40af').text('Managed Access Provider');
    map.append('text').attr('text-anchor', 'middle').attr('y', 10).attr('font-size', '40px').text('☁️');
    map.append('text').attr('text-anchor', 'middle').attr('y', 50).attr('font-size', '11px').attr('fill', '#1e40af').text('Hosted PSTN2 Service');
    map.transition().duration(800).delay(300).style('opacity', 1);

    // Small CPs connecting
    const cpPositions = [{x: 100, y: 100}, {x: 100, y: 200}, {x: 600, y: 100}, {x: 600, y: 200}];
    cpPositions.forEach((pos, i) => {
        setTimeout(() => {
            const cp = svg.append('g').attr('transform', `translate(${pos.x}, ${pos.y})`).style('opacity', 0);
            cp.append('circle').attr('r', 25).attr('fill', '#10b981');
            cp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '18px').text('🏠');
            cp.append('text').attr('text-anchor', 'middle').attr('y', 40).attr('font-size', '10px').attr('font-weight', 'bold').attr('fill', '#065f46').text(`Small CP${i+1}`);
            cp.transition().duration(600).style('opacity', 1);

            setTimeout(() => {
                const dx = 350 - pos.x, dy = 150 - pos.y, len = Math.sqrt(dx*dx + dy*dy);
                const sx = pos.x + (dx/len)*30, sy = pos.y + (dy/len)*30, ex = pos.x + (dx/len)*(len-110), ey = pos.y + (dy/len)*(len-110);
                svg.append('path').attr('d', `M ${sx} ${sy} L ${ex} ${ey}`).attr('stroke', '#10b981').attr('stroke-width', 2)
                    .attr('marker-end', 'url(#arrow-map)').attr('stroke-dasharray', '5,3').style('opacity', 0).transition().duration(600).style('opacity', 1);
            }, 300);
        }, 1100 + i * 400);
    });

    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340).attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('✓ MAPs handle all complexity for small CPs')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3200);
}

// Scene 3: Services Offered
function setupScene3() {
    const svg = d3.select('#scene-3-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 30).attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('MAP Services')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const services = [
        {x: 100, y: 120, icon: '🔐', label: 'Authentication\nAPIs', color: '#3b82f6'},
        {x: 250, y: 120, icon: '📂', label: 'Directory\nLookup', color: '#10b981'},
        {x: 400, y: 120, icon: '🔄', label: 'Number\nPorting', color: '#f59e0b'},
        {x: 550, y: 120, icon: '🚨', label: 'Emergency\nLocation', color: '#ef4444'},
        {x: 175, y: 260, icon: '🔑', label: 'Encryption\nKey Mgmt', color: '#8b5cf6'},
        {x: 525, y: 260, icon: '🌐', label: 'Web\nPortal', color: '#06b6d4'}
    ];

    services.forEach((svc, i) => {
        setTimeout(() => {
            const g = svg.append('g').attr('transform', `translate(${svc.x}, ${svc.y})`).style('opacity', 0);
            g.append('rect').attr('x', -55).attr('y', -45).attr('width', 110).attr('height', 90).attr('rx', 5)
                .attr('fill', `${svc.color}20`).attr('stroke', svc.color).attr('stroke-width', 2);
            g.append('text').attr('text-anchor', 'middle').attr('y', -10).attr('font-size', '30px').text(svc.icon);
            const lines = svc.label.split('\n');
            lines.forEach((line, j) => {
                g.append('text').attr('text-anchor', 'middle').attr('y', 20 + j*14).attr('font-size', '11px')
                    .attr('font-weight', 'bold').attr('fill', svc.color).text(line);
            });
            g.transition().duration(600).style('opacity', 1);
        }, 800 + i * 350);
    });
}

// Scene 4: Integration Options
function setupScene4() {
    const svg = d3.select('#scene-4-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 30).attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('Multiple Integration Options')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const options = [
        {y: 100, icon: '🌐', title: 'Web Portal', desc: 'No technical staff needed', color: '#3b82f6'},
        {y: 170, icon: '⚡', title: 'REST API', desc: 'Some technical capability', color: '#10b981'},
        {y: 240, icon: '📞', title: 'SIP Proxy', desc: 'Traditional PBX integration', color: '#f59e0b'},
        {y: 310, icon: '🔌', title: 'Pre-built Connectors', desc: 'Popular switching platforms', color: '#8b5cf6'}
    ];

    options.forEach((opt, i) => {
        setTimeout(() => {
            const g = svg.append('g').attr('transform', `translate(350, ${opt.y})`).style('opacity', 0);
            g.append('rect').attr('x', -250).attr('y', -25).attr('width', 500).attr('height', 50).attr('rx', 5)
                .attr('fill', `${opt.color}15`).attr('stroke', opt.color).attr('stroke-width', 2);
            g.append('text').attr('x', -220).attr('y', 5).attr('font-size', '28px').text(opt.icon);
            g.append('text').attr('x', -180).attr('y', -5).attr('font-size', '14px').attr('font-weight', 'bold')
                .attr('fill', opt.color).text(opt.title);
            g.append('text').attr('x', -180).attr('y', 15).attr('font-size', '11px').attr('fill', '#4b5563').text(opt.desc);
            g.transition().duration(600).style('opacity', 1);
        }, 800 + i * 450);
    });
}

// Scene 5: Competitive Market
function setupScene5() {
    const svg = d3.select('#scene-5-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 35).attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('Competitive MAP Market')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    const maps = [
        {x: 150, y: 140, name: 'MAP A', price: '£50/mo', rating: '⭐⭐⭐⭐⭐', color: '#3b82f6'},
        {x: 350, y: 140, name: 'MAP B', price: '£100/mo', rating: '⭐⭐⭐⭐', color: '#10b981'},
        {x: 550, y: 140, name: 'MAP C', price: '£75/mo', rating: '⭐⭐⭐⭐⭐', color: '#f59e0b'}
    ];

    maps.forEach((m, i) => {
        setTimeout(() => {
            const g = svg.append('g').attr('transform', `translate(${m.x}, ${m.y})`).style('opacity', 0);
            g.append('rect').attr('x', -80).attr('y', -60).attr('width', 160).attr('height', 120).attr('rx', 5)
                .attr('fill', `${m.color}20`).attr('stroke', m.color).attr('stroke-width', 2);
            g.append('text').attr('text-anchor', 'middle').attr('y', -30).attr('font-size', '14px')
                .attr('font-weight', 'bold').attr('fill', m.color).text(m.name);
            g.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', '28px').text('☁️');
            g.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '12px')
                .attr('font-weight', 'bold').attr('fill', m.color).text(m.price);
            g.append('text').attr('text-anchor', 'middle').attr('y', 48).attr('font-size', '11px').text(m.rating);
            g.transition().duration(600).style('opacity', 1);
        }, 900 + i * 500);
    });

    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 320).attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('✓ Competition drives innovation and keeps costs low')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2600);
}

// Scene 6: Cost Structure
function setupScene6() {
    const svg = d3.select('#scene-6-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    // In-house cost
    const inhouse = svg.append('g').attr('transform', 'translate(180, 160)').style('opacity', 0);
    inhouse.append('rect').attr('x', -100).attr('y', -90).attr('width', 200).attr('height', 180).attr('rx', 5)
        .attr('fill', '#fee2e2').attr('stroke', '#ef4444').attr('stroke-width', 3);
    inhouse.append('text').attr('text-anchor', 'middle').attr('y', -60).attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#991b1b').text('Build In-House');
    inhouse.append('text').attr('text-anchor', 'middle').attr('y', -30).attr('font-size', '30px').text('🏗️');
    inhouse.append('text').attr('text-anchor', 'middle').attr('y', 10).attr('font-size', '13px')
        .attr('font-weight', 'bold').attr('fill', '#991b1b').text('Engineers: £150k/yr');
    inhouse.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '12px').attr('fill', '#991b1b').text('Infrastructure: £50k/yr');
    inhouse.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#ef4444').text('Total: £200k+/year');
    inhouse.transition().duration(800).delay(500).style('opacity', 1);

    // MAP cost
    setTimeout(() => {
        const mapCost = svg.append('g').attr('transform', 'translate(520, 160)').style('opacity', 0);
        mapCost.append('rect').attr('x', -100).attr('y', -90).attr('width', 200).attr('height', 180).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        mapCost.append('text').attr('text-anchor', 'middle').attr('y', -60).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('Use MAP');
        mapCost.append('text').attr('text-anchor', 'middle').attr('y', -25).attr('font-size', '40px').text('☁️');
        mapCost.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('Subscription: £50-200/mo');
        mapCost.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('Total: £600-2,400/year');
        mapCost.transition().duration(800).style('opacity', 1);
    }, 1300);

    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 330).attr('text-anchor', 'middle').attr('font-size', '15px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('✓ 99% cost reduction with MAP')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2200);
}

// Scene 7: Security and Trust
function setupScene7() {
    const svg = d3.select('#scene-7-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    // Small CP (authoritative)
    const cp = svg.append('g').attr('transform', 'translate(150, 180)').style('opacity', 0);
    cp.append('circle').attr('r', 40).attr('fill', '#10b981').attr('stroke', '#065f46').attr('stroke-width', 3);
    cp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('🏠');
    cp.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#065f46').text('Small CP');
    cp.append('text').attr('text-anchor', 'middle').attr('y', 80).attr('font-size', '11px')
        .attr('font-weight', 'bold').attr('fill', '#065f46').text('(Authoritative)');
    cp.transition().duration(600).delay(300).style('opacity', 1);

    // MAP (service provider)
    setTimeout(() => {
        const map = svg.append('g').attr('transform', 'translate(550, 180)').style('opacity', 0);
        map.append('rect').attr('x', -80).attr('y', -55).attr('width', 160).attr('height', 110).attr('rx', 5)
            .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        map.append('text').attr('text-anchor', 'middle').attr('y', -30).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#1e40af').text('MAP');
        map.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', '30px').text('☁️');
        map.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', '11px').attr('fill', '#1e40af').text('(Infrastructure Only)');
        map.transition().duration(600).style('opacity', 1);
    }, 900);

    // Services arrow
    setTimeout(() => {
        svg.append('path').attr('d', 'M 195 180 L 465 180').attr('stroke', '#3b82f6').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-map)').style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 330).attr('y', 170).attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#1e40af').text('APIs & Services →').style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1600);

    // Control retention
    setTimeout(() => {
        const control = svg.append('g').attr('transform', 'translate(350, 310)').style('opacity', 0);
        control.append('rect').attr('x', -180).attr('y', -30).attr('width', 360).attr('height', 60).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        control.append('text').attr('text-anchor', 'middle').attr('y', -5).attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('✓ CP retains full control of numbers');
        control.append('text').attr('text-anchor', 'middle').attr('y', 15).attr('font-size', '12px')
            .attr('fill', '#065f46').text('MAP only provides infrastructure services');
        control.transition().duration(800).style('opacity', 1);
    }, 2400);
}

// Scene 8: Regulatory Position
function setupScene8() {
    const svg = d3.select('#scene-8-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    // Regulator at top
    const regulator = svg.append('g').attr('transform', 'translate(350, 80)').style('opacity', 0);
    regulator.append('rect').attr('x', -90).attr('y', -40).attr('width', 180).attr('height', 80).attr('rx', 5)
        .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 3);
    regulator.append('text').attr('text-anchor', 'middle').attr('y', -15).attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#1e40af').text('Regulator');
    regulator.append('text').attr('text-anchor', 'middle').attr('y', 10).attr('font-size', '28px').text('⚖️');
    regulator.transition().duration(600).delay(300).style('opacity', 1);

    // MAPs below with oversight
    const mapPositions = [{x: 180, label: 'MAP A'}, {x: 350, label: 'MAP B'}, {x: 520, label: 'MAP C'}];
    mapPositions.forEach((pos, i) => {
        setTimeout(() => {
            const m = svg.append('g').attr('transform', `translate(${pos.x}, 220)`).style('opacity', 0);
            m.append('rect').attr('x', -60).attr('y', -40).attr('width', 120).attr('height', 80).attr('rx', 5)
                .attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
            m.append('text').attr('text-anchor', 'middle').attr('y', -10).attr('font-size', '12px')
                .attr('font-weight', 'bold').attr('fill', '#92400e').text(pos.label);
            m.append('text').attr('text-anchor', 'middle').attr('y', 15).attr('font-size', '24px').text('☁️');
            m.append('text').attr('text-anchor', 'middle').attr('y', 35).attr('font-size', '10px')
                .attr('fill', '#92400e').text('Licensed');
            m.transition().duration(600).style('opacity', 1);

            setTimeout(() => {
                svg.append('path').attr('d', `M ${pos.x} 145 L ${pos.x} 175`).attr('stroke', '#3b82f6')
                    .attr('stroke-width', 2).attr('stroke-dasharray', '5,3').style('opacity', 0)
                    .transition().duration(600).style('opacity', 1);
            }, 400);
        }, 1000 + i * 400);
    });

    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 340).attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#3b82f6').text('✓ Regulatory oversight ensures accountability')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 2600);
}

// Scene 9: Network Effects
function setupScene9() {
    const svg = d3.select('#scene-9-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 35).attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('Economies of Scale')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    // Early stage: Few CPs
    const early = svg.append('g').attr('transform', 'translate(180, 160)').style('opacity', 0);
    early.append('text').attr('text-anchor', 'middle').attr('y', -80).attr('font-size', '13px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('Early: Few CPs');
    early.append('rect').attr('x', -80).attr('y', -60).attr('width', 160).attr('height', 120).attr('rx', 5)
        .attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
    early.append('text').attr('text-anchor', 'middle').attr('y', -35).attr('font-size', '12px').attr('fill', '#92400e').text('MAP Service');
    for (let i = 0; i < 3; i++) {
        early.append('circle').attr('cx', -30 + i*30).attr('cy', 0).attr('r', 12).attr('fill', '#10b981');
    }
    early.append('text').attr('text-anchor', 'middle').attr('y', 35).attr('font-size', '11px')
        .attr('fill', '#92400e').text('Cost: £200/mo');
    early.transition().duration(600).delay(800).style('opacity', 1);

    // Later stage: Many CPs
    setTimeout(() => {
        const later = svg.append('g').attr('transform', 'translate(520, 160)').style('opacity', 0);
        later.append('text').attr('text-anchor', 'middle').attr('y', -80).attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#1f2937').text('Later: Many CPs');
        later.append('rect').attr('x', -80).attr('y', -60).attr('width', 160).attr('height', 120).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        later.append('text').attr('text-anchor', 'middle').attr('y', -35).attr('font-size', '12px')
            .attr('fill', '#065f46').text('MAP Service');
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 3; j++) {
                later.append('circle').attr('cx', -45 + j*30).attr('cy', -15 + i*15).attr('r', 8).attr('fill', '#10b981');
            }
        }
        later.append('text').attr('text-anchor', 'middle').attr('y', 35).attr('font-size', '11px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('Cost: £75/mo ↓');
        later.transition().duration(800).style('opacity', 1);
    }, 1500);

    // Arrow
    setTimeout(() => {
        svg.append('path').attr('d', 'M 270 160 L 430 160').attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-map)').style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 350).attr('y', 150).attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('Scale →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2300);

    setTimeout(() => {
        svg.append('text').attr('x', 350).attr('y', 310).attr('text-anchor', 'middle').attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('✓ More CPs = Lower costs + Better features')
            .style('opacity', 0).transition().duration(800).style('opacity', 1);
    }, 3100);
}

// Scene 10: Real-World Example
function setupScene10() {
    const svg = d3.select('#scene-10-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    // Rural CP profile
    const cp = svg.append('g').attr('transform', 'translate(180, 120)').style('opacity', 0);
    cp.append('rect').attr('x', -90).attr('y', -60).attr('width', 180).attr('height', 120).attr('rx', 5)
        .attr('fill', '#fef3c7').attr('stroke', '#f59e0b').attr('stroke-width', 2);
    cp.append('text').attr('text-anchor', 'middle').attr('y', -35).attr('font-size', '14px')
        .attr('font-weight', 'bold').attr('fill', '#92400e').text('Rural CP');
    cp.append('text').attr('text-anchor', 'middle').attr('y', -10).attr('font-size', '24px').text('🏠');
    cp.append('text').attr('text-anchor', 'middle').attr('y', 15).attr('font-size', '11px').attr('fill', '#92400e').text('5,000 customers');
    cp.append('text').attr('text-anchor', 'middle').attr('y', 32).attr('font-size', '11px').attr('fill', '#92400e').text('2 employees');
    cp.transition().duration(600).delay(300).style('opacity', 1);

    // MAP subscription
    setTimeout(() => {
        svg.append('path').attr('d', 'M 275 120 L 425 120').attr('stroke', '#10b981').attr('stroke-width', 3)
            .attr('marker-end', 'url(#arrow-map)').style('opacity', 0).transition().duration(800).style('opacity', 1);
        svg.append('text').attr('x', 350).attr('y', 110).attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('font-weight', 'bold').attr('fill', '#10b981').text('£100/month →')
            .style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 1000);

    setTimeout(() => {
        const map = svg.append('g').attr('transform', 'translate(520, 120)').style('opacity', 0);
        map.append('rect').attr('x', -90).attr('y', -60).attr('width', 180).attr('height', 120).attr('rx', 5)
            .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 2);
        map.append('text').attr('text-anchor', 'middle').attr('y', -30).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#1e40af').text('MAP Service');
        map.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', '30px').text('☁️');
        map.transition().duration(600).style('opacity', 1);
    }, 1800);

    // Benefits
    setTimeout(() => {
        const benefits = svg.append('g').attr('transform', 'translate(350, 250)').style('opacity', 0);
        benefits.append('rect').attr('x', -200).attr('y', -60).attr('width', 400).attr('height', 120).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 2);
        benefits.append('text').attr('text-anchor', 'middle').attr('y', -35).attr('font-size', '13px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('Full PSTN2 Capabilities:');
        const caps = ['✓ Authentication', '✓ Direct Routing', '✓ Encryption', '✓ Emergency Location'];
        caps.forEach((cap, i) => {
            benefits.append('text').attr('text-anchor', 'middle').attr('y', -10 + i*15).attr('font-size', '11px')
                .attr('fill', '#065f46').text(cap);
        });
        benefits.transition().duration(800).style('opacity', 1);
    }, 2600);
}

// Scene 11: Democratization Impact
function setupScene11() {
    const svg = d3.select('#scene-11-diagram');
    if (!svg.node()) return; svg.selectAll('*').remove();

    svg.append('text').attr('x', 350).attr('y', 35).attr('text-anchor', 'middle').attr('font-size', '16px')
        .attr('font-weight', 'bold').attr('fill', '#1f2937').text('True Democratization')
        .style('opacity', 0).transition().duration(600).delay(300).style('opacity', 1);

    // Large CP
    const largeCp = svg.append('g').attr('transform', 'translate(150, 140)').style('opacity', 0);
    largeCp.append('circle').attr('r', 40).attr('fill', '#10b981');
    largeCp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '30px').text('🏢');
    largeCp.append('text').attr('text-anchor', 'middle').attr('y', 60).attr('font-size', '12px')
        .attr('font-weight', 'bold').attr('fill', '#065f46').text('Large CP');
    largeCp.append('text').attr('text-anchor', 'middle').attr('y', 80).attr('font-size', '11px')
        .attr('fill', '#065f46').text('Built in-house');
    largeCp.transition().duration(600).delay(800).style('opacity', 1);

    // Small CPs via MAP
    const smallCps = [{x: 380, y: 100}, {x: 520, y: 100}, {x: 380, y: 180}, {x: 520, y: 180}];
    smallCps.forEach((pos, i) => {
        setTimeout(() => {
            const cp = svg.append('g').attr('transform', `translate(${pos.x}, ${pos.y})`).style('opacity', 0);
            cp.append('circle').attr('r', 28).attr('fill', '#10b981');
            cp.append('text').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', '20px').text('🏠');
            cp.append('text').attr('text-anchor', 'middle').attr('y', 45).attr('font-size', '10px')
                .attr('fill', '#065f46').text('Small CP');
            cp.transition().duration(400).style('opacity', 1);
        }, 1400 + i * 300);
    });

    // MAP cloud
    setTimeout(() => {
        svg.append('text').attr('x', 450).attr('y', 230).attr('text-anchor', 'middle').attr('font-size', '11px')
            .attr('fill', '#1e40af').text('via MAP ☁️').style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2600);

    // Equal sign
    setTimeout(() => {
        svg.append('text').attr('x', 270).attr('y', 145).attr('text-anchor', 'middle').attr('font-size', '30px')
            .attr('fill', '#10b981').text('=').style('opacity', 0).transition().duration(600).style('opacity', 1);
    }, 2800);

    // Impact statement
    setTimeout(() => {
        const impact = svg.append('g').attr('transform', 'translate(350, 300)').style('opacity', 0);
        impact.append('rect').attr('x', -220).attr('y', -30).attr('width', 440).attr('height', 60).attr('rx', 5)
            .attr('fill', '#d1fae5').attr('stroke', '#10b981').attr('stroke-width', 3);
        impact.append('text').attr('text-anchor', 'middle').attr('y', -5).attr('font-size', '14px')
            .attr('font-weight', 'bold').attr('fill', '#065f46').text('✓ Everyone Gets Modern Telephony');
        impact.append('text').attr('text-anchor', 'middle').attr('y', 15).attr('font-size', '12px')
            .attr('fill', '#065f46').text('Large and small CPs benefit equally');
        impact.transition().duration(800).style('opacity', 1);
    }, 3100);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextScene(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); previousScene(); }
    else if (e.key === 'Enter') { e.preventDefault(); togglePlay(); }
});
