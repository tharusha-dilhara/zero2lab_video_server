const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = 3001;

// Middleware to parse JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder to store uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// Middleware to handle file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Password validation middleware
const PASSWORD = '123'; // The same password used in the client-side

function validatePassword(req, res, next) {
    const { password } = req.body;
    if (password !== PASSWORD) {
        return res.status(403).send('Invalid password');
    }
    next();
}

// Endpoint to handle chunk uploads with password validation
app.post('/upload-chunk', upload.single('chunk'), validatePassword, (req, res) => {
    const { chunkIndex, totalChunks, fileName } = req.body;
    const chunk = req.file;

    if (!chunk || !fileName || chunkIndex === undefined || !totalChunks) {
        return res.status(400).send('Missing required data');
    }

    // Use a unique temporary directory for chunks
    const tempDir = path.join(UPLOAD_DIR, `${fileName}_chunks`);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    // Save the chunk to the temporary directory
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunk.buffer);

    console.log(`Received chunk ${parseInt(chunkIndex) + 1} of ${totalChunks}`);

    // If all chunks are uploaded, merge them
    if (parseInt(chunkIndex) + 1 === parseInt(totalChunks)) {
        const finalFilePath = path.join(UPLOAD_DIR, fileName);
        const writeStream = fs.createWriteStream(finalFilePath);

        for (let i = 0; i < totalChunks; i++) {
            const chunkData = fs.readFileSync(path.join(tempDir, `chunk_${i}`));
            writeStream.write(chunkData);
        }

        writeStream.end();
        writeStream.on('finish', () => {
            // Remove the temporary directory after merging
            fs.rmSync(tempDir, { recursive: true, force: true });

            // Extract the contents of the zip file
            try {
                const zip = new AdmZip(finalFilePath);
                const extractTo = path.join(UPLOAD_DIR, fileName.replace('.zip', ''));

                // Ensure the destination directory exists
                if (!fs.existsSync(extractTo)) {
                    fs.mkdirSync(extractTo);
                }

                zip.extractAllTo(extractTo, true);
                console.log(`File ${fileName} uploaded and extracted successfully!`);

                // Remove the zip file after extraction
                fs.unlinkSync(finalFilePath);
                console.log(`Zip file ${fileName} removed successfully!`);

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

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
