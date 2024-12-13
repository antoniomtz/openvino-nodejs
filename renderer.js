let videoContext, overlayContext
const video = document.getElementById('video')
const overlay = document.getElementById('overlay')

async function preprocessFrame(imageData) {
    // Convert image data to tensor
    // Note: This is a simplified version - we need to properly handle
    // color conversion and normalization based on model requirements
    const inputTensor = new ov.Tensor(
        new Float32Array(imageData.data),
        [1, 3, 480, 640]
    )
    return inputTensor
}

async function setupWebcam() {
    const video = document.getElementById('video')
    const overlay = document.getElementById('overlay')
    const cameraSelect = document.getElementById('cameraSelect')
    
    videoContext = video.getContext('2d')
    overlayContext = overlay.getContext('2d')
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        
        videoDevices.forEach(device => {
            const option = document.createElement('option')
            option.value = device.deviceId
            option.text = device.label || `Camera ${cameraSelect.length + 1}`
            cameraSelect.appendChild(option)
        })
        
        if (videoDevices.length > 0) {
            startStream(videoDevices[0].deviceId)
        }
        
        cameraSelect.addEventListener('change', (event) => {
            startStream(event.target.value)
        })
    } catch (error) {
        console.error('Error accessing webcam:', error)
    }
}

async function startStream(deviceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: 640,
                height: 480
            }
        })
        
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop())
        }
        
        video.srcObject = stream
        video.addEventListener('play', () => {
            processFrame()
        })
    } catch (error) {
        console.error('Error starting video stream:', error)
    }
}

async function processFrame() {
    if (video.paused || video.ended) return;

    try {
        // Get video frame
        videoContext.drawImage(video, 0, 0, 640, 480)
        const imageData = videoContext.getImageData(0, 0, 640, 480)
        
        // Preprocess frame
        const inputTensor = await preprocessFrame(imageData)
        
        // Set input tensor
        await infer.set_input_tensor(0, inputTensor)
        
        // Perform inference
        await infer.infer()
        
        // Get results
        const output = await infer.get_output_tensor(0)
        const results = output.data
        
        // Clear previous drawings
        overlayContext.clearRect(0, 0, 640, 480)
        
        // Process and visualize results
        // Note: Need to properly interpret results based on model output format
        
        // Process next frame
        requestAnimationFrame(processFrame)
    } catch (error) {
        console.error('Error processing frame:', error)
    }
}

document.addEventListener('DOMContentLoaded', setupWebcam)