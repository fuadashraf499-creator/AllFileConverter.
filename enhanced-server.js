const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const cors = require('cors');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced logging configuration with rotation
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'allfileconverter', version: '2.0' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => {
    return rateLimit({
        windowMs: windowMs,
        max: max,
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
            res.status(429).json({ error: message });
        }
    });
};

// Apply different rate limits for different endpoints
const generalLimiter = createRateLimit(15 * 60 * 1000, 100, 'Too many requests, please try again later');
const conversionLimiter = createRateLimit(15 * 60 * 1000, 10, 'Too many conversion requests, please try again later');
const healthLimiter = createRateLimit(1 * 60 * 1000, 60, 'Too many health check requests');

app.use(generalLimiter);

// Enhanced CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8080',
            'http://127.0.0.1:8080'
        ];
        
        // Allow AWS domains
        if (!origin || allowedOrigins.includes(origin) || /\.amazonaws\.com$/.test(origin)) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Enhanced request parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    next();
});

// Request ID middleware for tracking
app.use((req, res, next) => {
    req.id = uuidv4();
    res.setHeader('X-Request-ID', req.id);
    logger.info(`Request started: ${req.method} ${req.path}`, { requestId: req.id, ip: req.ip });
    next();
});

// Enhanced multer configuration with virus scanning simulation
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
        const filename = `${req.id}-${uniqueSuffix}-${sanitizedName}`;
        cb(null, filename);
    }
});

// Enhanced file filter with security checks
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.oasis.opendocument.text',
        'application/rtf',
        'text/plain',
        'text/html',
        'text/csv',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/bmp',
        'image/tiff',
        'image/webp',
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'audio/mp3',
        'audio/wav',
        'audio/flac',
        'audio/aac'
    ];
    
    const allowedExtensions = /\.(pdf|docx?|odt|rtf|txt|html?|csv|png|jpe?g|gif|bmp|tiff?|webp|mp4|avi|mov|wmv|mp3|wav|flac|aac)$/i;
    
    // Check file extension and MIME type
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.test(file.originalname)) {
        // Additional security: check for suspicious file names
        const suspiciousPatterns = /\.(exe|bat|cmd|scr|pif|com|vbs|js|jar|app|deb|rpm)$/i;
        if (suspiciousPatterns.test(file.originalname)) {
            logger.warn(`Suspicious file upload attempt: ${file.originalname}`, { requestId: req.id });
            cb(new Error('File type not allowed for security reasons'), false);
            return;
        }
        
        cb(null, true);
    } else {
        logger.warn(`Unsupported file type: ${file.mimetype} - ${file.originalname}`, { requestId: req.id });
        cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 1,
        fieldSize: 1024 * 1024 // 1MB field size limit
    },
    fileFilter: fileFilter
});

// Enhanced cleanup function with better error handling
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

// Enhanced conversion function with better tool selection
function convertFile(inputPath, outputPath, targetFormat, requestId, callback) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, inputExt);
    
    logger.info(`Converting ${inputExt} to ${targetFormat}: ${inputPath}`, { requestId });
    
    let command;
    let args = [];
    let timeout = 120000; // 2 minutes default
    
    try {
        switch (targetFormat.toLowerCase()) {
            case 'pdf':
                if (['.txt', '.html', '.htm'].includes(inputExt)) {
                    command = 'wkhtmltopdf';
                    args = [
                        '--page-size', 'A4',
                        '--margin-top', '0.75in',
                        '--margin-right', '0.75in',
                        '--margin-bottom', '0.75in',
                        '--margin-left', '0.75in',
                        '--encoding', 'UTF-8',
                        '--quiet',
                        inputPath,
                        outputPath
                    ];
                    timeout = 180000;
                } else if (['.docx', '.doc', '.odt', '.rtf'].includes(inputExt)) {
                    command = 'libreoffice';
                    args = [
                        '--headless',
                        '--convert-to', 'pdf',
                        '--outdir', path.dirname(outputPath),
                        inputPath
                    ];
                    timeout = 240000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to PDF`);
                }
                break;
                
            case 'docx':
                if (['.pdf', '.txt', '.html', '.htm', '.odt', '.rtf'].includes(inputExt)) {
                    command = 'pandoc';
                    args = [inputPath, '-o', outputPath];
                    timeout = 180000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to DOCX`);
                }
                break;
                
            case 'txt':
                if (inputExt === '.pdf') {
                    command = 'pdftotext';
                    args = ['-layout', inputPath, outputPath];
                    timeout = 120000;
                } else if (['.docx', '.doc', '.odt', '.rtf'].includes(inputExt)) {
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
            case 'gif':
            case 'bmp':
            case 'tiff':
            case 'webp':
                if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.pdf'].includes(inputExt)) {
                    command = 'magick';
                    args = [inputPath, '-quality', '95', outputPath];
                    timeout = 60000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to ${targetFormat}`);
                }
                break;
                
            case 'mp4':
            case 'avi':
            case 'mov':
                if (['.mp4', '.avi', '.mov', '.wmv'].includes(inputExt)) {
                    command = 'ffmpeg';
                    args = ['-i', inputPath, '-c:v', 'libx264', '-c:a', 'aac', '-y', outputPath];
                    timeout = 300000; // 5 minutes for video
                } else {
                    throw new Error(`Cannot convert ${inputExt} to ${targetFormat}`);
                }
                break;
                
            case 'mp3':
            case 'wav':
            case 'flac':
                if (['.mp3', '.wav', '.flac', '.aac', '.mp4', '.avi', '.mov'].includes(inputExt)) {
                    command = 'ffmpeg';
                    args = ['-i', inputPath, '-y', outputPath];
                    timeout = 180000;
                } else {
                    throw new Error(`Cannot convert ${inputExt} to ${targetFormat}`);
                }
                break;
                
            default:
                throw new Error(`Unsupported target format: ${targetFormat}`);
        }
        
        // Execute conversion with enhanced monitoring
        logger.info(`Executing: ${command} ${args.join(' ')}`, { requestId });
        
        const process = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: timeout,
            env: { ...process.env, DISPLAY: ':99' }
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
                // Check if output file was created and has content
                if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    if (stats.size > 0) {
                        logger.info(`Conversion successful: ${outputPath} (${stats.size} bytes)`, { requestId });
                        callback(null, outputPath);
                    } else {
                        const error = `Conversion failed: Output file is empty`;
                        logger.error(error, { requestId });
                        callback(new Error(error));
                    }
                } else {
                    const error = `Conversion failed: Output file not created`;
                    logger.error(error, { requestId });
                    callback(new Error(error));
                }
            } else {
                const error = `Conversion failed with code ${code}: ${stderr || stdout}`;
                logger.error(error, { requestId });
                callback(new Error(error));
            }
        });
        
        process.on('error', (error) => {
            logger.error(`Process error:`, { error: error.message, requestId });
            callback(error);
        });
        
        // Handle timeout
        setTimeout(() => {
            if (!process.killed) {
                process.kill('SIGTERM');
                const error = `Conversion timeout after ${timeout}ms`;
                logger.error(error, { requestId });
                callback(new Error(error));
            }
        }, timeout);
        
    } catch (error) {
        logger.error(`Conversion setup error:`, { error: error.message, requestId });
        callback(error);
    }
}

// Enhanced health check endpoint
app.get('/api/health', healthLimiter, (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '2.0',
        environment: process.env.NODE_ENV || 'development',
        requestId: req.id
    };
    
    res.status(200).json(healthData);
});

// System info endpoint (for monitoring)
app.get('/api/system', generalLimiter, (req, res) => {
    const systemInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        loadAverage: require('os').loadavg(),
        freeMemory: require('os').freemem(),
        totalMemory: require('os').totalmem(),
        requestId: req.id
    };
    
    res.status(200).json(systemInfo);
});

// Enhanced conversion endpoint
app.post('/api/convert', conversionLimiter, upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    let inputPath = null;
    let outputPath = null;
    
    try {
        // Validate request
        if (!req.file) {
            logger.warn('No file uploaded', { requestId: req.id });
            return res.status(400).json({ 
                error: 'No file uploaded',
                requestId: req.id
            });
        }
        
        if (!req.body.targetFormat) {
            logger.warn('Target format not specified', { requestId: req.id });
            return res.status(400).json({ 
                error: 'Target format not specified',
                requestId: req.id
            });
        }
        
        inputPath = req.file.path;
        const targetFormat = req.body.targetFormat.toLowerCase();
        const inputExt = path.extname(req.file.originalname).toLowerCase();
        
        logger.info(`Conversion request: ${req.file.originalname} (${inputExt}) -> ${targetFormat}`, {
            requestId: req.id,
            fileSize: req.file.size,
            ip: req.ip
        });
        
        // Generate output path
        const outputDir = 'output';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFileName = `${path.basename(req.file.originalname, inputExt)}.${targetFormat}`;
        outputPath = path.join(outputDir, `${req.id}-${Date.now()}-${outputFileName}`);
        
        // Perform conversion
        convertFile(inputPath, outputPath, targetFormat, req.id, (error, result) => {
            const processingTime = Date.now() - startTime;
            
            // Always cleanup input file
            cleanupFile(inputPath, 5000);
            
            if (error) {
                logger.error(`Conversion failed after ${processingTime}ms:`, {
                    error: error.message,
                    requestId: req.id,
                    processingTime
                });
                
                // Cleanup output file if it exists
                cleanupFile(outputPath, 1000);
                
                // Return appropriate error response
                if (error.message.includes('timeout')) {
                    return res.status(408).json({ 
                        error: 'Conversion timeout - file too large or complex',
                        processingTime: processingTime,
                        requestId: req.id
                    });
                } else if (error.message.includes('Unsupported') || error.message.includes('Cannot convert')) {
                    return res.status(400).json({ 
                        error: error.message,
                        processingTime: processingTime,
                        requestId: req.id
                    });
                } else {
                    return res.status(500).json({ 
                        error: 'Internal conversion error',
                        details: error.message,
                        processingTime: processingTime,
                        requestId: req.id
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
                
                logger.info(`Conversion completed in ${processingTime}ms: ${result} (${stats.size} bytes)`, {
                    requestId: req.id,
                    processingTime,
                    outputSize: stats.size
                });
                
                res.download(result, outputFileName, (downloadError) => {
                    // Cleanup output file after download
                    cleanupFile(result, 10000);
                    
                    if (downloadError) {
                        logger.error('Download error:', { error: downloadError.message, requestId: req.id });
                    }
                });
                
            } catch (sendError) {
                logger.error('File send error:', { error: sendError.message, requestId: req.id });
                cleanupFile(result, 1000);
                res.status(500).json({ 
                    error: 'Failed to send converted file',
                    details: sendError.message,
                    processingTime: processingTime,
                    requestId: req.id
                });
            }
        });
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`Request processing error after ${processingTime}ms:`, {
            error: error.message,
            requestId: req.id,
            processingTime
        });
        
        // Cleanup files
        cleanupFile(inputPath, 1000);
        cleanupFile(outputPath, 1000);
        
        res.status(500).json({ 
            error: 'Request processing failed',
            details: error.message,
            processingTime: processingTime,
            requestId: req.id
        });
    }
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', { error: error.message, stack: error.stack, requestId: req.id });
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
                error: 'File too large (max 100MB)',
                requestId: req.id
            });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                error: 'Too many files',
                requestId: req.id
            });
        }
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        details: error.message,
        requestId: req.id
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn(`404 - Endpoint not found: ${req.method} ${req.path}`, { requestId: req.id });
    res.status(404).json({ 
        error: 'Endpoint not found',
        requestId: req.id
    });
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
    logger.info(`AllFileConverter Enhanced Server v2.0 running on port ${PORT}`);
    logger.info('Enhanced features enabled:');
    logger.info('- Rate limiting and security headers');
    logger.info('- Comprehensive file type support');
    logger.info('- Enhanced error handling and logging');
    logger.info('- Request tracking and monitoring');
    logger.info('Supported conversions:');
    logger.info('- Documents: PDF ↔ DOCX ↔ TXT ↔ HTML ↔ ODT ↔ RTF');
    logger.info('- Images: PNG ↔ JPG ↔ GIF ↔ BMP ↔ TIFF ↔ WebP');
    logger.info('- Videos: MP4 ↔ AVI ↔ MOV ↔ WMV');
    logger.info('- Audio: MP3 ↔ WAV ↔ FLAC ↔ AAC');
});

module.exports = app;