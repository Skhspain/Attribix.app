const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;
let db;

// Middleware to parse JSON
app.use(express.json());

// MongoDB connection URI (includes your username, password, and cluster info)
const uri = 'mongodb+srv://attribix1:DVTFMmPwXTTf472V@my-project-backend.smfmrhid.mongodb.net/?retryWrites=true&w=majority&appName=My-project-backend';

// Connect to MongoDB and start the server
async function startServer() {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db('attribix');  // You can change 'attribix' to your preferred database name
    console.log('✅ Connected to MongoDB');

    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

startServer();

// Basic test route
app.get('/hello', (req, res) => {
  res.send('Hello, world!');
});

// Optional: test DB connection route
app.get('/test-db', async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});