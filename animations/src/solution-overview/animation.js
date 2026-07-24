// PSTN2 Solution Overview Animation
// Interactive web-based animation with D3.js and GSAP

let currentScene = 1;
const totalScenes = 10;
let isPlaying = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechEndCallback = null;

// Scene durations in milliseconds (fallback if audio disabled or fails)
const sceneDurations = {
    1: 9000,
    2: 12000,
    3: 13000,
    4: 11000,
    5: 11000,
    6: 13000,
    7: 11000,
    8: 10000,
    9: 10000,
    10: 10000,
    11: 10000,
    12: 10000
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    setupScene1();
    updateProgress();

    // Load voices for speech synthesis
    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => {
            speechSynthesis.getVoices();
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
    if (!audioEnabled || !text) {
        if (onComplete) {
            setTimeout(onComplete, 100);
        }
        return;
    }

    stopSpeech();

    if ('speechSynthesis' in window) {
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;

        // Use a UK English voice (upper class accent)
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
            if (onComplete) {
                onComplete();
            }
        };

        currentUtterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            if (onComplete) {
                onComplete();
            }
        };

        speechSynthesis.speak(currentUtterance);
    } else if (onComplete) {
        onComplete();
    }
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
    stopSpeech();

    // Clean up scene 2 interval if leaving scene 2
    if (currentScene === 2) {
        cleanupScene2();
    }

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
        case 9:
            setupScene9();
            break;
        case 10:
            setupScene10();
            break;
    }
}

// Scene 1: The Core Insight
function setupScene1() {
    // Fade out CDB building
    setTimeout(() => {
        const cdb = document.querySelector('.cdb-building');
        if (cdb) {
            cdb.style.transition = 'opacity 1s ease';
            cdb.style.opacity = '0.2';
        }
    }, 2000);

    // Light up CP nodes
    setTimeout(() => {
        const cpNodes = document.querySelectorAll('.cp-node');
        cpNodes.forEach((node, i) => {
            setTimeout(() => {
                node.style.animation = 'pulse 1s ease infinite';
            }, i * 200);
        });
    }, 3000);
}

// Scene 2: Distributed Architecture
let scene2Interval = null;

function setupScene2() {
    const svg = d3.select('#uk-map');
    svg.selectAll('*').remove();

    const width = 700;
    const height = 400;

    // Simplified UK outline
    svg.append('rect')
        .attr('x', 100)
        .attr('y', 50)
        .attr('width', 500)
        .attr('height', 300)
        .attr('fill', 'none')
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 2)
        .attr('rx', 20);

    // CP locations
    const cps = [
        { x: 200, y: 150, label: 'CP1', color: '#3b82f6' },
        { x: 500, y: 120, label: 'CP2', color: '#3b82f6' },
        { x: 350, y: 200, label: 'CP3', color: '#3b82f6' },
        { x: 250, y: 280, label: 'CP4', color: '#3b82f6' },
        { x: 480, y: 270, label: 'CP5', color: '#3b82f6' }
    ];

    // Draw CPs
    cps.forEach((cp, i) => {
        const g = svg.append('g')
            .attr('transform', `translate(${cp.x}, ${cp.y})`)
            .style('opacity', 0);

        g.append('circle')
            .attr('r', 25)
            .attr('fill', cp.color)
            .attr('stroke', 'white')
            .attr('stroke-width', 3);

        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', 'white')
            .attr('font-weight', 'bold')
            .text(cp.label);

        g.transition()
            .delay(500 + i * 200)
            .duration(600)
            .style('opacity', 1);
    });

    // Function to create random query lines between CPs
    function createRandomQuery() {
        // Pick two random different CPs
        const cp1Index = Math.floor(Math.random() * cps.length);
        let cp2Index = Math.floor(Math.random() * cps.length);
        while (cp2Index === cp1Index) {
            cp2Index = Math.floor(Math.random() * cps.length);
        }

        const cp1 = cps[cp1Index];
        const cp2 = cps[cp2Index];

        // Create line
        const line = svg.append('line')
            .attr('x1', cp1.x)
            .attr('y1', cp1.y)
            .attr('x2', cp1.x)
            .attr('y2', cp1.y)
            .attr('stroke', '#10b981')
            .attr('stroke-width', 3)
            .attr('opacity', 0);

        // Animate line appearing
        line.transition()
            .duration(100)
            .attr('opacity', 0.8)
            .attr('x2', cp2.x)
            .attr('y2', cp2.y)
            .transition()
            .delay(200)
            .duration(100)
            .attr('opacity', 0)
            .remove();
    }

    // Start continuous random queries after CPs appear
    setTimeout(() => {
        // Clear any existing interval
        if (scene2Interval) {
            clearInterval(scene2Interval);
        }

        // Create queries continuously during voiceover (12 seconds)
        scene2Interval = setInterval(createRandomQuery, 400);

        // Stop after voiceover duration
        setTimeout(() => {
            if (scene2Interval) {
                clearInterval(scene2Interval);
                scene2Interval = null;
            }
        }, 12000);
    }, 2000);
}

// Clean up interval when leaving scene 2
function cleanupScene2() {
    if (scene2Interval) {
        clearInterval(scene2Interval);
        scene2Interval = null;
    }
}

// Scene 3: Core Capabilities
function setupScene3() {
    const icons = document.querySelectorAll('#scene-3 .capability-icon');
    icons.forEach((icon, i) => {
        icon.style.opacity = '0';
        icon.style.transform = 'scale(0)';
        setTimeout(() => {
            icon.style.transition = 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            icon.style.opacity = '1';
            icon.style.transform = 'scale(1)';
        }, 500 + i * 300);  // Reduced delay between icons from 400ms to 300ms for 6 icons
    });
}

// Scene 4: Optional Participation
function setupScene4() {
    let progress = 0;
    const targetProgress = 60;
    const duration = 4000;
    const startTime = Date.now();

    const progressBar = document.getElementById('adoption-progress');
    const percentage = document.getElementById('adoption-percentage');
    const timeline = document.getElementById('cp-timeline');

    // Create CP icons
    timeline.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const cp = document.createElement('div');
        cp.className = 'cp-timeline-icon';
        cp.style.left = `${i * 10}%`;
        cp.textContent = i < 6 ? '🟦' : '⬜';
        timeline.appendChild(cp);
    }

    function animateProgress() {
        const elapsed = Date.now() - startTime;
        const currentProgress = Math.min((elapsed / duration) * targetProgress, targetProgress);

        if (progressBar) {
            progressBar.style.width = `${currentProgress}%`;
        }
        if (percentage) {
            percentage.textContent = `${Math.round(currentProgress)}%`;
        }

        if (currentProgress < targetProgress) {
            requestAnimationFrame(animateProgress);
        }
    }

    setTimeout(() => {
        animateProgress();
    }, 1000);
}

// Scene 5: No Central Database Required
function setupScene5() {
    const items = document.querySelectorAll('.comparison-item');
    items.forEach((item, i) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        setTimeout(() => {
            item.style.transition = 'all 0.6s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 500 + i * 200);
    });
}

// Scene 6: How It Works - Simple Flow
function setupScene6() {
    const svg = d3.select('#flow-diagram');
    svg.selectAll('*').remove();

    const width = 800;
    const height = 350;

    // Define arrowhead marker
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('markerWidth', 10)
        .attr('markerHeight', 10)
        .attr('refX', 9)
        .attr('refY', 3)
        .attr('orient', 'auto')
        .append('polygon')
        .attr('points', '0 0, 10 3, 0 6')
        .attr('fill', '#10b981');

    // Draw main components
    // Ofcom on the left, aligned with CP vertically
    const ofcomLists = svg.append('g').attr('id', 'ofcom-lists-box').style('opacity', 0);
    ofcomLists.append('rect')
        .attr('x', 30).attr('y', 190)
        .attr('width', 100).attr('height', 80)
        .attr('fill', '#f59e0b').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    ofcomLists.append('text')
        .attr('x', 80).attr('y', 215)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '13px').text('Ofcom');
    ofcomLists.append('text')
        .attr('x', 80).attr('y', 233)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '11px').text('S1-S9');
    ofcomLists.append('text')
        .attr('x', 80).attr('y', 248)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '11px').text('Lists');
    ofcomLists.append('text')
        .attr('x', 80).attr('y', 263)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '10px').text('(Range Holder)');

    // Cache above (where CP was)
    const cache = svg.append('g').attr('id', 'cache-box').style('opacity', 0);
    cache.append('rect')
        .attr('x', 180).attr('y', 80)
        .attr('width', 80).attr('height', 60)
        .attr('fill', '#8b5cf6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    cache.append('text')
        .attr('x', 220).attr('y', 105)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '14px').text('Cache');
    cache.append('text')
        .attr('x', 220).attr('y', 125)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '11px').text('Lookup');

    // CP below (where Cache was)
    const cp = svg.append('g').attr('id', 'cp-box');
    cp.append('rect')
        .attr('x', 180).attr('y', 190)
        .attr('width', 80).attr('height', 60)
        .attr('fill', '#3b82f6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    cp.append('text')
        .attr('x', 220).attr('y', 225)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '16px').text('CP');

    const invalidate = svg.append('g').attr('id', 'invalidate-box').style('opacity', 0);
    invalidate.append('rect')
        .attr('x', 180).attr('y', 270)
        .attr('width', 80).attr('height', 50)
        .attr('fill', '#ef4444').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    invalidate.append('text')
        .attr('x', 220).attr('y', 290)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '12px').text('Invalidate');
    invalidate.append('text')
        .attr('x', 220).attr('y', 307)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '10px').text('Response');

    const rangeHolder = svg.append('g').attr('id', 'range-holder-box').style('opacity', 0);
    rangeHolder.append('rect')
        .attr('x', 350).attr('y', 190)
        .attr('width', 90).attr('height', 60)
        .attr('fill', '#64748b').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    rangeHolder.append('text')
        .attr('x', 395).attr('y', 215)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '14px').text('Range');
    rangeHolder.append('text')
        .attr('x', 395).attr('y', 233)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '12px').text('Holder');

    const localPortingData = svg.append('g').attr('id', 'local-porting-data-box').style('opacity', 0);
    localPortingData.append('rect')
        .attr('x', 490).attr('y', 190)
        .attr('width', 100).attr('height', 60)
        .attr('fill', '#ec4899').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    localPortingData.append('text')
        .attr('x', 540).attr('y', 210)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '13px').text('Local');
    localPortingData.append('text')
        .attr('x', 540).attr('y', 226)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '12px').text('Porting');
    localPortingData.append('text')
        .attr('x', 540).attr('y', 242)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '12px').text('Data');

    const otherCP = svg.append('g').attr('id', 'other-cp-box').style('opacity', 0);
    otherCP.append('rect')
        .attr('x', 350).attr('y', 270)
        .attr('width', 90).attr('height', 50)
        .attr('fill', '#a855f7').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    otherCP.append('text')
        .attr('x', 395).attr('y', 290)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '14px').text('Other CP');
    otherCP.append('text')
        .attr('x', 395).attr('y', 308)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-size', '10px').text('(Ported)');

    // Synchronized animation with voiceover - CORRECTED TIMINGS
    // Narration: "Here's how a CP can obtain all available information about a phone number. First, they check their local cache to see if they already have it. All processes contain an invalidate cache response to ensure CPs cache values are up to date. If the cache is missing the data, or has become invalidated, they start by using Ofcom's S1 to S9 lists to locate the Range Holder for the number block. The CP sends a request to that Range Holder. The Range Holder may respond directly, or may provide a redirect if the number has been ported, in which case the CP tries there instead."
    //
    // Corrected timing breakdown based on actual voiceover:
    // 5s: Cache appears when saying "First, they check their local cache"
    // 10s: Invalidate response appears when saying "All processes contain an invalidate cache response"
    // 17s: Ofcom box appears when saying "If the cache is missing the data"
    // 21s: Arrow from Ofcom to CP appears when saying "they start by using Ofcom's S1 to S9 lists"
    // 27s: Range Holder request when saying "The CP sends a request to that Range Holder"
    // 30s: Arrow from Range Holder back to CP when saying "The Range Holder may respond directly"
    // 32s: Local Porting Data appears with arrow to Range Holder when saying "if the number has been ported"

    // Step 1: Check cache (5s) - appears when saying "First, they check their local cache"
    // Arrow from CP up to Cache
    setTimeout(() => {
        cache.transition().duration(500).style('opacity', 1);
        const line1 = svg.append('line').attr('id', 'msg1')
            .attr('x1', 220).attr('y1', 190).attr('x2', 220).attr('y2', 190)
            .attr('stroke', '#8b5cf6').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line1.transition().duration(600).attr('y2', 140);
    }, 5000);

    // Step 2: Show invalidate response (10s) - appears when saying "All processes contain an invalidate cache response"
    // Arrow from Cache down to Invalidate (below CP)
    setTimeout(() => {
        svg.select('#msg1').remove();
        invalidate.transition().duration(500).style('opacity', 1);
        const line2 = svg.append('line').attr('id', 'msg2')
            .attr('x1', 220).attr('y1', 140).attr('x2', 220).attr('y2', 140)
            .attr('stroke', '#ef4444').attr('stroke-width', 3).attr('stroke-dasharray', '5,5');
        line2.transition().duration(700).attr('y2', 270);
    }, 10000);

    // Step 3: Show Ofcom box (17s) - appears when saying "If the cache is missing the data"
    setTimeout(() => {
        svg.select('#msg2').remove();
        ofcomLists.transition().duration(500).style('opacity', 1);
    }, 17000);

    // Step 3b: Arrow from Ofcom to CP (21s) - appears when saying "they start by using Ofcom's S1 to S9 lists"
    // Both boxes are now at same vertical level (y=190-250)
    setTimeout(() => {
        const line3 = svg.append('line').attr('id', 'msg3')
            .attr('x1', 130).attr('y1', 220).attr('x2', 130).attr('y2', 220)
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line3.transition().duration(600).attr('x2', 180);
    }, 21000);

    // Step 4: Contact Range Holder (27s) - appears when saying "The CP sends a request to that Range Holder"
    // Arrow from CP to Range Holder (both at same vertical level)
    setTimeout(() => {
        svg.select('#msg3').remove();
        rangeHolder.transition().duration(500).style('opacity', 1);
        const line4 = svg.append('line').attr('id', 'msg4')
            .attr('x1', 260).attr('y1', 220).attr('x2', 260).attr('y2', 220)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line4.transition().duration(600).attr('x2', 350);
    }, 27000);

    // Step 5: Direct response (30s) - appears when saying "The Range Holder may respond directly"
    // Arrow from Range Holder back to CP (no box, just arrow)
    setTimeout(() => {
        svg.select('#msg4').remove();
        const line5 = svg.append('line').attr('id', 'msg5')
            .attr('x1', 350).attr('y1', 205).attr('x2', 350).attr('y2', 205)
            .attr('stroke', '#22c55e').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line5.transition().duration(600).attr('x2', 260);
    }, 30000);

    // Step 6: Local Porting Data (32s) - appears when saying "if the number has been ported"
    // Show Local Porting Data box and arrow to Range Holder
    setTimeout(() => {
        svg.select('#msg5').remove();
        localPortingData.transition().duration(500).style('opacity', 1);
        const line6 = svg.append('line').attr('id', 'msg6')
            .attr('x1', 490).attr('y1', 220).attr('x2', 490).attr('y2', 220)
            .attr('stroke', '#ec4899').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line6.transition().duration(600).attr('x2', 440);
    }, 32000);

    // Step 7: Arrow from Range Holder back to CP (after porting data lookup)
    setTimeout(() => {
        svg.select('#msg6').remove();
        const line7 = svg.append('line').attr('id', 'msg7')
            .attr('x1', 350).attr('y1', 235).attr('x2', 350).attr('y2', 235)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line7.transition().duration(600).attr('x2', 260);
    }, 33000);

    // Step 8: Show Other CP box and arrow from CP diagonally to Other CP
    setTimeout(() => {
        svg.select('#msg7').remove();
        otherCP.transition().duration(500).style('opacity', 1);
        const line8 = svg.append('line').attr('id', 'msg8')
            .attr('x1', 260).attr('y1', 235).attr('x2', 260).attr('y2', 235)
            .attr('stroke', '#a855f7').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line8.transition().duration(600).attr('x2', 350).attr('y2', 280);
    }, 34000);
}

// Scene 7: Dependencies of the Solution
function setupScene7() {
    const svg = d3.select('#dependencies-diagram');
    svg.selectAll('*').remove();

    const width = 800;
    const height = 400;

    // Draw CP boxes 1-5 on first line
    const cpY = 60;
    const cpSpacing = 140;
    const cpStartX = 60;

    for (let i = 1; i <= 5; i++) {
        const cpX = cpStartX + (i - 1) * cpSpacing;
        const cp = svg.append('g').attr('id', `cp${i}-deps`);

        cp.append('rect')
            .attr('x', cpX).attr('y', cpY)
            .attr('width', 100).attr('height', 60)
            .attr('fill', '#3b82f6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8)
            .style('opacity', 0)
            .transition().delay(300 + i * 100).duration(500).style('opacity', 1);

        cp.append('text')
            .attr('x', cpX + 50).attr('y', cpY + 38)
            .attr('text-anchor', 'middle').attr('fill', 'white')
            .attr('font-weight', 'bold').attr('font-size', '16px')
            .text(`CP${i}`)
            .style('opacity', 0)
            .transition().delay(300 + i * 100).duration(500).style('opacity', 1);
    }

    // Draw 3 MAPs and Ofcom on second line
    const mapY = 180;
    const map1X = 120;
    const map2X = 280;
    const map3X = 440;
    const ofcomX = 600;

    // MAP 1
    const map1 = svg.append('g').attr('id', 'map1-deps');
    map1.append('rect')
        .attr('x', map1X).attr('y', mapY)
        .attr('width', 100).attr('height', 60)
        .attr('fill', '#8b5cf6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8)
        .style('opacity', 0)
        .transition().delay(1200).duration(500).style('opacity', 1);
    map1.append('text')
        .attr('x', map1X + 50).attr('y', mapY + 38)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '16px')
        .text('MAP 1')
        .style('opacity', 0)
        .transition().delay(1200).duration(500).style('opacity', 1);

    // MAP 2
    const map2 = svg.append('g').attr('id', 'map2-deps');
    map2.append('rect')
        .attr('x', map2X).attr('y', mapY)
        .attr('width', 100).attr('height', 60)
        .attr('fill', '#8b5cf6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8)
        .style('opacity', 0)
        .transition().delay(1400).duration(500).style('opacity', 1);
    map2.append('text')
        .attr('x', map2X + 50).attr('y', mapY + 38)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '16px')
        .text('MAP 2')
        .style('opacity', 0)
        .transition().delay(1400).duration(500).style('opacity', 1);

    // MAP 3
    const map3 = svg.append('g').attr('id', 'map3-deps');
    map3.append('rect')
        .attr('x', map3X).attr('y', mapY)
        .attr('width', 100).attr('height', 60)
        .attr('fill', '#8b5cf6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8)
        .style('opacity', 0)
        .transition().delay(1600).duration(500).style('opacity', 1);
    map3.append('text')
        .attr('x', map3X + 50).attr('y', mapY + 38)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '16px')
        .text('MAP 3')
        .style('opacity', 0)
        .transition().delay(1600).duration(500).style('opacity', 1);

    // Ofcom
    const ofcom = svg.append('g').attr('id', 'ofcom-deps');
    ofcom.append('rect')
        .attr('x', ofcomX).attr('y', mapY)
        .attr('width', 100).attr('height', 60)
        .attr('fill', '#f59e0b').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8)
        .style('opacity', 0)
        .transition().delay(1800).duration(500).style('opacity', 1);
    ofcom.append('text')
        .attr('x', ofcomX + 50).attr('y', mapY + 38)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '14px')
        .text('Ofcom')
        .style('opacity', 0)
        .transition().delay(1800).duration(500).style('opacity', 1);

    // Draw lines from every CP to every MAP and Ofcom
    setTimeout(() => {
        const targets = [
            { x: map1X + 50, y: mapY },
            { x: map2X + 50, y: mapY },
            { x: map3X + 50, y: mapY },
            { x: ofcomX + 50, y: mapY }
        ];

        for (let i = 1; i <= 5; i++) {
            const cpX = cpStartX + (i - 1) * cpSpacing + 50;
            const cpBottom = cpY + 60;

            targets.forEach((target, j) => {
                svg.append('line')
                    .attr('x1', cpX).attr('y1', cpBottom)
                    .attr('x2', cpX).attr('y2', cpBottom)
                    .attr('stroke', '#cbd5e1').attr('stroke-width', 1.5).attr('opacity', 0.4)
                    .transition().delay(2000 + j * 50).duration(400)
                    .attr('x2', target.x).attr('y2', target.y);
            });
        }
    }, 0);

    // Draw horizontal line below MAPs and Ofcom labeled "Single Source Of Truth Sync"
    const syncLineY = mapY + 100;
    const syncLineStartX = map1X + 50;
    const syncLineEndX = ofcomX + 50;

    setTimeout(() => {
        // Vertical lines from MAPs and Ofcom to horizontal line
        [map1X + 50, map2X + 50, map3X + 50, ofcomX + 50].forEach((x, i) => {
            svg.append('line')
                .attr('x1', x).attr('y1', mapY + 60)
                .attr('x2', x).attr('y2', mapY + 60)
                .attr('stroke', '#10b981').attr('stroke-width', 3)
                .transition().delay(3000 + i * 100).duration(400)
                .attr('y2', syncLineY);
        });

        // Horizontal line
        svg.append('line')
            .attr('x1', syncLineStartX).attr('y1', syncLineY)
            .attr('x2', syncLineStartX).attr('y2', syncLineY)
            .attr('stroke', '#10b981').attr('stroke-width', 4)
            .transition().delay(3500).duration(800)
            .attr('x2', syncLineEndX);

        // Label
        svg.append('text')
            .attr('x', (syncLineStartX + syncLineEndX) / 2).attr('y', syncLineY + 25)
            .attr('text-anchor', 'middle').attr('fill', '#10b981')
            .attr('font-weight', 'bold').attr('font-size', '14px')
            .text('Single Source Of Truth Sync')
            .style('opacity', 0)
            .transition().delay(4000).duration(500).style('opacity', 1);
    }, 0);
}

// Scene 8: Security by Design
function setupScene8() {
    const pillars = document.querySelectorAll('.pillar');
    pillars.forEach((pillar, i) => {
        pillar.style.opacity = '0';
        pillar.style.transform = 'translateY(50px)';
        setTimeout(() => {
            pillar.style.transition = 'all 0.8s ease';
            pillar.style.opacity = '1';
            pillar.style.transform = 'translateY(0)';
        }, 500 + i * 400);
    });

    // Animate hacker being blocked
    setTimeout(() => {
        const hacker = document.querySelector('.hacker-blocked');
        if (hacker) {
            hacker.style.animation = 'bounce 0.5s ease 3';
        }
    }, 2500);
}

// Scene 9: The MAPs Solution
function setupScene9() {
    const elements = document.querySelectorAll('.small-cps, .map-provider, .happy-cps');
    elements.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'scale(0.8)';
        setTimeout(() => {
            el.style.transition = 'all 0.6s ease';
            el.style.opacity = '1';
            el.style.transform = 'scale(1)';
        }, 500 + i * 800);
    });
}

// Scene 10: Call to Action
function setupScene10() {
    const elements = document.querySelectorAll('.website-display, .cta-buttons');
    elements.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        setTimeout(() => {
            el.style.transition = 'all 0.8s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 500 + i * 400);
    });

    // Pulse logo
    setTimeout(() => {
        const logo = document.querySelector('.pstn2-logo-large');
        if (logo) {
            logo.style.animation = 'pulse 2s ease infinite';
        }
    }, 1500);
}

// Keyboard navigation
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
