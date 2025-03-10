require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const mongoose = require("mongoose");
const admin = require("firebase-admin");
const axios = require("axios");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Storage Setup
const serviceAccount = require("./firebase-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "your-firebase-bucket.appspot.com",
});
const bucket = admin.storage().bucket();

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Multer Setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Database Schema
const CVSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  cvUrl: String,
});
const CV = mongoose.model("CV", CVSchema);

// API to Upload CV
app.post("/api/upload", upload.single("cv"), async (req, res) => {
  const { name, email, phone } = req.body;
  const file = req.file;

  // Upload CV to Firebase
  const blob = bucket.file(file.originalname);
  const blobStream = blob.createWriteStream();
  blobStream.end(file.buffer);

  // Save to MongoDB
  const cv = new CV({ name, email, phone, cvUrl: `https://storage.googleapis.com/${bucket.name}/${file.originalname}` });
  await cv.save();

  // Send Webhook
  await axios.post("https://rnd-assignment.automations-3d6.workers.dev/", {
    cv_data: { name, email, phone, cvUrl: cv.cvUrl },
    metadata: { status: "testing", cv_processed: true, processed_timestamp: new Date().toISOString() },
  });

  // Send Email
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: "CV Submission Confirmation",
    text: "Your CV has been received and is under review.",
  });

  res.send({ message: "CV uploaded successfully!" });
});

app.listen(5000, () => console.log("Server running on port 5000"));
