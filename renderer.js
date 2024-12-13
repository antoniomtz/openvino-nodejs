// renderer.js
const { ipcRenderer } = require('electron');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const preprocessCanvas = document.createElement('canvas');
let overlayContext, preprocessContext;
let isProcessing = false;

// Initialize canvases
function setupWebcam() {
    // Set fixed dimensions for consistency
    overlay.width = 640;
    overlay.height = 480;
    preprocessCanvas.width = 256;
    preprocessCanvas.height = 256;
    
    overlayContext = overlay.getContext('2d');
    preprocessContext = preprocessCanvas.getContext('2d');

    // Populate webcam select
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            const cameraSelect = document.getElementById('cameraSelect');
            
            // Clear existing options
            while (cameraSelect.firstChild) {
                cameraSelect.removeChild(cameraSelect.firstChild);
            }
            
            // Add devices
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
                cameraSelect.appendChild(option);
            });

            // Start with first camera if available
            if (videoDevices.length > 0) {
                startVideoStream(videoDevices[0].deviceId);
            }

            // Handle camera changes
            cameraSelect.addEventListener('change', (event) => {
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                startVideoStream(event.target.value);
            });
        })
        .catch(error => console.error('Error accessing webcam devices:', error));
}

function startVideoStream(deviceId) {
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                requestAnimationFrame(processFrame);
            };
        })
        .catch(error => console.error('Error starting video stream:', error));
}

function preprocessImage() {
    if (!video.videoWidth || !video.videoHeight) {
        console.log('Video not ready');
        return null;
    }

    // Clear canvas
    preprocessContext.fillStyle = '#000000';
    preprocessContext.fillRect(0, 0, 256, 256);
    
    // Calculate scale while maintaining aspect ratio
    const scale = Math.min(256 / video.videoWidth, 256 / video.videoHeight);
    const scaledWidth = Math.round(video.videoWidth * scale);
    const scaledHeight = Math.round(video.videoHeight * scale);
    
    // Center the image
    const offsetX = Math.floor((256 - scaledWidth) / 2);
    const offsetY = Math.floor((256 - scaledHeight) / 2);
    
    // Draw video frame
    preprocessContext.drawImage(video, offsetX, offsetY, scaledWidth, scaledHeight);
    
    // Get image data and prepare tensor
    const imageData = preprocessContext.getImageData(0, 0, 256, 256);
    const inputTensor = new Float32Array(3 * 256 * 256); // CHW layout
    
    // Convert to CHW layout with mean subtraction
    const mean = [102.9801, 115.9465, 122.7717]; // BGR means
    
    for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
            const pixelIndex = (y * 256 + x) * 4;
            const chIndex = y * 256 + x;
            
            // BGR order with mean subtraction
            inputTensor[chIndex] = (imageData.data[pixelIndex + 2] - mean[0]);                // B
            inputTensor[256 * 256 + chIndex] = (imageData.data[pixelIndex + 1] - mean[1]);    // G
            inputTensor[2 * 256 * 256 + chIndex] = (imageData.data[pixelIndex] - mean[2]);    // R
        }
    }

    return {
        pixels: inputTensor,
        shape: [1, 3, 256, 256]  // NCHW format
    };
}

function processFrame() {
    if (isProcessing) {
        requestAnimationFrame(processFrame);
        return;
    }

    isProcessing = true;

    // Ensure canvas dimensions match video
    if (video.videoWidth && video.videoHeight) {
        if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
        if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;
    }

    // Clear previous drawings
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);

    const preprocessed = preprocessImage();
    if (!preprocessed) {
        isProcessing = false;
        requestAnimationFrame(processFrame);
        return;
    }

    ipcRenderer.invoke('process-frame', preprocessed)
        .then(result => {
            if (result.detections && result.detections.length > 0) {
                // Log detections for debugging
                console.log('Drawing detections:', result.detections);
                
                result.detections
                    .filter(det => det.confidence > 0.15)
                    .forEach(det => {
                        // Get dimensions
                        const x = det.bbox.x_min * overlay.width;
                        const y = det.bbox.y_min * overlay.height;
                        const width = (det.bbox.x_max - det.bbox.x_min) * overlay.width;
                        const height = (det.bbox.y_max - det.bbox.y_min) * overlay.height;

                        // Draw box with high visibility
                        overlayContext.beginPath();
                        overlayContext.lineWidth = 4;
                        
                        // Draw outer stroke in black
                        overlayContext.strokeStyle = '#000000';
                        overlayContext.strokeRect(x, y, width, height);
                        
                        // Draw inner stroke in bright color
                        overlayContext.lineWidth = 2;
                        overlayContext.strokeStyle = '#00FF00';
                        overlayContext.strokeRect(x, y, width, height);

                        // Draw confidence score with high visibility
                        const score = Math.round(det.confidence * 100);
                        overlayContext.font = 'bold 20px Arial';
                        
                        // Text background
                        const text = `${score}%`;
                        const textMetrics = overlayContext.measureText(text);
                        overlayContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
                        overlayContext.fillRect(
                            x, 
                            y - 25, 
                            textMetrics.width + 10, 
                            25
                        );
                        
                        // Text with outline
                        overlayContext.lineWidth = 3;
                        overlayContext.strokeStyle = '#000000';
                        overlayContext.strokeText(text, x + 5, y - 5);
                        overlayContext.fillStyle = '#00FF00';
                        overlayContext.fillText(text, x + 5, y - 5);

                        console.log('Drew detection:', {
                            confidence: score,
                            position: {x, y, width, height}
                        });
                    });
            }
        })
        .catch(error => console.error('Detection error:', error))
        .finally(() => {
            isProcessing = false;
            requestAnimationFrame(processFrame);
        });
}

document.addEventListener('DOMContentLoaded', setupWebcam);