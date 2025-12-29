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

        // Data storage (30 seconds at ~60fps)
        this.maxDataPoints = 1800; // 30 seconds * 60 fps
        this.pitchHistory = [];
        this.timeHistory = [];

        // UI elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.currentPitch = document.getElementById('currentPitch');
        this.currentFreq = document.getElementById('currentFreq');
        this.currentVolume = document.getElementById('currentVolume');
        this.volumeBar = document.getElementById('volumeBar');

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
        this.currentVolume.textContent = '--';
        this.volumeBar.style.width = '0%';
    }

    analyze() {
        if (!this.isAnalyzing) return;

        const bufferLength = this.analyser.fftSize;
        const buffer = new Float32Array(bufferLength);
        this.analyser.getFloatTimeDomainData(buffer);

        // Calculate volume (RMS)
        const volume = this.calculateVolume(buffer);
        this.updateVolumeDisplay(volume);

        // Detect pitch using autocorrelation
        const frequency = this.autoCorrelate(buffer, this.audioContext.sampleRate);

        if (frequency > 0) {
            const note = this.frequencyToNote(frequency);
            this.updatePitchDisplay(note, frequency);

            // Store data
            this.pitchHistory.push(note);
            this.timeHistory.push(Date.now());

            // Limit to 30 seconds
            if (this.pitchHistory.length > this.maxDataPoints) {
                this.pitchHistory.shift();
                this.timeHistory.shift();
            }
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
        // Convert to percentage (0-100)
        const volumePercent = Math.min(100, volume * 500);
        this.volumeBar.style.width = volumePercent + '%';
        this.currentVolume.textContent = Math.round(volumePercent) + '%';
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
        if (rms < 0.01) return -1;

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
            return frequency;
        }

        return -1;
    }

    frequencyToNote(frequency) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const A4 = 440;
        const C0 = A4 * Math.pow(2, -4.75);

        if (frequency < 20 || frequency > 4000) return null;

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

        if (this.pitchHistory.length < 2) return;

        // Calculate time range (30 seconds)
        const now = Date.now();
        const timeRange = 30000; // 30 seconds in ms

        // Draw grid lines
        this.drawGrid(ctx, width, height);

        // Draw note labels
        this.drawNoteLabels(ctx, height);

        // Draw pitch line
        ctx.beginPath();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;

        let firstPoint = true;

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

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#6366f1';
        for (let i = 0; i < this.pitchHistory.length; i++) {
            const note = this.pitchHistory[i];
            const time = this.timeHistory[i];

            if (!note || time < now - timeRange) continue;

            const timeOffset = (now - time) / timeRange;
            const x = width - (timeOffset * width);
            const midiNote = this.noteToMidi(note);
            const minMidi = 36;
            const maxMidi = 84;
            const y = height - ((midiNote - minMidi) / (maxMidi - minMidi)) * height;

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
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
