const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const cors = require('cors');

const app = express();
const PORT = 3001;

const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Password validation middleware
const PASSWORD = '123';
function validatePassword(req, res, next) {
    const { password } = req.body;
    if (password !== PASSWORD) {
        return res.status(403).send('Invalid password');
    }
    next();
}

// Endpoint for chunk uploads
app.post('/upload-chunk', upload.single('chunk'), validatePassword, (req, res) => {
    const { chunkIndex, totalChunks, fileName } = req.body;
    const chunk = req.file;

    if (!chunk || !fileName || chunkIndex === undefined || !totalChunks) {
        return res.status(400).send('Missing required data');
    }

    const tempDir = path.join(UPLOAD_DIR, `${fileName}_chunks`);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunk.buffer);

    console.log(`Received chunk ${parseInt(chunkIndex) + 1} of ${totalChunks}`);

    if (parseInt(chunkIndex) + 1 === parseInt(totalChunks)) {
        const finalFilePath = path.join(UPLOAD_DIR, fileName);
        const writeStream = fs.createWriteStream(finalFilePath);

        for (let i = 0; i < totalChunks; i++) {
            const chunkData = fs.readFileSync(path.join(tempDir, `chunk_${i}`));
            writeStream.write(chunkData);
        }

        writeStream.end();
        writeStream.on('finish', () => {
            fs.rmSync(tempDir, { recursive: true, force: true });

            try {
                const zip = new AdmZip(finalFilePath);
                const extractTo = path.join(UPLOAD_DIR, fileName.replace('.zip', ''));

                if (!fs.existsSync(extractTo)) {
                    fs.mkdirSync(extractTo);
                }

                zip.extractAllTo(extractTo, true);
                console.log(`File ${fileName} uploaded and extracted successfully!`);

                fs.unlinkSync(finalFilePath);
                res.status(200).send('File uploaded, extracted, and zip file removed successfully');
            } catch (err) {
                console.error(`Error extracting zip file: ${err}`);
                res.status(500).send('Error extracting zip file');
            }
        });

        writeStream.on('error', (err) => {
            console.error(`Error merging file: ${err}`);
            res.status(500).send('Error merging file');
        });
    } else {
        res.status(200).send('Chunk uploaded successfully');
    }
});

// Endpoint to get all .m3u8 file access links
app.get('/get-m3u8-links', (req, res) => {
    try {
        const baseUrl = `http://localhost:${PORT}`;

        function findM3U8Files(dir) {
            let m3u8Files = [];
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    m3u8Files = m3u8Files.concat(findM3U8Files(fullPath));
                } else if (path.extname(file) === '.m3u8') {
                    const relativePath = path.relative(UPLOAD_DIR, fullPath);
                    m3u8Files.push(`${baseUrl}/uploads/${relativePath.replace(/\\/g, '/')}`);
                }
            }

            return m3u8Files;
        }

        const m3u8Links = findM3U8Files(UPLOAD_DIR);
        res.status(200).json({ links: m3u8Links });
    } catch (err) {
        console.error(`Error fetching .m3u8 files: ${err}`);
        res.status(500).send('Error fetching .m3u8 files');
    }
});

app.get('/uploads/:folder/:file', (req, res) => {
    const { folder, file } = req.params;
    const filePath = path.join(UPLOAD_DIR, folder, file);

    // Verify if the file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Allow access only if the Referer or Origin header matches your app's domain
    const allowedDomains = ['https://localhost:3000']; // Add your app's URL here
    const referer = req.get('Referer') || req.get('Origin');

    if (!referer || !allowedDomains.some((domain) => referer.startsWith(domain))) {
        console.warn(`Unauthorized access attempt to: ${filePath} from ${referer}`);
        return res.status(403).send('Access restricted to authorized applications');
    }

    // Serve the file if authorized
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving file: ${err}`);
            res.status(500).send('Error serving the file');
        }
    });
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
