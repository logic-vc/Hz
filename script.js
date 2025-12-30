class PitchAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.scriptProcessor = null;
        this.isAnalyzing = false;

        // Canvas setup
        this.canvas = document.getElementById('pitchCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();

        // Data storage (30 seconds at 10 samples per second)
        this.maxDataPoints = 300; // 30 seconds * 10 fps
        this.pitchHistory = [];
        this.timeHistory = [];

        // Smoothing and filtering
        this.smoothingBuffer = []; // For moving average
        this.smoothingWindowSize = 8; // Average last 8 readings (increased for smoother output)
        this.lastSampleTime = 0;
        this.sampleInterval = 100; // Sample every 100ms (10 times per second)
        this.minVolume = 0.03; // Minimum volume threshold (increased to filter noise)
        this.minConfidence = 0.94; // Minimum correlation confidence (increased for better accuracy)
        this.lastValidFrequency = null; // For octave jump detection
        this.octaveJumpThreshold = 0.3; // 30% deviation threshold

        // Voice detection filters
        this.minVoiceFreq = 80; // Minimum human voice frequency (Hz)
        this.maxVoiceFreq = 1000; // Maximum human voice frequency (Hz)
        this.stabilityBuffer = []; // Track frequency stability
        this.stabilityWindowSize = 4; // Require 4 consecutive stable readings
        this.stabilityThreshold = 0.05; // 5% deviation allowed for stability

        // UI elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.currentPitch = document.getElementById('currentPitch');
        this.currentFreq = document.getElementById('currentFreq');

        // Bind events
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());

        // Handle window resize
        window.addEventListener('resize', () => this.setupCanvas());

        // Animation frame
        this.animationFrame = null;
    }

    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    async start() {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    latency: 0
                }
            });

            // Setup audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.microphone = this.audioContext.createMediaStreamSource(stream);

            // Connect nodes
            this.microphone.connect(this.analyser);

            this.isAnalyzing = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;

            // Start analysis loop
            this.analyze();

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please ensure microphone permissions are granted.');
        }
    }

    stop() {
        this.isAnalyzing = false;

        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone.mediaStream.getTracks().forEach(track => track.stop());
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;

        // Reset displays
        this.currentPitch.textContent = '--';
        this.currentFreq.textContent = '-- Hz';

        // Reset all buffers
        this.smoothingBuffer = [];
        this.stabilityBuffer = [];
        this.lastValidFrequency = null;
    }

    analyze() {
        if (!this.isAnalyzing) return;

        const bufferLength = this.analyser.fftSize;
        const buffer = new Float32Array(bufferLength);
        this.analyser.getFloatTimeDomainData(buffer);

        // Calculate volume (RMS)
        const volume = this.calculateVolume(buffer);
        this.updateVolumeDisplay(volume);

        // Only sample at specified intervals
        const now = Date.now();
        const shouldSample = now - this.lastSampleTime >= this.sampleInterval;

        if (shouldSample && volume >= this.minVolume) {
            this.lastSampleTime = now;

            // Detect pitch using autocorrelation
            const result = this.autoCorrelate(buffer, this.audioContext.sampleRate);

            if (result.frequency > 0 && result.confidence >= this.minConfidence) {
                // Check if frequency is in human voice range
                if (result.frequency < this.minVoiceFreq || result.frequency > this.maxVoiceFreq) {
                    // Outside voice range - ignore
                    this.stabilityBuffer = [];
                    return;
                }

                // Correct octave jumps
                let correctedFreq = this.correctOctaveJump(result.frequency);

                // Check frequency stability
                if (!this.isFrequencyStable(correctedFreq)) {
                    // Not stable enough - don't display yet
                    return;
                }

                // Add to smoothing buffer
                this.smoothingBuffer.push(correctedFreq);
                if (this.smoothingBuffer.length > this.smoothingWindowSize) {
                    this.smoothingBuffer.shift();
                }

                // Calculate smoothed frequency
                const smoothedFreq = this.getSmoothedFrequency();
                const note = this.frequencyToNote(smoothedFreq);

                if (note) {
                    this.updatePitchDisplay(note, smoothedFreq);

                    // Update last valid frequency
                    this.lastValidFrequency = smoothedFreq;

                    // Store data for graph
                    this.pitchHistory.push(note);
                    this.timeHistory.push(now);

                    // Limit to 30 seconds
                    if (this.pitchHistory.length > this.maxDataPoints) {
                        this.pitchHistory.shift();
                        this.timeHistory.shift();
                    }
                }
            } else {
                // Low confidence or no frequency - reset stability
                this.stabilityBuffer = [];
            }
        } else if (volume < this.minVolume) {
            // Clear display when volume too low
            this.currentPitch.textContent = '--';
            this.currentFreq.textContent = '-- Hz';
            this.smoothingBuffer = []; // Reset smoothing
            this.stabilityBuffer = []; // Reset stability
        }

        // Draw canvas
        this.drawPitchGraph();

        // Continue loop
        this.animationFrame = requestAnimationFrame(() => this.analyze());
    }

    calculateVolume(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    updateVolumeDisplay(volume) {
        // Volume display removed - method kept for compatibility
        // Volume is still used for minVolume threshold checking
    }

    // Autocorrelation algorithm for pitch detection
    autoCorrelate(buffer, sampleRate) {
        const SIZE = buffer.length;
        const MAX_SAMPLES = Math.floor(SIZE / 2);
        let best_offset = -1;
        let best_correlation = 0;
        let rms = 0;

        // Calculate RMS
        for (let i = 0; i < SIZE; i++) {
            const val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        // Not enough signal
        if (rms < this.minVolume) {
            return { frequency: -1, confidence: 0 };
        }

        // Find the best correlation
        let lastCorrelation = 1;
        for (let offset = 1; offset < MAX_SAMPLES; offset++) {
            let correlation = 0;

            for (let i = 0; i < MAX_SAMPLES; i++) {
                correlation += Math.abs(buffer[i] - buffer[i + offset]);
            }

            correlation = 1 - (correlation / MAX_SAMPLES);

            if (correlation > 0.9 && correlation > lastCorrelation) {
                const foundGoodCorrelation = true;
                if (foundGoodCorrelation) {
                    if (correlation > best_correlation) {
                        best_correlation = correlation;
                        best_offset = offset;
                    }
                }
            }

            lastCorrelation = correlation;
        }

        if (best_correlation > 0.01 && best_offset > -1) {
            const frequency = sampleRate / best_offset;
            return { frequency: frequency, confidence: best_correlation };
        }

        return { frequency: -1, confidence: 0 };
    }

    // Calculate smoothed frequency using weighted moving average
    // Recent values have more weight for better responsiveness while staying smooth
    getSmoothedFrequency() {
        if (this.smoothingBuffer.length === 0) return 0;

        let weightedSum = 0;
        let weightSum = 0;

        // Apply exponential weights (more recent = higher weight)
        for (let i = 0; i < this.smoothingBuffer.length; i++) {
            const weight = i + 1; // Linear weighting: 1, 2, 3, 4, 5, 6, 7, 8
            weightedSum += this.smoothingBuffer[i] * weight;
            weightSum += weight;
        }

        return weightedSum / weightSum;
    }

    // Check if frequency is stable (consistent over multiple samples)
    // This filters out brief noises and only accepts sustained sounds like voice
    isFrequencyStable(frequency) {
        // Add current frequency to stability buffer
        this.stabilityBuffer.push(frequency);
        if (this.stabilityBuffer.length > this.stabilityWindowSize) {
            this.stabilityBuffer.shift();
        }

        // Need enough samples to check stability
        if (this.stabilityBuffer.length < this.stabilityWindowSize) {
            return false; // Not enough data yet
        }

        // Calculate average frequency in buffer
        const avgFreq = this.stabilityBuffer.reduce((a, b) => a + b, 0) / this.stabilityBuffer.length;

        // Check if all samples are within threshold of average
        for (let freq of this.stabilityBuffer) {
            const deviation = Math.abs(freq - avgFreq) / avgFreq;
            if (deviation > this.stabilityThreshold) {
                return false; // Too much variation
            }
        }

        return true; // Stable!
    }

    // Correct octave jumps (when frequency suddenly halves or doubles)
    correctOctaveJump(frequency) {
        if (!this.lastValidFrequency) {
            return frequency; // First reading, no correction needed
        }

        let corrected = frequency;
        const ratio = frequency / this.lastValidFrequency;

        // Check if frequency jumped up by an octave (~2x)
        if (ratio > 1.8 && ratio < 2.2) {
            // Check if halving it brings it closer to last frequency
            const halfed = frequency / 2;
            const halfedRatio = Math.abs(halfed / this.lastValidFrequency - 1);
            const currentRatio = Math.abs(ratio - 1);

            if (halfedRatio < currentRatio && halfedRatio < this.octaveJumpThreshold) {
                corrected = halfed;
            }
        }
        // Check if frequency jumped down by an octave (~0.5x)
        else if (ratio > 0.45 && ratio < 0.55) {
            // Check if doubling it brings it closer to last frequency
            const doubled = frequency * 2;
            const doubledRatio = Math.abs(doubled / this.lastValidFrequency - 1);
            const currentRatio = Math.abs(ratio - 1);

            if (doubledRatio < currentRatio && doubledRatio < this.octaveJumpThreshold) {
                corrected = doubled;
            }
        }
        // Check for 2-octave jumps (4x or 0.25x)
        else if (ratio > 3.8 && ratio < 4.2) {
            const quartered = frequency / 4;
            if (Math.abs(quartered / this.lastValidFrequency - 1) < this.octaveJumpThreshold) {
                corrected = quartered;
            }
        }
        else if (ratio > 0.23 && ratio < 0.27) {
            const quadrupled = frequency * 4;
            if (Math.abs(quadrupled / this.lastValidFrequency - 1) < this.octaveJumpThreshold) {
                corrected = quadrupled;
            }
        }

        return corrected;
    }

    frequencyToNote(frequency) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const A4 = 440;
        const C0 = A4 * Math.pow(2, -4.75);

        // Strict voice range check
        if (frequency < this.minVoiceFreq || frequency > this.maxVoiceFreq) return null;

        const halfSteps = 12 * Math.log2(frequency / C0);
        const octave = Math.floor(halfSteps / 12);
        const noteIndex = Math.round(halfSteps % 12);

        return {
            name: noteNames[noteIndex],
            octave: octave,
            frequency: frequency,
            fullName: noteNames[noteIndex] + octave
        };
    }

    updatePitchDisplay(note, frequency) {
        if (note) {
            this.currentPitch.textContent = note.fullName;
            this.currentFreq.textContent = Math.round(frequency) + ' Hz';
        } else {
            this.currentPitch.textContent = '--';
            this.currentFreq.textContent = '-- Hz';
        }
    }

    drawPitchGraph() {
        const ctx = this.ctx;
        const width = this.canvasWidth;
        const height = this.canvasHeight;

        // Clear canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        this.drawGrid(ctx, width, height);

        // Draw note labels
        this.drawNoteLabels(ctx, height);

        if (this.pitchHistory.length < 1) return;

        // Calculate time range (30 seconds)
        const now = Date.now();
        const timeRange = 30000; // 30 seconds in ms

        // Prepare points for drawing
        const points = [];
        for (let i = 0; i < this.pitchHistory.length; i++) {
            const note = this.pitchHistory[i];
            const time = this.timeHistory[i];

            if (!note || time < now - timeRange) continue;

            // Calculate x position (time-based)
            const timeOffset = (now - time) / timeRange;
            const x = width - (timeOffset * width);

            // Calculate y position (pitch-based, C2 to C6 range)
            const midiNote = this.noteToMidi(note);
            const minMidi = 36; // C2
            const maxMidi = 84; // C6
            const y = height - ((midiNote - minMidi) / (maxMidi - minMidi)) * height;

            points.push({ x, y, time });
        }

        if (points.length < 1) return;

        // Draw smooth curve using Catmull-Rom spline
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Add glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#6366f1';

        if (points.length === 1) {
            // Single point
            ctx.beginPath();
            ctx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#818cf8';
            ctx.fill();
        } else if (points.length === 2) {
            // Two points - simple line
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.stroke();
        } else {
            // Multiple points - use Catmull-Rom spline for smooth curve
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            // Draw Catmull-Rom spline
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[Math.max(0, i - 1)];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[Math.min(points.length - 1, i + 2)];

                // Number of segments per curve (higher = smoother)
                const segments = 20;

                for (let t = 0; t < segments; t++) {
                    const tt = t / segments;
                    const point = this.catmullRomPoint(p0, p1, p2, p3, tt);

                    if (i === 0 && t === 0) {
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                }
            }

            // Draw to last point
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            ctx.stroke();
        }

        // Reset shadow
        ctx.shadowBlur = 0;

        // Draw points on top
        ctx.fillStyle = '#6366f1';
        for (const point of points) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw latest point larger
        if (points.length > 0) {
            const latest = points[points.length - 1];
            ctx.fillStyle = '#ec4899';
            ctx.beginPath();
            ctx.arc(latest.x, latest.y, 6, 0, Math.PI * 2);
            ctx.fill();

            // Outer glow for current point
            ctx.strokeStyle = '#ec4899';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(latest.x, latest.y, 9, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // Catmull-Rom spline interpolation for smooth curves
    catmullRomPoint(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        const x = 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );

        const y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );

        return { x, y };
    }

    drawGrid(ctx, width, height) {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;

        // Horizontal grid lines (one for each octave note)
        const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const octaves = [2, 3, 4, 5];
        const minMidi = 36; // C2
        const maxMidi = 84; // C6

        for (let octave of octaves) {
            for (let note of notes) {
                const midiNote = this.noteToMidi({ name: note, octave: octave });
                if (midiNote >= minMidi && midiNote <= maxMidi) {
                    const y = height - ((midiNote - minMidi) / (maxMidi - minMidi)) * height;

                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
            }
        }

        // Vertical grid lines (time markers every 5 seconds)
        for (let i = 0; i <= 6; i++) {
            const x = width - (i / 6) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    drawNoteLabels(ctx, height) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'right';

        const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const octaves = [2, 3, 4, 5];
        const minMidi = 36;
        const maxMidi = 84;

        for (let octave of octaves) {
            for (let note of notes) {
                const midiNote = this.noteToMidi({ name: note, octave: octave });
                if (midiNote >= minMidi && midiNote <= maxMidi) {
                    const y = height - ((midiNote - minMidi) / (maxMidi - minMidi)) * height;
                    ctx.fillText(note + octave, this.canvasWidth - 5, y + 4);
                }
            }
        }
    }

    noteToMidi(note) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = noteNames.indexOf(note.name);
        return (note.octave + 1) * 12 + noteIndex;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PitchAnalyzer();
});
