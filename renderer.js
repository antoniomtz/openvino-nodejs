async function setupWebcam() {
    const video = document.getElementById('video')
    const cameraSelect = document.getElementById('cameraSelect')
    
    try {
        // Get list of available video devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        
        // Populate dropdown with available cameras
        videoDevices.forEach(device => {
            const option = document.createElement('option')
            option.value = device.deviceId
            option.text = device.label || `Camera ${cameraSelect.length + 1}`
            cameraSelect.appendChild(option)
        })
        
        // Start stream with first camera
        if (videoDevices.length > 0) {
            startStream(videoDevices[0].deviceId)
        }
        
        // Handle camera selection change
        cameraSelect.addEventListener('change', (event) => {
            startStream(event.target.value)
        })
    } catch (error) {
        console.error('Error accessing webcam:', error)
    }
}

async function startStream(deviceId) {
    const video = document.getElementById('video')
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined
            }
        })
        
        // Stop any existing stream
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop())
        }
        
        // Set new stream
        video.srcObject = stream
    } catch (error) {
        console.error('Error starting video stream:', error)
    }
}

// Initialize webcam when page loads
document.addEventListener('DOMContentLoaded', setupWebcam)