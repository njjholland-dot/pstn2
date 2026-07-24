// PSTN2 Problem Statement Animation
// Interactive web-based animation with D3.js and GSAP

let currentScene = 1;
const totalScenes = 8;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;
let speechSessionId = 0;
let narrationTimer = null;
let cachedVoices = [];

// Scene durations in milliseconds (fallback if audio disabled or fails)
const sceneDurations = {
    1: 8000,  // 8 seconds
    2: 9000,  // 9 seconds
    3: 8000,
    4: 7000,
    5: 9000,
    6: 10000,
    7: 8000,
    8: 4000
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    setupScene1();
    updateProgress();

    // Load voices for speech synthesis
    if ('speechSynthesis' in window) {
        cachedVoices = speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {
            cachedVoices = speechSynthesis.getVoices();
        };
    }

    // Speak first scene narration after a short delay
    setTimeout(() => {
        const narration = document.querySelector('#scene-1 .narration');
        if (narration) {
            const text = narration.getAttribute('data-speech');
            speak(text, speechEndCallback);
        }
    }, 1500);
});

// Control Setup
function setupControls() {
    document.getElementById('prev-btn').addEventListener('click', previousScene);
    document.getElementById('next-btn').addEventListener('click', nextScene);
    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('audio-btn').addEventListener('click', toggleAudio);

    updateButtons();
}

// Text-to-Speech Functions
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

function previousScene() {
    if (currentScene > 1) {
        goToScene(currentScene - 1);
    } else {
        // On the first scene, go back to homepage
        window.location.href = '/index.html';
    }
}

function nextScene() {
    if (currentScene < totalScenes) {
        goToScene(currentScene + 1);
    } else {
        // On the last scene, go back to homepage
        window.location.href = '/index.html';
    }
}

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

// Scene-specific setup
function setupSceneAnimations(sceneNum) {
    switch(sceneNum) {
        case 1:
            setupScene1();
            break;
        case 2:
            setupScene2();
            break;
        case 3:
            setupScene3();
            break;
        case 4:
            setupScene4();
            break;
        case 5:
            setupScene5();
            break;
        case 6:
            setupScene6();
            break;
        case 7:
            setupScene7();
            break;
        case 8:
            setupScene8();
            break;
    }
}

// Scene 1: The Vulnerable PSTN
function setupScene1() {
    const svg = d3.select('#network-diagram');
    svg.selectAll('*').remove();

    const width = 600;
    const height = 400;

    // Draw network nodes
    const nodes = [
        { x: 300, y: 200, size: 40, label: 'PSTN', color: '#3b82f6' },
        { x: 150, y: 100, size: 25, label: 'CP1', color: '#64748b' },
        { x: 450, y: 100, size: 25, label: 'CP2', color: '#64748b' },
        { x: 150, y: 300, size: 25, label: 'CP3', color: '#64748b' },
        { x: 450, y: 300, size: 25, label: 'CP4', color: '#64748b' },
    ];

    // Draw connections (tangled web)
    const connections = [
        [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 2], [2, 4], [3, 4], [1, 3]
    ];

    // Animate connections
    connections.forEach((conn, i) => {
        const source = nodes[conn[0]];
        const target = nodes[conn[1]];

        svg.append('line')
            .attr('x1', source.x)
            .attr('y1', source.y)
            .attr('x2', source.x)
            .attr('y2', source.y)
            .attr('stroke', '#cbd5e1')
            .attr('stroke-width', 2)
            .attr('opacity', 0)
            .transition()
            .delay(300 + i * 100)
            .duration(500)
            .attr('x2', target.x)
            .attr('y2', target.y)
            .attr('opacity', 0.6);
    });

    // Draw nodes
    nodes.forEach((node, i) => {
        const g = svg.append('g')
            .attr('transform', `translate(${node.x}, ${node.y})`)
            .style('opacity', 0);

        g.append('circle')
            .attr('r', node.size)
            .attr('fill', node.color)
            .attr('stroke', 'white')
            .attr('stroke-width', 3);

        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', 'white')
            .attr('font-weight', 'bold')
            .attr('font-size', '14px')
            .text(node.label);

        g.transition()
            .delay(500 + i * 150)
            .duration(600)
            .style('opacity', 1);
    });

    // Add warning symbols
    setTimeout(() => {
        [1, 2, 3, 4].forEach((i) => {
            svg.append('text')
                .attr('x', nodes[i].x + 30)
                .attr('y', nodes[i].y - 30)
                .attr('font-size', '30px')
                .attr('opacity', 0)
                .text('⚠️')
                .transition()
                .duration(500)
                .attr('opacity', 1);
        });
    }, 2000);

    // Animate fraud statistic counter
    animateCounter('#fraud-value', 0, 38, 3000, '${value}B');
}

// Scene 2: The Fraud Problem
function setupScene2() {
    setTimeout(() => {
        const moneyFlow = document.getElementById('money-flow');

        // Create animated money bags moving from left blue border of victim box to right border of fraudster box
        // Victim is on right side (starts around 50% of container width + gap/2)
        // Fraudster is on left side (ends near 0%)
        let moneyHtml = '';
        for (let i = 0; i < 5; i++) {
            const delay = i * 0.4;
            moneyHtml += `<span style="
                position: absolute;
                left: calc(50% + 210px);
                top: 50%;
                transform: translateY(-50%);
                animation: moveMoneyLeft 2s ease-in ${delay}s infinite;
                font-size: 2em;
            ">💰</span>`;
        }
        moneyFlow.innerHTML = moneyHtml;

        // Add keyframe animation
        if (!document.getElementById('money-animation-style')) {
            const style = document.createElement('style');
            style.id = 'money-animation-style';
            style.textContent = `
                @keyframes moveMoneyLeft {
                    0% {
                        left: calc(50% + 210px);
                        opacity: 0;
                    }
                    10% {
                        opacity: 1;
                    }
                    85% {
                        opacity: 1;
                    }
                    100% {
                        left: 30px;
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }, 2000);
}

// Scene 3: Innovation Timeline
function setupScene3() {
    const svg = d3.select('#timeline');
    svg.selectAll('*').remove();

    const width = 800;
    const height = 350;

    // Timeline data
    const timelineData = [
        { year: '1980s', label: 'TDM Era', value: 80, color: '#3b82f6' },
        { year: '2000s', label: 'Early IP', value: 90, color: '#10b981' },
        { year: '2010s', label: 'Stagnation', value: 40, color: '#ef4444' },
        { year: 'Now', label: 'Current', value: 4, color: '#dc2626' }
    ];

    const x = d3.scaleBand()
        .domain(timelineData.map(d => d.year))
        .range([100, width - 100])
        .padding(0.3);

    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([height - 60, 60]);

    // Draw bars
    svg.selectAll('rect')
        .data(timelineData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.year))
        .attr('y', height - 60)
        .attr('width', x.bandwidth())
        .attr('height', 0)
        .attr('fill', d => d.color)
        .attr('rx', 8)
        .transition()
        .delay((d, i) => i * 300)
        .duration(800)
        .attr('y', d => y(d.value))
        .attr('height', d => height - 60 - y(d.value));

    // Add labels
    svg.selectAll('text.year')
        .data(timelineData)
        .enter()
        .append('text')
        .attr('class', 'year')
        .attr('x', d => x(d.year) + x.bandwidth() / 2)
        .attr('y', height - 35)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#374151')
        .text(d => d.year)
        .style('opacity', 0)
        .transition()
        .delay((d, i) => i * 300 + 400)
        .duration(500)
        .style('opacity', 1);

    // Add value labels
    svg.selectAll('text.label')
        .data(timelineData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.year) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .attr('fill', d => d.color)
        .text(d => d.label)
        .style('opacity', 0)
        .transition()
        .delay((d, i) => i * 300 + 600)
        .duration(500)
        .style('opacity', 1);
}

// Scene 4: Regulatory Gap
function setupScene4() {
    const svg = d3.select('#regulatory-gap');
    svg.selectAll('*').remove();

    const width = 800;
    const height = 350;
    const margin = { top: 40, right: 40, bottom: 60, left: 80 };

    // Create axes
    const xScale = d3.scaleLinear()
        .domain([1980, 2025])
        .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([height - margin.bottom, margin.top]);

    // Y-axis label
    svg.append('text')
        .attr('x', -height / 2)
        .attr('y', 20)
        .attr('transform', 'rotate(-90)')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#374151')
        .text('Pace of Change')
        .style('opacity', 0)
        .transition()
        .delay(300)
        .duration(500)
        .style('opacity', 1);

    // Draw axes
    const xAxis = d3.axisBottom(xScale).ticks(5);
    const yAxis = d3.axisLeft(yScale).tickFormat('');

    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(xAxis)
        .style('opacity', 0)
        .transition()
        .delay(500)
        .duration(500)
        .style('opacity', 1);

    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(yAxis)
        .style('opacity', 0)
        .transition()
        .delay(500)
        .duration(500)
        .style('opacity', 1);

    // Regulation line (flat horizontal, crosses Technology line at year 2000)
    const regulationData = [
        { year: 1980, value: 40 },
        { year: 2025, value: 40 }
    ];

    const regulationLine = d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.value));

    svg.append('path')
        .datum(regulationData)
        .attr('d', regulationLine)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 4)
        .attr('fill', 'none')
        .attr('stroke-dasharray', function() {
            return this.getTotalLength();
        })
        .attr('stroke-dashoffset', function() {
            return this.getTotalLength();
        })
        .transition()
        .delay(800)
        .duration(2000)
        .attr('stroke-dashoffset', 0);

    // Technology line (logarithmic growth with 50% steeper in last 3 years, 200% steeper in last 2 years)
    const technologyData = [
        { year: 1980, value: 15 },
        { year: 1990, value: 25 },
        { year: 2000, value: 40 },
        { year: 2010, value: 65 },
        { year: 2020, value: 75 },
        { year: 2022, value: 79 },
        { year: 2023, value: 83 },
        { year: 2024, value: 90 },
        { year: 2025, value: 98 }
    ];

    const technologyLine = d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    svg.append('path')
        .datum(technologyData)
        .attr('d', technologyLine)
        .attr('stroke', '#10b981')
        .attr('stroke-width', 4)
        .attr('fill', 'none')
        .attr('stroke-dasharray', function() {
            return this.getTotalLength();
        })
        .attr('stroke-dashoffset', function() {
            return this.getTotalLength();
        })
        .transition()
        .delay(800)
        .duration(2000)
        .attr('stroke-dashoffset', 0);

    // Add labels
    svg.append('text')
        .attr('x', width - margin.right - 120)
        .attr('y', yScale(95) - 10)
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#10b981')
        .text('Technology')
        .style('opacity', 0)
        .transition()
        .delay(2500)
        .duration(500)
        .style('opacity', 1);

    svg.append('text')
        .attr('x', width - margin.right - 120)
        .attr('y', yScale(25) + 20)
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#ef4444')
        .text('Telecom Regulation')
        .style('opacity', 0)
        .transition()
        .delay(2500)
        .duration(500)
        .style('opacity', 1);

    // Add gap indicator
    svg.append('text')
        .attr('x', xScale(2010))
        .attr('y', yScale(45))
        .attr('text-anchor', 'middle')
        .attr('font-size', '18px')
        .attr('font-weight', 'bold')
        .attr('fill', '#dc2626')
        .text('↕ GAP')
        .style('opacity', 0)
        .transition()
        .delay(3000)
        .duration(500)
        .style('opacity', 1);
}

// Scenes 5-8: Already styled with CSS animations
function setupScene5() {
    // CDB building already animated with CSS
}

function setupScene6() {
    // Capabilities list already animated with CSS
}

function setupScene7() {
    // Challenge scene already animated with CSS

    // Add radiating paths
    setTimeout(() => {
        const pathsContainer = document.getElementById('paths');
        let pathsHtml = '';
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) - 90;
            pathsHtml += `<div class="path" style="
                position: absolute;
                width: 150px;
                height: 4px;
                background: linear-gradient(90deg, #3b82f6 0%, transparent 100%);
                transform: rotate(${angle}deg);
                transform-origin: left center;
                opacity: 0;
                animation: pathGlow 1s ease ${i * 0.1}s forwards;
            "></div>`;
        }
        pathsContainer.innerHTML = pathsHtml;

        // Add keyframe
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pathGlow {
                to {
                    opacity: 0.6;
                }
            }
        `;
        document.head.appendChild(style);
    }, 1500);
}

function setupScene8() {
    // PSTN2 logo already animated with CSS
}

// Utility: Animate counter
function animateCounter(selector, start, end, duration, format = '{value}') {
    const element = document.querySelector(selector);
    if (!element) return;

    const startTime = Date.now();
    const range = end - start;

    const animate = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const current = start + (range * progress);

        element.textContent = format.replace('{value}', current.toFixed(1));

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };

    requestAnimationFrame(animate);
}

// Keyboard navigation
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
