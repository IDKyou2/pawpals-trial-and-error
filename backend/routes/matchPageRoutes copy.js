const express = require("express");
const LostDog = require("../models/LostDog");
const FoundDog = require("../models/FoundDog");
const Stats = require("../models/Stats");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const PetIdCounter = require("../models/PetIdCounter");
const tf = require("@tensorflow/tfjs-node");
const stringSimilarity = require("string-similarity");

// Directory setup for lost and found dog images
const lostDogsDir = path.join(__dirname, "../../uploads/lostDogs");
const foundDogsDir = path.join(__dirname, "../../uploads/foundDogs");

if (!fs.existsSync(lostDogsDir)) {
  fs.mkdirSync(lostDogsDir, { recursive: true });
}
if (!fs.existsSync(foundDogsDir)) {
  fs.mkdirSync(foundDogsDir, { recursive: true });
}

const compareEmbeddings = (embedding1, embedding2) => {
  const distance = tf.losses.cosineDistance(embedding1, embedding2, 0).dataSync()[0];
  return 1 - distance;
};


// Optimized 
function getColorHistogram(imageTensor) {
  const resized = tf.image.resizeBilinear(imageTensor, [128, 128]).squeeze().toInt();
  const [height, width, channels] = resized.shape;
  const numBins = 16; // more bins = more detail, but more memory

  const reshaped = resized.reshape([height * width, channels]);
  const histograms = [];

  for (let c = 0; c < channels; c++) {
    const channelData = reshaped.slice([0, c], [-1, 1]).flatten(); // shape: [H*W]
    const binWidth = 256 / numBins;

    const indices = channelData.div(binWidth).floor().clipByValue(0, numBins - 1).toInt(); // shape: [H*W]
    const oneHot = tf.oneHot(indices, numBins); // shape: [H*W, numBins]

    const hist = oneHot.sum(0); // shape: [numBins]
    histograms.push(hist.toFloat());

    tf.dispose([channelData, indices, oneHot]); // Dispose ASAP
  }

  const finalHistogram = tf.concat(histograms); // shape: [numBins * 3]
  const normalizedHistogram = finalHistogram.div(tf.maximum(finalHistogram.sum(), 1));

  tf.dispose([reshaped, ...histograms, finalHistogram]);

  return normalizedHistogram;
}


// Compare histograms using cosine similarity
function compareColorHistograms(hist1, hist2) {
  return tf.tidy(() => {
    // Calculate cosine similarity
    const dotProduct = tf.sum(hist1.mul(hist2));
    const norms = tf.mul(hist1.norm(), hist2.norm());
    const cosineSimilarity = tf.div(dotProduct, norms);

    // Convert to percentage and format
    const similarityPercent = tf.mul(cosineSimilarity, 100);
    return Math.round(similarityPercent.dataSync()[0]);
    //return parseFloat(similarityPercent.dataSync()[0].toFixed(2));
  });
}


/* 
// backup default
function compareColorHistograms(hist1, hist2) {
  return tf.tidy(() => {
    const dotProduct = hist1.mul(hist2).sum();  
    const norm1 = hist1.norm();
    const norm2 = hist2.norm();
    
    const cosineSimilarity = dotProduct.div(norm1.mul(norm2));
    return (cosineSimilarity.dataSync()[0] * 100).toFixed(2); // percent
  });
}
*/


// Match Dogs Endpoint
router.get("/match-dogs", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided!" });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const lostDogs = await LostDog.find({ reunited: false }).populate(
      "userId",
      "fullName contact"
    );
    const foundDogs = await FoundDog.find({ reunited: false }).populate(
      "userId",
      "fullName contact"
    );
    const allDogs = [...lostDogs, ...foundDogs];
    const mobilenetModel = req.mobilenetModel;

    if (!mobilenetModel) {
      return res.status(500).json({ message: "MobileNet model not loaded" });
    }

    const supportedExtensions = [".jpeg", ".jpg", ".png"];
    const dogsWithValidImages = allDogs.filter((dog) => {
      if (!dog.imagePath) return false;
      const extension = dog.imagePath.toLowerCase();
      return supportedExtensions.some((ext) => extension.endsWith(ext));
    });

    console.log(
      "Processing dogs with valid images:",
      dogsWithValidImages.length
    );

    const imageData = [];

    for (const dog of dogsWithValidImages) {
      try {
        const imagePath = path.join(__dirname, "../../uploads", dog.imagePath.replace(/^\/uploads/, ""));
        if (!fs.existsSync(imagePath)) {
          console.error(`Image not found: ${imagePath}`);
          continue;
        }

        const imageBuffer = fs.readFileSync(imagePath);

        let imageTensor;
        const extension = dog.imagePath.toLowerCase().split(".").pop();
        if (extension === "jpg" || extension === "jpeg") {
          imageTensor = tf.node.decodeJpeg(imageBuffer);
        } else if (extension === "png") {
          imageTensor = tf.node.decodePng(imageBuffer);
        } else {
          console.error(`Unsupported image format for ${dog.petId}`);
          continue;
        }

        const resizedTensor = tf.image
          .resizeNearestNeighbor(imageTensor, [224, 224])
          .toFloat()
          .expandDims();

        const embedding = await mobilenetModel.infer(resizedTensor, true);

        tf.dispose(resizedTensor);

        imageData.push({ dog, embedding, imageTensor });

      } catch (error) {
        console.error(`Error processing image for ${dog.petId}:`, error);
        continue;
      }
    }

    const dogMatches = [];

    for (let i = 0; i < imageData.length; i++) {
      const { dog: dog1, embedding: emb1, imageTensor: img1 } = imageData[i];

      for (let j = i + 1; j < imageData.length; j++) {
        const { dog: dog2, embedding: emb2, imageTensor: img2 } = imageData[j];

        const isSameUser = dog1.userId?._id.toString() === dog2.userId?._id.toString();
        const isDifferentCategory = dog1.category !== dog2.category;
        const isLostDog = dog1.category === "Lost" || dog2.category === "Lost";
        const isFoundDog = dog1.category === "Found" || dog2.category === "Found";

        const breed1 = dog1.breed?.toLowerCase() || "";
        const breed2 = dog2.breed?.toLowerCase() || "";

        const breedSimilarityRaw = stringSimilarity.compareTwoStrings(breed1, breed2);
        const breedSimilarity = Math.round(breedSimilarityRaw * 100);

        if (!isSameUser && isDifferentCategory && isLostDog && isFoundDog && breedSimilarity >= 50) {
          const similarityRaw = compareEmbeddings(emb1, emb2);
          let imageSimilarityPercentage = Math.min(100, Math.round(similarityRaw * 10000) / 100);

          if (imageSimilarityPercentage >= 0) {
            //  Build histograms and compare
            const hist1 = getColorHistogram(img1);
            const hist2 = getColorHistogram(img2);
            const colorSimilarity = compareColorHistograms(hist1, hist2);

            tf.dispose([hist1, hist2]); // Dispose right after use

            if (colorSimilarity > 0) {
              dogMatches.push({
                petId1: dog1.petId,
                petId2: dog2.petId,
                imageSimilarityPercentage,
                colorSimilarity,
                breedSimilarity,
                dog1: {
                  petId: dog1.petId,
                  imagePath: dog1.imagePath,
                  category: dog1.category,
                  userId: dog1.userId?._id,
                  userName: dog1.userId?.fullName,
                  contact: dog1.userId?.contact,
                },
                dog2: {
                  petId: dog2.petId,
                  imagePath: dog2.imagePath,
                  category: dog2.category,
                  userId: dog2.userId?._id,
                  userName: dog2.userId?.fullName,
                  contact: dog2.userId?.contact,
                },
              });
            }
          }
        }
      }

      //  Dispose each dog's tensors after all pair comparisons are done
      if (emb1) tf.dispose(emb1);
      if (img1) tf.dispose(img1);
    }

    const userMatches = dogMatches.filter(
      (match) =>
        match.dog1.userId.toString() === userId ||
        match.dog2.userId.toString() === userId
    );

    res.status(200).json({ matches: userMatches });
  } catch (error) {
    console.error("Error matching dogs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Lost Dog Profile Route
router.post("/lostdog", async (req, res) => {
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  console.log("Request Files:", req.files);

  const { name, breed, size, gender, location, details, category } = req.body;

  if (!name || !breed || !size || !gender || !location || !category) {
    console.log("Missing required fields:", {
      name,
      breed,
      size,
      gender,
      location,
      category,
    });
    return res
      .status(400)
      .json({ message: "All fields except details are required!" });
  }

  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      console.log("No token provided");
      return res.status(401).json({ message: "No token provided!" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded Token:", decoded);
    const userId = decoded.userId;

    const petIdCounter = await PetIdCounter.findOneAndUpdate(
      {},
      { $inc: { nextPetId: 1 } },
      { new: true, upsert: true }
    );
    const petId = petIdCounter.nextPetId;

    let imagePath;
    if (req.files && req.files.dogImage) {
      const file = req.files.dogImage;
      console.log("File Details:", {
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
      });

      const validImageTypes = ["image/png", "image/jpeg", "image/jpg"];
      if (!validImageTypes.includes(file.mimetype)) {
        console.log("Invalid file type:", file.mimetype);
        return res.status(400).json({
          message: "Invalid file type. Only PNG, JPEG, and JPG are allowed.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        console.log("File size too large:", file.size);
        return res
          .status(400)
          .json({ message: "File size exceeds 10MB limit." });
      }

      const filename = `${Date.now()}-${file.name}`;
      imagePath = `/uploads/lostDogs/${filename}`;
      const fullPath = path.join(lostDogsDir, filename);

      console.log("Attempting to save image to:", fullPath);
      try {
        await file.mv(fullPath);
        console.log("Image successfully saved to:", fullPath);
      } catch (mvError) {
        console.error("Error moving file:", mvError);
        return res
          .status(500)
          .json({ message: "Failed to save image", error: mvError.message });
      }
    }

    const lostDogProfile = new LostDog({
      petId,
      name,
      breed,
      size,
      gender,
      location,
      details: details || undefined,
      category,
      imagePath: imagePath || undefined,
      userId,
      postType: "lost",
    });

    const savedLostDog = await lostDogProfile.save();
    console.log("Saved Lost Dog:", savedLostDog);

    req.io.emit("newLostDog", savedLostDog);

    res.status(201).json({
      message: "Lost dog profile created successfully!",
      lostDog: savedLostDog,
    });
  } catch (error) {
    console.error("Error saving lost dog profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Found Dog Profile Route
router.post("/founddog", async (req, res) => {
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  console.log("Request Files:", req.files);

  const { breed, size, gender, location, details } = req.body;

  if (!breed || !size || !gender || !location) {
    console.log("Missing required fields:", { breed, size, gender, location });
    return res
      .status(400)
      .json({ message: "All fields except details are required!" });
  }

  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      console.log("No token provided");
      return res.status(401).json({ message: "No token provided!" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded Token:", decoded);
    const userId = decoded.userId;

    //const fewMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const fewMinutesAgo = new Date(Date.now() - 2 * 60 * 1000); //2 minutes
    const recentSubmission = await FoundDog.findOne({
      userId,
      createdAt: { $gte: fewMinutesAgo },
    });
    if (recentSubmission) {
      console.log("Recent submission detected:", recentSubmission);
      return res
        .status(429)
        .json({
          message: "Please wait a minute before submitting another found dog report.",
        });
    }

    const petIdCounter = await PetIdCounter.findOneAndUpdate(
      {},
      { $inc: { nextPetId: 1 } },
      { new: true, upsert: true }
    );
    const petId = petIdCounter.nextPetId;

    let imagePath = null;
    if (req.files && req.files.dogImage) {
      const file = req.files.dogImage;
      console.log("File Details:", {
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
      });

      const validImageTypes = ["image/png", "image/jpeg", "image/jpg"];
      if (!validImageTypes.includes(file.mimetype)) {
        console.log("Invalid file type:", file.mimetype);
        return res.status(400).json({
          message: "Invalid file type. Only PNG, JPEG, and JPG are allowed.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        console.log("File size too large:", file.size);
        return res
          .status(400)
          .json({ message: "File size exceeds 10MB limit." });
      }

      let fileExtension = "jpg";
      if (file.mimetype === "image/png") {
        fileExtension = "png";
      } else if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
        fileExtension = "jpg";
      }

      const filename = `${Date.now()}.${fileExtension}`;
      imagePath = `/uploads/foundDogs/${filename}`;
      const fullPath = path.join(foundDogsDir, filename);

      console.log("Attempting to save image to:", fullPath);
      await file.mv(fullPath);
      console.log("Image successfully saved to:", fullPath);
    } else {
      console.log("No dogImage file received in req.files. Proceeding without image.");
    }

    const foundDogProfile = new FoundDog({
      petId,
      breed,
      size,
      gender,
      location,
      details: details || undefined,
      imagePath: imagePath || undefined,
      userId,
      isNew: true,
      postType: "found",
      reunited: false,
      category: "Found",
      archived: false,
    });

    const savedFoundDog = await foundDogProfile.save();
    console.log("Saved Found Dog:", savedFoundDog);

    req.io.emit("newFoundDog", savedFoundDog);

    res.status(201).json({
      message: "Found dog profile created successfully!",
      foundDog: savedFoundDog,
      imageStatus: imagePath ? "Image uploaded successfully" : "No image uploaded",
    });
  } catch (error) {
    console.error("Error saving found dog profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Fetch All Lost Dogs Route
router.get("/lostdog", async (req, res) => {
  try {
    const lostDogs = await LostDog.find().populate("userId", "fullName").exec();
    res.status(200).json({ lostDogs });
  } catch (error) {
    console.error("Error fetching lost dogs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch All Found Dogs Route
router.get("/founddog", async (req, res) => {
  try {
    const foundDogs = await FoundDog.find()
      .populate("userId", "fullName contact address") //
      .exec();
    res.status(200).json({ foundDogs });
  } catch (error) {
    console.error("Error fetching found dogs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Both Lost and Found Dogs Route
router.delete("/delete-match", async (req, res) => {
  const { petId1, petId2 } = req.body; // petId1 is for lost dog, petId2 for found dog
  try {
    const deletedLostDog = await LostDog.findOneAndDelete({ petId: petId1 });
    const deletedFoundDog = await FoundDog.findOneAndDelete({ petId: petId2 });

    if (!deletedLostDog || !deletedFoundDog) {
      return res.status(404).json({ message: "One or both dogs not found" });
    }

    if (deletedLostDog.imagePath) {
      const lostDogImagePath = path.join(__dirname, "../../uploads", deletedLostDog.imagePath);
      if (fs.existsSync(lostDogImagePath)) {
        fs.unlinkSync(lostDogImagePath);
        console.log("Deleted lost dog image:", lostDogImagePath);
      }
    }

    if (deletedFoundDog.imagePath) {
      const foundDogImagePath = path.join(__dirname, "../../uploads", deletedFoundDog.imagePath);
      if (fs.existsSync(foundDogImagePath)) {
        fs.unlinkSync(foundDogImagePath);
        console.log("Deleted found dog image:", foundDogImagePath);
      }
    }

    const stats = await Stats.findOne();
    if (stats && stats.reunitedCount > 0) {
      stats.reunitedCount -= 1;
      await stats.save();
    }

    req.io.emit("matchDeleted", { petId1, petId2 });

    res.status(200).json({ message: "Both dogs have been deleted successfully!" });
  } catch (error) {
    console.error("Error deleting dogs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Mark a Dog as Reunited
router.put("/mark-reunited/:petId", async (req, res) => {
  const { petId } = req.params;
  try {
    const foundDog = await FoundDog.findOne({ petId });
    const lostDog = await LostDog.findOne({ petId });

    if (foundDog) {
      if (foundDog.reunited) {
        return res.status(400).json({ message: "This dog is already marked as reunited" });
      }
      foundDog.reunited = true;
      await foundDog.save();
      console.log("Marked found dog as reunited:", foundDog);
    } else if (lostDog) {
      if (lostDog.reunited) {
        return res.status(400).json({ message: "This dog is already marked as reunited" });
      }
      lostDog.reunited = true;
      await lostDog.save();
      console.log("Marked lost dog as reunited:", lostDog);
    } else {
      return res.status(404).json({ message: "Dog not found!" });
    }

    const stats = await Stats.findOne();
    if (stats) {
      stats.reunitedCount += 1;
      await stats.save();
    } else {
      const newStats = new Stats({ reunitedCount: 1 });
      await newStats.save();
    }

    req.io.emit("dogReunited", { petId });

    res.status(200).json({ message: "Dog has been marked as reunited!" });
  } catch (error) {
    console.error("Error marking dog as reunited:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch All Reunited Dogs Route
router.get("/all-reunited-dogs", async (req, res) => {
  try {
    const reunitedLostDogs = await LostDog.find({ reunited: true })
      .populate("userId", "fullName contact")
      .exec();
    const reunitedFoundDogs = await FoundDog.find({ reunited: true })
      .populate("userId", "fullName contact")
      .exec();
    const reunitedDogs = [...reunitedLostDogs, ...reunitedFoundDogs];
    console.log("Fetched reunited dogs:", reunitedDogs.length);
    res.status(200).json(reunitedDogs);
  } catch (error) {
    console.error("Error fetching reunited dogs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Matched PetId for a Given Dog _id
router.get("/get-matched-petid/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const lostDog = await LostDog.findById(id);
    const foundDog = await FoundDog.findById(id);

    if (lostDog && lostDog.reunited) {
      const matchedFoundDog = await FoundDog.findOne({ reunited: true });
      if (matchedFoundDog) {
        return res.status(200).json({
          petId: lostDog.petId,
          matchedPetId: matchedFoundDog.petId,
          type: "lost",
        });
      }
    } else if (foundDog && foundDog.reunited) {
      const matchedLostDog = await LostDog.findOne({ reunited: true });
      if (matchedLostDog) {
        return res.status(200).json({
          petId: foundDog.petId,
          matchedPetId: matchedLostDog.petId,
          type: "found",
        });
      }
    }

    res.status(404).json({ message: "No matched dog found" });
  } catch (error) {
    console.error("Error fetching matched petId:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update Lost Dog
router.put("/lostdog/:petId", async (req, res) => {
  const { petId } = req.params;
  const { name, breed, gender, location } = req.body;

  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided!" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const lostDog = await LostDog.findOne({ petId, userId });
    if (!lostDog)
      return res.status(404).json({ message: "Lost dog not found or not authorized!" });

    lostDog.name = name || lostDog.name;
    lostDog.breed = breed || lostDog.breed;
    lostDog.gender = gender || lostDog.gender;
    lostDog.location = location || lostDog.location;

    if (req.files && req.files.dogImage) {
      const file = req.files.dogImage;
      const validImageTypes = ["image/png", "image/jpeg", "image/jpg"];
      if (!validImageTypes.includes(file.mimetype)) {
        return res.status(400).json({
          message: "Invalid file type. Only PNG, JPEG, and JPG are allowed.",
        });
      }
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File size exceeds 10MB limit." });
      }

      if (lostDog.imagePath) {
        const oldImagePath = path.join(__dirname, "../../uploads", lostDog.imagePath);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }

      const filename = `${Date.now()}-${file.name}`;
      const imagePath = `/uploads/lostDogs/${filename}`;
      const fullPath = path.join(lostDogsDir, filename);
      await file.mv(fullPath);
      lostDog.imagePath = imagePath;
    }

    const updatedLostDog = await lostDog.save();
    req.io.emit("updatedLostDog", updatedLostDog);

    res.status(200).json(updatedLostDog);
  } catch (error) {
    console.error("Error updating lost dog:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update Found Dog
router.put("/founddog/:petId", async (req, res) => {
  const { petId } = req.params;
  console.log("Received PUT request for founddog with petId:", petId);
  const { breed, gender, location } = req.body;

  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided!" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const foundDog = await FoundDog.findOne({ petId, userId });
    if (!foundDog) {
      console.log("Found dog not found or unauthorized for petId:", petId);
      return res.status(404).json({ message: "Found dog not found or not authorized!" });
    }

    foundDog.breed = breed || foundDog.breed;
    foundDog.gender = gender || foundDog.gender;
    foundDog.location = location || foundDog.location;

    if (req.files && req.files.dogImage) {
      const file = req.files.dogImage;
      const validImageTypes = ["image/png", "image/jpeg", "image/jpg"];
      if (!validImageTypes.includes(file.mimetype)) {
        return res.status(400).json({
          message: "Invalid file type. Only PNG, JPEG, and JPG are allowed.",
        });
      }
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File size exceeds 10MB limit." });
      }

      if (foundDog.imagePath) {
        const oldImagePath = path.join(__dirname, "../../uploads", foundDog.imagePath);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }

      const filename = `${Date.now()}-${file.name}`;
      const imagePath = `/uploads/foundDogs/${filename}`;
      const fullPath = path.join(foundDogsDir, filename);
      await file.mv(fullPath);
      foundDog.imagePath = imagePath;
    }

    const updatedFoundDog = await foundDog.save();
    req.io.emit("updatedFoundDog", updatedFoundDog);

    res.status(200).json(updatedFoundDog);
  } catch (error) {
    console.error("Error updating found dog:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Stats Route
router.get("/stats", async (req, res) => {
  try {
    const stats = await Stats.findOne();
    if (!stats) {
      return res.status(200).json({
        lostDogsCount: 0,
        foundDogsCount: 0,
        reunitedCount: 0,
      });
    }
    res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;