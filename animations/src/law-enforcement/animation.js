// PSTN2 Law Enforcement Access Animation
// Interactive web-based animation with D3.js and GSAP

let currentScene = 1;
const totalScenes = 8;
let isPlaying = false;
let isPaused = false;
let playInterval = null;
let audioEnabled = true;
let currentUtterance = null;
let speechSessionId = 0;  // Track speech sessions to prevent stale callbacks
let autoAdvanceEnabled = false;

// Scene durations in milliseconds (fallback if audio disabled or fails)
const sceneDurations = {
    1: 10000,
    2: 36000,  // CP flow with cache (from solution-overview) - reduced by 4s
    3: 20000,  // Authorised party flow (simplified)
    4: 12000,
    5: 10000,  // Data Available
    6: 14000,  // Validating Legal Requests
    7: 12000,  // Dependencies
    8: 10000   // Call to Action
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

    // Auto-start playing on load
    setTimeout(() => {
        // Set playing state
        isPlaying = true;
        autoAdvanceEnabled = true;

        // Update play button to show Pause
        const playBtn = document.getElementById('play-btn');
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        // Start narration with auto-advance callback
        const narration = document.querySelector('#scene-1 .narration');
        if (narration) {
            const text = narration.getAttribute('data-speech');
            speak(text, onNarrationComplete);
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
    // Increment session ID to invalidate any pending callbacks
    const thisSessionId = ++speechSessionId;

    if (!audioEnabled || !text) {
        if (onComplete) {
            setTimeout(() => {
                if (speechSessionId === thisSessionId) {
                    onComplete();
                }
            }, 100);
        }
        return;
    }

    stopSpeech();

    if ('speechSynthesis' in window) {
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;

        // Use a UK English accent voice
        const voices = speechSynthesis.getVoices();

        // Prioritize UK English voices
        const preferredVoice = voices.find(voice =>
            // Google UK English voice (best quality)
            voice.name.includes('Google') && voice.lang === 'en-GB'
        ) || voices.find(voice =>
            // Microsoft UK neural voices
            voice.name.includes('Neural') && voice.lang === 'en-GB'
        ) || voices.find(voice =>
            // macOS Daniel is UK English
            voice.name === 'Daniel' && voice.lang === 'en-GB'
        ) || voices.find(voice =>
            // macOS Kate is UK English
            voice.name === 'Kate' && voice.lang === 'en-GB'
        ) || voices.find(voice =>
            // Any UK English voice
            voice.lang === 'en-GB'
        ) || voices.find(voice =>
            // Fallback to any English voice
            voice.lang.startsWith('en')
        );

        if (preferredVoice) {
            currentUtterance.voice = preferredVoice;
        }

        currentUtterance.onend = () => {
            // Only fire callback if this is still the current session
            if (onComplete && speechSessionId === thisSessionId) {
                onComplete();
            }
        };

        currentUtterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            // Only fire callback if this is still the current session
            if (onComplete && speechSessionId === thisSessionId) {
                onComplete();
            }
        };

        speechSynthesis.speak(currentUtterance);
    } else if (onComplete) {
        if (speechSessionId === thisSessionId) {
            onComplete();
        }
    }
}

function stopSpeech() {
    // Increment session ID to invalidate any pending callbacks
    speechSessionId++;
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    currentUtterance = null;
    isPaused = false;
}

function pauseSpeech() {
    if ('speechSynthesis' in window && speechSynthesis.speaking) {
        speechSynthesis.pause();
        isPaused = true;
    }
}

function resumeSpeech() {
    if ('speechSynthesis' in window && isPaused) {
        speechSynthesis.resume();
        isPaused = false;
    }
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
        if (narration && audioEnabled) {
            const text = narration.getAttribute('data-speech');
            // Use onNarrationComplete callback if auto-advance is enabled
            const callback = (isPlaying && autoAdvanceEnabled) ? onNarrationComplete : null;
            speak(text, callback);
        } else if (!audioEnabled && isPlaying && autoAdvanceEnabled) {
            // Timer-based auto-advance when audio is disabled
            const duration = sceneDurations[currentScene];
            playInterval = setTimeout(() => {
                onNarrationComplete();
            }, duration);
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

function togglePlay() {
    const playBtn = document.getElementById('play-btn');

    if (isPlaying) {
        // Currently playing, so pause
        isPlaying = false;
        playBtn.textContent = '▶ Resume';
        playBtn.classList.remove('playing');

        // Pause speech synthesis
        pauseSpeech();

        // Clear any pending timeout
        if (playInterval) {
            clearTimeout(playInterval);
            playInterval = null;
        }
    } else {
        // Currently paused or stopped, so play/resume
        isPlaying = true;
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        // Enable auto-advance
        autoAdvanceEnabled = true;

        if (isPaused && 'speechSynthesis' in window && speechSynthesis.paused) {
            // Resume from where we paused
            resumeSpeech();
        } else {
            // Start fresh - speak current scene narration
            startCurrentSceneNarration();
        }
    }
}

function startCurrentSceneNarration() {
    const narration = document.querySelector(`#scene-${currentScene} .narration`);
    if (narration && audioEnabled) {
        const text = narration.getAttribute('data-speech');
        speak(text, onNarrationComplete);
    } else if (!audioEnabled) {
        // If audio is disabled, use timer-based auto-advance
        const duration = sceneDurations[currentScene];
        playInterval = setTimeout(() => {
            onNarrationComplete();
        }, duration);
    }
}

function onNarrationComplete() {
    if (!isPlaying || !autoAdvanceEnabled) return;

    if (currentScene < totalScenes) {
        // Advance to next scene
        goToScene(currentScene + 1);
    } else {
        // End of presentation
        isPlaying = false;
        autoAdvanceEnabled = false;
        const playBtn = document.getElementById('play-btn');
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
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

// Scene 2: How It Works - CP Flow (exact copy from solution-overview scene 6)
function setupScene2() {
    const svg = d3.select('#flow-diagram-cp');
    svg.selectAll('*').remove();

    const width = 800;
    const height = 350;

    // Define arrowhead marker
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead-cp')
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
    const ofcomLists = svg.append('g').attr('id', 'ofcom-lists-box-cp').style('opacity', 0);
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
    const cache = svg.append('g').attr('id', 'cache-box-cp').style('opacity', 0);
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
    const cp = svg.append('g').attr('id', 'cp-box-cp');
    cp.append('rect')
        .attr('x', 180).attr('y', 190)
        .attr('width', 80).attr('height', 60)
        .attr('fill', '#3b82f6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    cp.append('text')
        .attr('x', 220).attr('y', 225)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '16px').text('CP');

    const invalidate = svg.append('g').attr('id', 'invalidate-box-cp').style('opacity', 0);
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

    const rangeHolder = svg.append('g').attr('id', 'range-holder-box-cp').style('opacity', 0);
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

    const localPortingData = svg.append('g').attr('id', 'local-porting-data-box-cp').style('opacity', 0);
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

    const otherCP = svg.append('g').attr('id', 'other-cp-box-cp').style('opacity', 0);
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
    // Step 1: Check cache (5s) - appears when saying "First, they check their local cache"
    setTimeout(() => {
        cache.transition().duration(500).style('opacity', 1);
        const line1 = svg.append('line').attr('id', 'msg1-cp')
            .attr('x1', 220).attr('y1', 190).attr('x2', 220).attr('y2', 190)
            .attr('stroke', '#8b5cf6').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line1.transition().duration(600).attr('y2', 140);
    }, 5000);

    // Step 2: Show invalidate response (10s)
    setTimeout(() => {
        svg.select('#msg1-cp').remove();
        invalidate.transition().duration(500).style('opacity', 1);
        const line2 = svg.append('line').attr('id', 'msg2-cp')
            .attr('x1', 220).attr('y1', 140).attr('x2', 220).attr('y2', 140)
            .attr('stroke', '#ef4444').attr('stroke-width', 3).attr('stroke-dasharray', '5,5');
        line2.transition().duration(700).attr('y2', 270);
    }, 10000);

    // Step 3: Show Ofcom box (17s)
    setTimeout(() => {
        svg.select('#msg2-cp').remove();
        ofcomLists.transition().duration(500).style('opacity', 1);
    }, 17000);

    // Step 3b: Arrow from Ofcom to CP (21s)
    setTimeout(() => {
        const line3 = svg.append('line').attr('id', 'msg3-cp')
            .attr('x1', 130).attr('y1', 220).attr('x2', 130).attr('y2', 220)
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line3.transition().duration(600).attr('x2', 180);
    }, 21000);

    // Step 4: Contact Range Holder (23s) - reduced by 4s
    setTimeout(() => {
        svg.select('#msg3-cp').remove();
        rangeHolder.transition().duration(500).style('opacity', 1);
        const line4 = svg.append('line').attr('id', 'msg4-cp')
            .attr('x1', 260).attr('y1', 220).attr('x2', 260).attr('y2', 220)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line4.transition().duration(600).attr('x2', 350);
    }, 23000);

    // Step 5: Direct response (26s)
    setTimeout(() => {
        svg.select('#msg4-cp').remove();
        const line5 = svg.append('line').attr('id', 'msg5-cp')
            .attr('x1', 350).attr('y1', 205).attr('x2', 350).attr('y2', 205)
            .attr('stroke', '#22c55e').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line5.transition().duration(600).attr('x2', 260);
    }, 26000);

    // Step 6: Local Porting Data (28s)
    setTimeout(() => {
        svg.select('#msg5-cp').remove();
        localPortingData.transition().duration(500).style('opacity', 1);
        const line6 = svg.append('line').attr('id', 'msg6-cp')
            .attr('x1', 490).attr('y1', 220).attr('x2', 490).attr('y2', 220)
            .attr('stroke', '#ec4899').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line6.transition().duration(600).attr('x2', 440);
    }, 28000);

    // Step 7: Arrow from Range Holder back to CP (29s)
    setTimeout(() => {
        svg.select('#msg6-cp').remove();
        const line7 = svg.append('line').attr('id', 'msg7-cp')
            .attr('x1', 350).attr('y1', 235).attr('x2', 350).attr('y2', 235)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line7.transition().duration(600).attr('x2', 260);
    }, 29000);

    // Step 8: Show Other CP box and arrow from CP diagonally to Other CP (30s)
    setTimeout(() => {
        svg.select('#msg7-cp').remove();
        otherCP.transition().duration(500).style('opacity', 1);
        const line8 = svg.append('line').attr('id', 'msg8-cp')
            .attr('x1', 260).attr('y1', 235).attr('x2', 260).attr('y2', 235)
            .attr('stroke', '#a855f7').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead-cp)');
        line8.transition().duration(600).attr('x2', 350).attr('y2', 280);
    }, 30000);
}

// Scene 3: How It Works - Authorised Party Flow (simplified, without cache references)
function setupScene3() {
    const svg = d3.select('#flow-diagram');
    svg.selectAll('*').remove();

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

    // Ofcom on the left, aligned with Requester vertically
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

    // Requester (replaces CP)
    const requester = svg.append('g').attr('id', 'requester-box');
    requester.append('rect')
        .attr('x', 180).attr('y', 190)
        .attr('width', 80).attr('height', 60)
        .attr('fill', '#3b82f6').attr('stroke', 'white').attr('stroke-width', 3).attr('rx', 8);
    requester.append('text')
        .attr('x', 220).attr('y', 225)
        .attr('text-anchor', 'middle').attr('fill', 'white')
        .attr('font-weight', 'bold').attr('font-size', '12px').text('Requester');

    // Range Holder
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

    // Local Porting Data
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

    // Other CP (ported)
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

    // Animation timings adjusted for law enforcement context (no cache references)
    // Timings sped up by 10% to ensure all graphics display before slide advances
    // 2.7s: Ofcom box appears - using S1 to S9 lists to locate the Range Holder
    // 6.3s: Arrow from Ofcom to Requester
    // 10.8s: Range Holder request
    // 13.5s: Arrow from Range Holder back to Requester (direct response)
    // 16.2s: Local Porting Data appears (if number has been ported)
    // 18s: Arrow from Range Holder back to Requester (after porting lookup)
    // 19.8s: Other CP box appears (ported number destination)

    // Step 1: Show Ofcom box (2.7s)
    setTimeout(() => {
        ofcomLists.transition().duration(450).style('opacity', 1);
    }, 2700);

    // Step 2: Arrow from Ofcom to Requester (6.3s)
    setTimeout(() => {
        const line1 = svg.append('line').attr('id', 'msg1')
            .attr('x1', 130).attr('y1', 220).attr('x2', 130).attr('y2', 220)
            .attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line1.transition().duration(540).attr('x2', 180);
    }, 6300);

    // Step 3: Contact Range Holder (10.8s)
    setTimeout(() => {
        svg.select('#msg1').remove();
        rangeHolder.transition().duration(450).style('opacity', 1);
        const line2 = svg.append('line').attr('id', 'msg2')
            .attr('x1', 260).attr('y1', 220).attr('x2', 260).attr('y2', 220)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line2.transition().duration(540).attr('x2', 350);
    }, 10800);

    // Step 4: Direct response (13.5s)
    setTimeout(() => {
        svg.select('#msg2').remove();
        const line3 = svg.append('line').attr('id', 'msg3')
            .attr('x1', 350).attr('y1', 205).attr('x2', 350).attr('y2', 205)
            .attr('stroke', '#22c55e').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line3.transition().duration(540).attr('x2', 260);
    }, 13500);

    // Step 5: Local Porting Data (16.2s)
    setTimeout(() => {
        svg.select('#msg3').remove();
        localPortingData.transition().duration(450).style('opacity', 1);
        const line4 = svg.append('line').attr('id', 'msg4')
            .attr('x1', 490).attr('y1', 220).attr('x2', 490).attr('y2', 220)
            .attr('stroke', '#ec4899').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line4.transition().duration(540).attr('x2', 440);
    }, 16200);

    // Step 6: Arrow from Range Holder back to Requester (18s)
    setTimeout(() => {
        svg.select('#msg4').remove();
        const line5 = svg.append('line').attr('id', 'msg5')
            .attr('x1', 350).attr('y1', 235).attr('x2', 350).attr('y2', 235)
            .attr('stroke', '#64748b').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line5.transition().duration(540).attr('x2', 260);
    }, 18000);

    // Step 7: Show Other CP box and arrow from Requester to Other CP (19.8s)
    setTimeout(() => {
        svg.select('#msg5').remove();
        otherCP.transition().duration(450).style('opacity', 1);
        const line6 = svg.append('line').attr('id', 'msg6')
            .attr('x1', 260).attr('y1', 235).attr('x2', 260).attr('y2', 235)
            .attr('stroke', '#a855f7').attr('stroke-width', 3).attr('marker-end', 'url(#arrowhead)');
        line6.transition().duration(540).attr('x2', 350).attr('y2', 280);
    }, 19800);
}

// Scene 4: Law Enforcement Access
function setupScene4() {
    // Animate officer appearing
    const officer = document.querySelector('.officer-panel');
    if (officer) {
        officer.style.opacity = '0';
        officer.style.transform = 'translateX(-50px)';
        setTimeout(() => {
            officer.style.transition = 'all 0.8s ease';
            officer.style.opacity = '1';
            officer.style.transform = 'translateX(0)';
        }, 500);
    }

    // Animate arrow
    const arrow = document.querySelector('.arrow-container');
    if (arrow) {
        arrow.style.opacity = '0';
        setTimeout(() => {
            arrow.style.transition = 'opacity 0.5s ease';
            arrow.style.opacity = '1';
        }, 1200);
    }

    // Animate browser
    const browser = document.querySelector('.browser-panel');
    if (browser) {
        browser.style.opacity = '0';
        browser.style.transform = 'translateX(50px)';
        setTimeout(() => {
            browser.style.transition = 'all 0.8s ease';
            browser.style.opacity = '1';
            browser.style.transform = 'translateX(0)';
        }, 1500);
    }

    // Typing animation for phone number
    setTimeout(() => {
        const inputValue = document.querySelector('.input-value');
        if (inputValue) {
            inputValue.style.animation = 'typeIn 1s steps(15) forwards';
        }
    }, 2500);
}

// Scene 5: Data Available
function setupScene5() {
    // Animate result panel
    const resultPanel = document.querySelector('.query-result-panel');
    if (resultPanel) {
        resultPanel.style.opacity = '0';
        resultPanel.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            resultPanel.style.transition = 'all 0.6s ease';
            resultPanel.style.opacity = '1';
            resultPanel.style.transform = 'translateY(0)';
        }, 500);
    }

    // Animate data cards with stagger
    const cards = document.querySelectorAll('.data-card');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => {
            card.style.transition = 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }, 1200 + i * 400);
    });
}

// Scene 6: Validating Legal Requests
function setupScene6() {
    // Animate option cards with stagger
    const cards = document.querySelectorAll('.option-card');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        setTimeout(() => {
            card.style.transition = 'all 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 500 + i * 500);
    });
}

// Scene 7: Dependencies
function setupScene7() {
    const svg = d3.select('#dependencies-diagram');
    svg.selectAll('*').remove();

    const cpY = 60;
    const cpSpacing = 140;
    const cpStartX = 60;

    // Draw CPs
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

    // Draw MAPs and Ofcom
    const mapY = 180;
    const map1X = 120;
    const map2X = 280;
    const map3X = 440;
    const ofcomX = 600;

    // MAP 1
    const map1 = svg.append('g');
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
    const map2 = svg.append('g');
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
    const map3 = svg.append('g');
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
    const ofcom = svg.append('g');
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

    // Draw connection lines
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

    // Single source of truth line
    const syncLineY = mapY + 100;
    const syncLineStartX = map1X + 50;
    const syncLineEndX = ofcomX + 50;

    setTimeout(() => {
        [map1X + 50, map2X + 50, map3X + 50, ofcomX + 50].forEach((x, i) => {
            svg.append('line')
                .attr('x1', x).attr('y1', mapY + 60)
                .attr('x2', x).attr('y2', mapY + 60)
                .attr('stroke', '#10b981').attr('stroke-width', 3)
                .transition().delay(3000 + i * 100).duration(400)
                .attr('y2', syncLineY);
        });

        svg.append('line')
            .attr('x1', syncLineStartX).attr('y1', syncLineY)
            .attr('x2', syncLineStartX).attr('y2', syncLineY)
            .attr('stroke', '#10b981').attr('stroke-width', 4)
            .transition().delay(3500).duration(800)
            .attr('x2', syncLineEndX);

        svg.append('text')
            .attr('x', (syncLineStartX + syncLineEndX) / 2).attr('y', syncLineY + 25)
            .attr('text-anchor', 'middle').attr('fill', '#10b981')
            .attr('font-weight', 'bold').attr('font-size', '14px')
            .text('Single Source Of Truth Sync')
            .style('opacity', 0)
            .transition().delay(4000).duration(500).style('opacity', 1);
    }, 0);
}

// Scene 8: Call to Action
function setupScene8() {
    const elements = document.querySelectorAll('.website-display, .summary-points');
    elements.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        setTimeout(() => {
            el.style.transition = 'all 0.8s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 500 + i * 400);
    });

    // Animate summary points
    const points = document.querySelectorAll('.summary-point');
    points.forEach((point, i) => {
        point.style.opacity = '0';
        point.style.transform = 'translateX(-20px)';
        setTimeout(() => {
            point.style.transition = 'all 0.5s ease';
            point.style.opacity = '1';
            point.style.transform = 'translateX(0)';
        }, 1500 + i * 200);
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
