// renderer.js
const { ipcRenderer } = require('electron');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const resizeCanvas = document.createElement('canvas');
let overlayContext;

async function setupWebcam() {
    const cameraSelect = document.getElementById('cameraSelect');

    // Initialize canvases
    overlay.width = 640;
    overlay.height = 480;
    resizeCanvas.width = 256;
    resizeCanvas.height = 256;
    
    // Get context with explicit settings
    overlayContext = overlay.getContext('2d', {
        alpha: true,
        willReadFrequently: false,
        desynchronized: true
    });
    
    // Ensure fresh context state
    overlayContext.reset();

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        });

        if (videoDevices.length > 0) {
            await startVideoStream(videoDevices[0].deviceId);
        }

        cameraSelect.addEventListener('change', (event) => {
            startVideoStream(event.target.value);
        });
    } catch (error) {
        console.error('Error accessing webcam:', error);
    }
}

async function startVideoStream(deviceId) {
    try {
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Reset overlay context when switching streams
        overlayContext.reset();
        
        video.onloadedmetadata = () => {
            video.play();
            processFrame();
        };
    } catch (error) {
        console.error('Error starting video stream:', error);
    }
}

async function processFrame() {
    if (video.paused || video.ended) return;

    try {
        // Start fresh with each frame
        overlayContext.clearRect(0, 0, 640, 480);
        
        // Save the context state
        overlayContext.save();
        
        // Draw corner markers first
        overlayContext.fillStyle = '#FF0000';
        overlayContext.fillRect(0, 0, 40, 40);        // Top-left marker
        overlayContext.fillRect(600, 0, 40, 40);      // Top-right marker
        overlayContext.fillRect(0, 440, 40, 40);      // Bottom-left marker
        overlayContext.fillRect(600, 440, 40, 40);    // Bottom-right marker

        // Process frame for inference
        const resizeContext = resizeCanvas.getContext('2d');
        resizeContext.drawImage(video, 0, 0, 256, 256);
        const resizedData = resizeContext.getImageData(0, 0, 256, 256);

        const bgrData = new Uint8Array(256 * 256 * 3);
        for (let i = 0, j = 0; i < resizedData.data.length; i += 4, j += 3) {
            bgrData[j] = resizedData.data[i + 2];
            bgrData[j + 1] = resizedData.data[i + 1];
            bgrData[j + 2] = resizedData.data[i];
        }

        const frameData = {
            pixels: bgrData,
            shape: [1, 3, 256, 256],
        };

        const result = await ipcRenderer.invoke('process-frame', frameData);

        // Set up text rendering with fresh context state
        overlayContext.restore();
        overlayContext.save();
        
        // Configure text rendering
        overlayContext.textBaseline = 'top';
        overlayContext.textAlign = 'left';
        overlayContext.font = 'bold 40px Arial';
        overlayContext.fillStyle = '#FFFFFF';
        
        // Add stroke to make text more visible
        overlayContext.strokeStyle = '#000000';
        overlayContext.lineWidth = 3;
        overlayContext.strokeText('TEST TEXT', 200, 100);
        overlayContext.fillText('TEST TEXT', 200, 100);

        if (result.detections && result.detections.length > 0) {
            const detection = result.detections[0];
            
            // Fresh context state for detection box
            overlayContext.restore();
            overlayContext.save();
            
            // Draw detection box
            overlayContext.strokeStyle = '#FF0000';
            overlayContext.lineWidth = 8;
            
            const x = detection.bbox.x_min * 640;
            const y = detection.bbox.y_min * 480;
            const width = (detection.bbox.x_max - detection.bbox.x_min) * 640;
            const height = (detection.bbox.y_max - detection.bbox.y_min) * 480;
            
            overlayContext.strokeRect(x, y, width, height);

            // Draw confidence score with stroke
            const score = Math.round(detection.confidence * 100);
            overlayContext.strokeText(`${score}%`, x, y - 10);
            overlayContext.fillText(`${score}%`, x, y - 10);
        } else {
            overlayContext.strokeText('NO FACE', 250, 250);
            overlayContext.fillText('NO FACE', 250, 250);
        }

        // Restore final context state
        overlayContext.restore();

    } catch (error) {
        console.error('Error in processFrame:', error);
    }

    requestAnimationFrame(processFrame);
}

// Initialize when the document is ready
document.addEventListener('DOMContentLoaded', setupWebcam);