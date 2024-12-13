const { app, BrowserWindow } = require('electron')
const path = require('path')
const { addon: ov } = require('openvino-node');
const fs = require('fs')

let core, model, compiledModel, infer

async function initializeOpenVINO() {
    try {
        // Initialize OpenVINO Core
        const core = new ov.Core();
        
        // Read IR model
        const modelPath = path.join(__dirname, '/models/face-detection-retail-0005/FP16-INT8/1/face-detection-retail-0005.xml')
        if (!fs.existsSync(modelPath)) {
            throw new Error(`Model file doesn't exist at ${modelPath}`)
        }
        
        model = await core.readModel(modelPath)
        
        // Log model information safely
        console.log('Model inputs:', model.inputs.length);
        console.log('Model outputs:', model.outputs.length);

        if (model.inputs.length > 0) {
            console.log('Input shape:', model.inputs[0].shape);
        }
        
        if (model.outputs.length > 0) {
            console.log('Output shape:', model.outputs[0].shape);
        }
        
        // Compile model for specific device
        compiledModel = await core.compileModel(model, "CPU")
        
        // Create inference request
        infer = await compiledModel.createInferRequest()
        
        console.log('OpenVINO initialization successful')
        return true
    } catch (error) {
        console.error('Error initializing OpenVINO:', error)
        return false
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            contextBridge: false
        }
    })

    win.loadFile('index.html')
    // Open the DevTools for debugging
    win.webContents.openDevTools()
}

// Make the variables accessible to the renderer process
global.sharedObjects = {
    model: null,
    compiledModel: null,
    infer: null
}

app.whenReady().then(async () => {
    try {
        const success = await initializeOpenVINO()
        if (success) {
            // Store the objects in the global scope
            global.sharedObjects.model = model;
            global.sharedObjects.compiledModel = compiledModel;
            global.sharedObjects.infer = infer;
            
            createWindow()
        } else {
            console.error('Failed to initialize OpenVINO')
            app.quit()
        }
    } catch (error) {
        console.error('Error during initialization:', error)
        app.quit()
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})