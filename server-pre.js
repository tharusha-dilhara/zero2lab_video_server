const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const cors = require('cors')
const app = express();
const PORT = 3001;


const corsOptions = {
    origin: "*",
};
app.use(cors(corsOptions));
app.use(express.json());

// const cors = require('cors');
// app.use(cors({ origin: 'http://localhost:3000' })); // Adjust for your client origin



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



// Endpoint to get all .m3u8 file access links
app.get('/get-m3u8-links', (req, res) => {
    try {
        const baseUrl = `http://localhost:${PORT}`;

        // Helper function to recursively find .m3u8 files
        function findM3U8Files(dir) {
            let m3u8Files = [];

            // Read the directory
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const fullPath = path.join(dir, file);

                // Check if it's a directory
                if (fs.statSync(fullPath).isDirectory()) {
                    // Recursively search in subdirectory
                    m3u8Files = m3u8Files.concat(findM3U8Files(fullPath));
                } else if (path.extname(file) === '.m3u8') {
                    // If it's an .m3u8 file, add its access link
                    const relativePath = path.relative(UPLOAD_DIR, fullPath);
                    m3u8Files.push(`${baseUrl}/uploads/${relativePath.replace(/\\/g, '/')}`);
                }
            }

            return m3u8Files;
        }

        // Find all .m3u8 files starting from the UPLOAD_DIR
        const m3u8Links = findM3U8Files(UPLOAD_DIR);

        res.status(200).json({ links: m3u8Links });
    } catch (err) {
        console.error(`Error fetching .m3u8 files: ${err}`);
        res.status(500).send('Error fetching .m3u8 files');
    }
});



app.get('/uploads/:folder/encryption.key', (req, res) => {
    const folderName = req.params.folder;
    const filePath = path.join(UPLOAD_DIR, folderName, 'encryption.key');

    // Check if the 'encryption.key' file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Set headers for the binary key file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');

    // Serve the file
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving file: ${err}`);
            res.status(500).send('Error serving the file');
        }
    });
});


// Serve the 'output.m3u8' file from specific folders
app.get('/uploads/:folder/output.m3u8', (req, res) => {
    const folderName = req.params.folder;
    const filePath = path.join(UPLOAD_DIR, folderName, 'output.m3u8');

    // Check if the 'output.m3u8' file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Set headers for the m3u8 playlist file
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'inline');

    // Serve the file
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving file: ${err}`);
            res.status(500).send('Error serving the file');
        }
    });
});

// Serve the 'output.m3u8' file from specific folders
app.get('/uploads/:folder/:file', (req, res)  =>  {
    const folderName = req.params.folder;
    const file = req.params.file;
    const filePath = path.join(UPLOAD_DIR, folderName, file);


    // Check if the 'output.m3u8' file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Set headers for the m3u8 playlist file
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'inline');

    // Serve the file
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving file: ${err}`);
            res.status(500).send('Error serving the file');
        }
    });
});




// app.use('/uploads', express.static(UPLOAD_DIR));



// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
