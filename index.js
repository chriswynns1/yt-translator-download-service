const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const ytdl = require('ytdl-core');
const urlRegex = require('url-regex-safe'); // Safe URL regex validation

const app = express();
const port = 3000;

// Initialize AWS S3
const s3 = new AWS.S3();
const BUCKET_NAME = 'yt-translator-down-1';  // Replace with your bucket name

// Body parser middleware
app.use(express.json());

// Helper function to validate YouTube URL
function isValidYouTubeURL(url) {
  return urlRegex({ exact: true }).test(url) && ytdl.validateURL(url);
}

// Endpoint to download the YouTube video
app.post('/download', async (req, res) => {
  const { videoUrl } = req.body;

  // Step 1: Validate the URL
  if (!videoUrl || !isValidYouTubeURL(videoUrl)) {
    console.log('Invalid URL:', videoUrl);  // Log invalid URL
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  // Step 2: Define the video file path (temporarily saved)
  const videoId = videoUrl.split('v=')[1];  // Simple way to get video ID
  const title = `video-${videoId}.mp4`;
  const filePath = path.join(__dirname, title);  // Saving video locally

  console.log('Starting to download video:', videoUrl);  // Log video URL
  try {
    // Step 3: Download the video using ytdl-core (save it locally)
    const videoStream = ytdl(videoUrl, { quality: 'highestvideo' });

    // Step 4: Set up a writable file stream
    const fileWriteStream = fs.createWriteStream(filePath);
    
    // Add error handling to videoStream
    videoStream.on('error', (err) => {
      console.error('Error with video stream:', err);
      fs.unlinkSync(filePath);  // Remove partial file if error occurs
      res.status(500).json({ error: 'Error downloading video' });
    });

    // Add error handling to fileWriteStream
    fileWriteStream.on('error', (err) => {
      console.error('Error with file write stream:', err);
      fs.unlinkSync(filePath);  // Remove partial file if error occurs
      res.status(500).json({ error: 'Error writing video to file' });
    });

    // Add 'finish' event to fileWriteStream to handle when the download is complete
    fileWriteStream.on('finish', async () => {
      console.log('Video downloaded locally, starting upload to S3...');

      // Step 5: Upload the video to S3
      const fileStream = fs.createReadStream(filePath);  // Read file from disk
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: title,
        Body: fileStream,
        ContentType: 'video/mp4',
      };

      // Step 6: Upload to S3
      s3.upload(uploadParams, (err, data) => {
        // Delete the local file after uploading to S3
        fs.unlinkSync(filePath);  // Remove file from local disk

        if (err) {
          console.error('Error uploading to S3', err);
          return res.status(500).json({ error: 'Failed to upload video to S3' });
        }

        console.log('Video successfully uploaded to S3:', data.Location);
        res.status(200).json({ message: 'Video successfully uploaded to S3', s3Url: data.Location });
      });
    });

    // Start piping the video stream to the fileWriteStream
    videoStream.pipe(fileWriteStream);

  } catch (err) {
    console.error('Error downloading video:', err);  // Log the error that caused the failure
    res.status(500).json({ error: 'Failed to download video' });
  }
});
// test comment for github actions
// Start the server
app.listen(port, () => {
  console.log(`yt-downloader microservice running at http://localhost:${port}`);
});
