// Add comprehensive error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    process.exit(1);
});

// Add startup logging
console.log('=== AllFileConverter Backend Starting ===');
console.log('Node.js version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', process.env.PORT || 3000);
console.log('Working directory:', process.cwd());
console.log('==========================================');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const cors = require('cors');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced logging configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'allfileconverter' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Enhanced CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', /\.amazonaws\.com$/],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Enhanced request timeout and size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    next();
});

// Enhanced multer configuration with better error handling
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + sanitizedName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Enhanced file type validation
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/html',
            'image/png',
            'image/jpeg',
            'image/gif',
            'application/vnd.oasis.opendocument.text',
            'application/rtf'
        ];
        
        if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx?|txt|html?|png|jpe?g|gif|odt|rtf)$/i)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
    }
});

// Enhanced cleanup function
function cleanupFile(filePath, delay = 30000) {
    if (filePath && fs.existsSync(filePath)) {
        setTimeout(() => {
            try {
                fs.unlinkSync(filePath);
                logger.info(`Cleaned up file: ${filePath}`);
            } catch (error) {
                logger.error(`Failed to cleanup file ${filePath}:`, error);
            }
        }, delay);
    }
}

// Enhanced conversion function with better error handling
function convertFile(inputPath, outputPath, targetFormat, callback) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, inputExt);
    
    logger.info(`Converting ${inputExt} to ${targetFormat}: ${inputPath}`);
    
    let command;
    let args = [];
    let timeout = 120000; // 2 minutes default
    
    try {
        switch (targetFormat.toLowerCase()) {
            case 'pdf':
                if (['.txt', '.html', '.htm'].includes(inputExt)) {
                    // Enhanced Pandoc command with better error handling
                    command = 'pandoc';
                    args = [
                        inputPath,
                        '-o', outputPath,
                        '--pdf-engine=wkhtmltopdf',
                        '--pdf-engine-opt=--enable-local-file-access',
                        '--pdf-engine-opt=--no-stop-slow-scripts',
                        '--pdf-engine-opt=--javascript-delay=1000'
                    ];
                    timeout = 180000; // 3 minutes for PDF generation
                } else if (['.docx', '.doc', '.odt'].includes(inputExt)) {
                    // LibreOffice conversion with enhanced options
                    command = 'libreoffice';
                    args = [
                        '--headless',
                        '--convert-to', 'pdf',
                        '--outdir', path.dirname(outputPath),
                        inputPath
                    ];
                    timeout = 240000; // 4 minutes for document conversion
                } else {
                    throw new Error(`Cannot convert ${inputExt} to PDF`);
                }
                break;
                
            case 'docx':
                if (['.pdf', '.txt', '.html', '.htm', '.odt'].includes(inputExt)) {
                    command = 'pandoc';
                    args = [inputPath, '-o', outputPath];
                    timeout = 180000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to DOCX`);
                }
                break;
                
            case 'txt':
                if (inputExt === '.pdf') {
                    // Enhanced PDF to text with better error handling
                    command = 'pdftotext';
                    args = [inputPath, outputPath];
                    timeout = 120000;
                } else if (['.docx', '.doc', '.odt'].includes(inputExt)) {
                    command = 'pandoc';
                    args = [inputPath, '-t', 'plain', '-o', outputPath];
                    timeout = 120000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to TXT`);
                }
                break;
                
            case 'png':
            case 'jpg':
            case 'jpeg':
                if (['.png', '.jpg', '.jpeg', '.gif'].includes(inputExt)) {
                    command = 'magick';
                    args = [inputPath, outputPath];
                    timeout = 60000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to ${targetFormat}`);
                }
                break;
                
            default:
                throw new Error(`Unsupported target format: ${targetFormat}`);
        }
        
        // Execute conversion with enhanced error handling
        const process = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: timeout
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                // Check if output file was created
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    logger.info(`Conversion successful: ${outputPath}`);
                    callback(null, outputPath);
                } else {
                    const error = `Conversion failed: Output file not created or empty`;
                    logger.error(error);
                    callback(new Error(error));
                }
            } else {
                const error = `Conversion failed with code ${code}: ${stderr || stdout}`;
                logger.error(error);
                callback(new Error(error));
            }
        });
        
        process.on('error', (error) => {
            logger.error(`Process error:`, error);
            callback(error);
        });
        
        // Handle timeout
        setTimeout(() => {
            if (!process.killed) {
                process.kill('SIGTERM');
                const error = `Conversion timeout after ${timeout}ms`;
                logger.error(error);
                callback(new Error(error));
            }
        }, timeout);
        
    } catch (error) {
        logger.error(`Conversion setup error:`, error);
        callback(error);
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Enhanced conversion endpoint with comprehensive error handling
app.post('/api/convert', upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    let inputPath = null;
    let outputPath = null;
    
    try {
        // Validate request
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        if (!req.body.targetFormat) {
            return res.status(400).json({ error: 'Target format not specified' });
        }
        
        inputPath = req.file.path;
        const targetFormat = req.body.targetFormat.toLowerCase();
        const inputExt = path.extname(req.file.originalname).toLowerCase();
        
        logger.info(`Conversion request: ${req.file.originalname} (${inputExt}) -> ${targetFormat}`);
        
        // Generate output path
        const outputDir = 'output';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFileName = `${path.basename(req.file.originalname, inputExt)}.${targetFormat}`;
        outputPath = path.join(outputDir, `${Date.now()}-${outputFileName}`);
        
        // Perform conversion
        convertFile(inputPath, outputPath, targetFormat, (error, result) => {
            const processingTime = Date.now() - startTime;
            
            // Always cleanup input file
            cleanupFile(inputPath, 5000);
            
            if (error) {
                logger.error(`Conversion failed after ${processingTime}ms:`, error);
                
                // Cleanup output file if it exists
                cleanupFile(outputPath, 1000);
                
                // Return appropriate error response
                if (error.message.includes('timeout')) {
                    return res.status(408).json({ 
                        error: 'Conversion timeout - file too large or complex',
                        processingTime: processingTime
                    });
                } else if (error.message.includes('Unsupported') || error.message.includes('Cannot convert')) {
                    return res.status(400).json({ 
                        error: error.message,
                        processingTime: processingTime
                    });
                } else {
                    return res.status(500).json({ 
                        error: 'Internal conversion error',
                        details: error.message,
                        processingTime: processingTime
                    });
                }
            }
            
            // Success - send file
            try {
                if (!fs.existsSync(result)) {
                    throw new Error('Output file not found');
                }
                
                const stats = fs.statSync(result);
                if (stats.size === 0) {
                    throw new Error('Output file is empty');
                }
                
                logger.info(`Conversion completed in ${processingTime}ms: ${result} (${stats.size} bytes)`);
                
                res.download(result, outputFileName, (downloadError) => {
                    // Cleanup output file after download
                    cleanupFile(result, 10000);
                    
                    if (downloadError) {
                        logger.error('Download error:', downloadError);
                    }
                });
                
            } catch (sendError) {
                logger.error('File send error:', sendError);
                cleanupFile(result, 1000);
                res.status(500).json({ 
                    error: 'Failed to send converted file',
                    details: sendError.message,
                    processingTime: processingTime
                });
            }
        });
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`Request processing error after ${processingTime}ms:`, error);
        
        // Cleanup files
        cleanupFile(inputPath, 1000);
        cleanupFile(outputPath, 1000);
        
        res.status(500).json({ 
            error: 'Request processing failed',
            details: error.message,
            processingTime: processingTime
        });
    }
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large (max 50MB)' });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files' });
        }
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        details: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`AllFileConverter server running on port ${PORT}`);
    logger.info('Supported conversions:');
    logger.info('- Documents: PDF  DOCX  TXT  HTML  ODT');
    logger.info('- Images: PNG  JPG  JPEG  GIF');
});

module.exports = app;

