#!/usr/bin/env node

/**
 * AllFileConverter Tool Verification Script
 * Verifies all conversion tools are properly installed and functional
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`${message}`, 'bright');
    log(`${'='.repeat(60)}`, 'cyan');
}

function logSection(message) {
    log(`\n${'-'.repeat(40)}`, 'blue');
    log(`${message}`, 'yellow');
    log(`${'-'.repeat(40)}`, 'blue');
}

// Tool verification configurations
const tools = [
    {
        name: 'Node.js',
        command: 'node',
        args: ['--version'],
        expectedPattern: /v\d+\.\d+\.\d+/,
        critical: true
    },
    {
        name: 'LibreOffice',
        command: 'libreoffice',
        args: ['--version'],
        expectedPattern: /LibreOffice/i,
        critical: true
    },
    {
        name: 'Pandoc',
        command: 'pandoc',
        args: ['--version'],
        expectedPattern: /pandoc/i,
        critical: true
    },
    {
        name: 'ImageMagick',
        command: 'magick',
        args: ['--version'],
        expectedPattern: /ImageMagick/i,
        critical: true
    },
    {
        name: 'FFmpeg',
        command: 'ffmpeg',
        args: ['-version'],
        expectedPattern: /ffmpeg version/i,
        critical: true
    },
    {
        name: 'Ghostscript',
        command: 'gs',
        args: ['--version'],
        expectedPattern: /\d+\.\d+/,
        critical: true
    },
    {
        name: 'Poppler (pdftotext)',
        command: 'pdftotext',
        args: ['-v'],
        expectedPattern: /pdftotext/i,
        critical: true
    },
    {
        name: 'Python3',
        command: 'python3',
        args: ['--version'],
        expectedPattern: /Python \d+\.\d+/,
        critical: false
    },
    {
        name: 'Curl',
        command: 'curl',
        args: ['--version'],
        expectedPattern: /curl/i,
        critical: false
    }
];

// Test file creation for conversion testing
const testFiles = {
    'test.txt': 'This is a test text file for conversion testing.\nIt contains multiple lines.\nUsed for verifying text-based conversions.',
    'test.html': '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Test HTML File</h1><p>This is a test HTML file for conversion testing.</p></body></html>'
};

async function verifyTool(tool) {
    return new Promise((resolve) => {
        const process = spawn(tool.command, tool.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10000
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
            const output = stdout + stderr;
            const isWorking = tool.expectedPattern.test(output);
            
            resolve({
                name: tool.name,
                command: tool.command,
                working: isWorking,
                critical: tool.critical,
                output: output.substring(0, 200),
                exitCode: code
            });
        });
        
        process.on('error', (error) => {
            resolve({
                name: tool.name,
                command: tool.command,
                working: false,
                critical: tool.critical,
                error: error.message,
                exitCode: -1
            });
        });
        
        // Timeout handling
        setTimeout(() => {
            if (!process.killed) {
                process.kill('SIGTERM');
                resolve({
                    name: tool.name,
                    command: tool.command,
                    working: false,
                    critical: tool.critical,
                    error: 'Command timeout',
                    exitCode: -1
                });
            }
        }, 10000);
    });
}

async function createTestFiles() {
    logSection('Creating Test Files');
    
    const testDir = path.join(__dirname, 'test-files');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    for (const [filename, content] of Object.entries(testFiles)) {
        const filePath = path.join(testDir, filename);
        fs.writeFileSync(filePath, content, 'utf8');
        log(`✓ Created: ${filename}`, 'green');
    }
    
    return testDir;
}

async function testConversions(testDir) {
    logSection('Testing Conversion Capabilities');
    
    const conversions = [
        {
            name: 'TXT to PDF (Pandoc)',
            input: path.join(testDir, 'test.txt'),
            output: path.join(testDir, 'test-txt-to-pdf.pdf'),
            command: 'pandoc',
            args: ['test.txt', '-o', 'test-txt-to-pdf.pdf']
        },
        {
            name: 'HTML to PDF (Pandoc)',
            input: path.join(testDir, 'test.html'),
            output: path.join(testDir, 'test-html-to-pdf.pdf'),
            command: 'pandoc',
            args: ['test.html', '-o', 'test-html-to-pdf.pdf']
        }
    ];
    
    const results = [];
    
    for (const conversion of conversions) {
        try {
            // Change to test directory for relative paths
            const { stdout, stderr } = await execAsync(
                `cd "${testDir}" && ${conversion.command} ${conversion.args.join(' ')}`,
                { timeout: 30000 }
            );
            
            const outputExists = fs.existsSync(conversion.output);
            const outputSize = outputExists ? fs.statSync(conversion.output).size : 0;
            
            results.push({
                name: conversion.name,
                success: outputExists && outputSize > 0,
                outputSize: outputSize,
                error: null
            });
            
            if (outputExists && outputSize > 0) {
                log(`✓ ${conversion.name}: SUCCESS (${outputSize} bytes)`, 'green');
            } else {
                log(`✗ ${conversion.name}: FAILED (no output file)`, 'red');
            }
            
        } catch (error) {
            results.push({
                name: conversion.name,
                success: false,
                error: error.message
            });
            log(`✗ ${conversion.name}: ERROR - ${error.message}`, 'red');
        }
    }
    
    return results;
}

async function checkSystemResources() {
    logSection('System Resources Check');
    
    try {
        // Check available disk space
        const { stdout: dfOutput } = await execAsync('df -h .');
        log('Disk Space:', 'yellow');
        log(dfOutput, 'reset');
        
        // Check memory usage
        const { stdout: memOutput } = await execAsync('free -h');
        log('Memory Usage:', 'yellow');
        log(memOutput, 'reset');
        
        // Check CPU info
        const { stdout: cpuOutput } = await execAsync('nproc');
        log(`CPU Cores: ${cpuOutput.trim()}`, 'yellow');
        
    } catch (error) {
        log(`System resource check failed: ${error.message}`, 'red');
    }
}

async function generateReport(toolResults, conversionResults) {
    logHeader('VERIFICATION REPORT');
    
    const criticalTools = toolResults.filter(t => t.critical);
    const workingCritical = criticalTools.filter(t => t.working);
    const failedCritical = criticalTools.filter(t => !t.working);
    
    const nonCriticalTools = toolResults.filter(t => !t.critical);
    const workingNonCritical = nonCriticalTools.filter(t => t.working);
    
    log(`\nCRITICAL TOOLS STATUS:`, 'bright');
    log(`✓ Working: ${workingCritical.length}/${criticalTools.length}`, workingCritical.length === criticalTools.length ? 'green' : 'red');
    
    if (failedCritical.length > 0) {
        log(`\nFAILED CRITICAL TOOLS:`, 'red');
        failedCritical.forEach(tool => {
            log(`  ✗ ${tool.name} (${tool.command}): ${tool.error || 'Not working'}`, 'red');
        });
    }
    
    log(`\nNON-CRITICAL TOOLS STATUS:`, 'bright');
    log(`✓ Working: ${workingNonCritical.length}/${nonCriticalTools.length}`, 'yellow');
    
    log(`\nCONVERSION TESTS:`, 'bright');
    const successfulConversions = conversionResults.filter(c => c.success);
    log(`✓ Successful: ${successfulConversions.length}/${conversionResults.length}`, successfulConversions.length === conversionResults.length ? 'green' : 'red');
    
    const overallStatus = failedCritical.length === 0 && successfulConversions.length === conversionResults.length;
    
    log(`\nOVERALL STATUS: ${overallStatus ? 'READY FOR PRODUCTION' : 'NEEDS ATTENTION'}`, overallStatus ? 'green' : 'red');
    
    // Generate detailed report file
    const reportData = {
        timestamp: new Date().toISOString(),
        tools: toolResults,
        conversions: conversionResults,
        summary: {
            criticalToolsWorking: workingCritical.length,
            totalCriticalTools: criticalTools.length,
            nonCriticalToolsWorking: workingNonCritical.length,
            totalNonCriticalTools: nonCriticalTools.length,
            successfulConversions: successfulConversions.length,
            totalConversions: conversionResults.length,
            overallStatus: overallStatus ? 'READY' : 'NEEDS_ATTENTION'
        }
    };
    
    fs.writeFileSync('tool-verification-report.json', JSON.stringify(reportData, null, 2));
    log(`\nDetailed report saved to: tool-verification-report.json`, 'cyan');
    
    return overallStatus;
}

async function cleanup(testDir) {
    try {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
            log(`\nCleaned up test directory: ${testDir}`, 'cyan');
        }
    } catch (error) {
        log(`Cleanup warning: ${error.message}`, 'yellow');
    }
}

async function main() {
    logHeader('AllFileConverter Tool Verification');
    
    try {
        // Verify all tools
        logSection('Verifying Conversion Tools');
        const toolResults = [];
        
        for (const tool of tools) {
            process.stdout.write(`Checking ${tool.name}... `);
            const result = await verifyTool(tool);
            toolResults.push(result);
            
            if (result.working) {
                log('✓ OK', 'green');
            } else {
                log(`✗ FAILED${result.error ? ` (${result.error})` : ''}`, 'red');
            }
        }
        
        // Check system resources
        await checkSystemResources();
        
        // Create test files and run conversion tests
        const testDir = await createTestFiles();
        const conversionResults = await testConversions(testDir);
        
        // Generate final report
        const isReady = await generateReport(toolResults, conversionResults);
        
        // Cleanup
        await cleanup(testDir);
        
        // Exit with appropriate code
        process.exit(isReady ? 0 : 1);
        
    } catch (error) {
        log(`\nVerification failed: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Run verification if called directly
if (require.main === module) {
    main();
}

module.exports = { verifyTool, tools };