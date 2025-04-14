const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
//const ytdl = require('ytdl-core');
const urlRegex = require('url-regex-safe'); // Safe URL regex validation
const ytdl = require("@distube/ytdl-core");
const app = express();
const port = 3000;

// Initialize AWS S3
const s3 = new AWS.S3();
const BUCKET_NAME = 'yt-down-1';  // Replace with your bucket name

// Body parser middleware
app.use(express.json());

// Helper function to validate YouTube URL
function isValidYouTubeURL(url) {
  return urlRegex({ exact: true }).test(url) && ytdl.validateURL(url);
}

// Endpoint to download the YouTube video
app.post('/download', async (req, res) => {
  const { videoUrl, userId } = req.body;

if (!videoUrl || !isValidYouTubeURL(videoUrl) || !userId) {
  console.log('Invalid request:', { videoUrl, userId });
  return res.status(400).json({ error: 'Missing or invalid video URL or userId' });
}


  const videoId = videoUrl.split('v=')[1];
  const title = `video-${videoId}.mp4`;
  const filePath = path.join(__dirname, title);

  console.log('Starting to download video:', videoUrl);

  try {
    const spoofedOptions = {
      filter: 'audioandvideo',
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
        },
      },
    };

    const videoStream = ytdl(videoUrl, spoofedOptions);
    const fileWriteStream = fs.createWriteStream(filePath);

    videoStream.on('error', (err) => {
      console.error('Error with video stream:', err);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).json({ error: 'Error downloading video' });
    });

    fileWriteStream.on('error', (err) => {
      console.error('Error with file write stream:', err);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).json({ error: 'Error writing video to file' });
    });

    fileWriteStream.on('finish', async () => {
      console.log('Video downloaded locally, starting upload to S3...');

      const fileStream = fs.createReadStream(filePath);
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: title,
        Body: fileStream,
        ContentType: 'video/mp4',
        Metadata: {
          userId: userId, // S3 metadata keys must be lowercase
        },
      };
      

      s3.upload(uploadParams, (err, data) => {
        fs.unlinkSync(filePath);

        if (err) {
          console.error('Error uploading to S3', err);
          return res.status(500).json({ error: 'Failed to upload video to S3' });
        }

        console.log('Video successfully uploaded to S3:', data.Location);
        res.status(200).json({ message: 'Video successfully uploaded to S3', s3Url: data.Location });
      });
    });

    videoStream.pipe(fileWriteStream);
  } catch (err) {
    console.error('Error downloading video:', err);
    res.status(500).json({ error: 'Failed to download video' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`yt-downloader microservice running at http://localhost:${port}`);
});
