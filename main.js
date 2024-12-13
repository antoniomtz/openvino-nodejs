const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { addon: ov } = require('openvino-node');
const { transform } = require('./helper.js'); // Use transform from helper.js

let core, model, compiledModel, infer;

async function initializeOpenVINO() {
    try {
        // Initialize OpenVINO Core
        core = new ov.Core();
        const modelPath = path.join(__dirname, '/models/face-detection-0200/FP32/1/face-detection-0200.xml');
        if (!fs.existsSync(modelPath)) {
            throw new Error(`Model file doesn't exist at ${modelPath}`);
        }

        model = await core.readModel(modelPath);
        compiledModel = await core.compileModel(model, "CPU");
        infer = await compiledModel.createInferRequest();

        console.log('OpenVINO initialization successful');
        return true;
    } catch (error) {
        console.error('Error initializing OpenVINO:', error);
        return false;
    }
}

ipcMain.handle('process-frame', async (event, frameData) => {
    try {
        if (!infer) {
            throw new Error('Model not initialized');
        }

        const inputName = model.inputs[0].getAnyName();
        if (!inputName) {
            throw new Error('Model input name is undefined');
        }

        // Convert Uint8Array to Float32Array and normalize
        const normalizedPixels = new Float32Array(frameData.pixels.length);
        for (let i = 0; i < frameData.pixels.length; i++) {
            normalizedPixels[i] = frameData.pixels[i] / 255.0;
        }

        // Create OpenVINO tensor
        const tensor = new ov.Tensor(
            ov.element.f32,
            frameData.shape,
            normalizedPixels
        );

        // Run inference
        const results = await infer.infer({ [inputName]: tensor });
        const outputName = model.outputs[0].getAnyName();
        
        if (!results[outputName]) {
            throw new Error(`Output name "${outputName}" not found in results`);
        }

        const output = results[outputName];
        const outputShape = output.getShape();
        
        // Log detailed model information
        console.log('Model output info:', {
            shape: outputShape,
            dataType: output.element_type,
            dataLength: output.data.length
        });

        // Find the range of confidence values
        const confidences = [];
        for (let i = 0; i < 200; i++) {
            confidences.push(output.data[i * 7 + 2]);
        }
        const maxConf = Math.max(...confidences);
        const minConf = Math.min(...confidences);
        
        console.log('Confidence range:', {
            min: minConf,
            max: maxConf
        });

        // Log first detection with any confidence
        const firstDetection = {
            image_id: output.data[0],
            label: output.data[1],
            confidence: output.data[2],
            x_min: output.data[3],
            y_min: output.data[4],
            x_max: output.data[5],
            y_max: output.data[6]
        };
        console.log('First detection:', firstDetection);

        // Find detections with highest confidence
        const detections = [];
        for (let i = 0; i < 200; i++) {
            const baseIdx = i * 7;
            const confidence = output.data[baseIdx + 2];
            
            if (confidence > 0.15) { // Very low threshold for debugging
                detections.push({
                    confidence: confidence,
                    bbox: {
                        x_min: output.data[baseIdx + 3],
                        y_min: output.data[baseIdx + 4],
                        x_max: output.data[baseIdx + 5],
                        y_max: output.data[baseIdx + 6]
                    }
                });
            }
        }

        // Sort by confidence and log top 3
        detections.sort((a, b) => b.confidence - a.confidence);
        console.log('Top 3 detections:', detections.slice(0, 3));

        return {
            detections,
            debugInfo: {
                confidenceRange: { minConf, maxConf },
                firstDetection,
                outputShape
            }
        };

    } catch (error) {
        console.error('Error during inference:', error);
        throw error;
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    win.loadFile('index.html');
    win.webContents.openDevTools();
}

app.whenReady().then(async () => {
    const success = await initializeOpenVINO();
    if (success) {
        createWindow();
    } else {
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
