# VocalLogic Helper - Pitch Analyzer

A real-time pitch analysis tool for vocalists and musicians. Analyze your voice or instrument pitch in real-time with beautiful visualizations.

## Features

- **Real-time Pitch Detection**: Uses advanced autocorrelation algorithm for accurate pitch detection
- **Visual Timeline**: 30-second scrolling timeline showing pitch changes over time
- **Note Display**: Shows musical notes with octave (C2-C6 range)
- **Frequency Display**: Displays frequency in Hz
- **Volume Meter**: Real-time volume visualization
- **Clean Design**: Modern, responsive UI with dark theme
- **No Installation Required**: Works directly in the browser

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge)
2. Click the "Start Analysis" button
3. Allow microphone access when prompted
4. Sing, hum, or play an instrument into your microphone
5. Watch the real-time pitch analysis and timeline visualization

## Technical Details

### Technologies Used
- **Web Audio API**: For capturing and processing audio from the microphone
- **Canvas API**: For rendering the real-time pitch timeline graph
- **Autocorrelation Algorithm**: For accurate pitch detection
- **Vanilla JavaScript**: No frameworks required, fast and lightweight

### Browser Compatibility
- Chrome 70+
- Firefox 65+
- Safari 14+
- Edge 79+

### Features Breakdown

#### Pitch Detection
The pitch analyzer uses the autocorrelation method to detect fundamental frequency from the audio input. This provides accurate pitch detection even with harmonically rich sounds.

#### Timeline Visualization
- **X-axis**: Time (displays last 30 seconds)
- **Y-axis**: Pitch (C2 to C6 range)
- Notes are labeled on the right side
- Grid lines help identify specific pitches

#### Volume Display
Real-time volume level shown as:
- Percentage value
- Animated color bar
- Gradient from green to purple

## File Structure

```
VocalLogic-Helper/
├── index.html          # Main HTML structure
├── styles.css          # Styling and responsive design
├── script.js           # Pitch analysis logic and visualization
└── README.md          # This file
```

## Privacy

All audio processing happens locally in your browser. No audio data is sent to any server. The app requires microphone access only for real-time analysis.

## License

Created for VocalLogic Helper project.

---

**VOCAL LOGIC** - Professional Voice Training Tools
