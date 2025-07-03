import express from "express";
import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 3000;
let db;
app.use(express.json());
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ Missing MONGODB_URI environment variable");
  process.exit(1);
}
async function startServer() {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.MONGODB_DB || "attribix");
    console.log("✅ Connected to MongoDB");

    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (err) {
      console.error("❌ MongoDB connection error:", err);
  }
}

startServer();

app.get("/hello", (req, res) => {
  res.send("Hello, world!");
});
app.get("/test-db", async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: "Database error", details: error.message });
  }
  });