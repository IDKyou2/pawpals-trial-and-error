const express = require("express");
const mongoose = require("mongoose");

const dotenv = require("dotenv");
dotenv.config();

const userRoutes = require("./routes/userRoutes");                    // api/auth
const postRoutes = require("./routes/postRoutes");                    // api/posts
const loginRoutes = require("./routes/loginRoutes");                  // api/login
const registerRoutes = require("./routes/registerRoutes");            // api/register
const lostDogRoutes = require("./routes/lostDogRoutes");              // api
const foundDogRoutes = require("./routes/foundDogRoutes");            // api
const unclaimedDogRoutes = require("./routes/unclaimedDogRoutes");    // api
const matchPageRoutes = require("./routes/matchPageRoutes");          // api/lostfound
const chatRoutes = require("./routes/chatRoutes");                    //api/chat
const suggestionRoutes = require("./routes/suggestionRoutes");        // api


const Chat = require("./models/Chat");
const PrivateChat = require("./models/PrivateChat");
const User = require("./models/User");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http = require("http");
const { Server } = require("socket.io");
const tf = require("@tensorflow/tfjs-node");
const mobilenet = require("@tensorflow-models/mobilenet");


const allowedOrigins = [
  "http://192.168.1.2:3000",
  "http://192.168.1.2:8081",
  "http://192.168.1.2:8080",
  "http://192.168.1.2:5000",
  "http://localhost:8081", // For local development
];


const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};


const app = express();
app.use(cors(corsOptions));

app.use(express.json());
app.use(fileUpload());


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin:
      allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },

  pingTimeout: 30000, //default 60000
  pingInterval: 10000, //default 25000
  transports: ["websocket", "polling"],
},
  //console.log("Check allowed origins:", allowedOrigins)
);


// Initialize MobileNet model globally
let mobilenetModel;
async function startMobilenet() {
  try {
    console.log("Loading MobileNet model...");
    mobilenetModel = await mobilenet.load();
    console.log("MobileNet model loaded successfully.");
  } catch (error) {
    console.error("Error loading MobileNet model:", error);
  }
}
startMobilenet();

// Pass the model and io to routes
app.use((req, res, next) => {
  req.io = io;
  req.mobilenetModel = mobilenetModel;
  next();
});

const uploadsDir = path.join(__dirname, "../uploads");
const picturesDir = path.join(__dirname, "../uploads/pictures");
app.use("/uploads", express.static(uploadsDir), (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(picturesDir)) {
  fs.mkdirSync(picturesDir, { recursive: true });
}

app.use(
  "/proxy/kaggle",
  createProxyMiddleware({
    target: "https://www.kaggle.com",
    changeOrigin: true,
    pathRewrite: { "^/proxy/kaggle": "" },
    onProxyRes: (proxyRes) => {
      proxyRes.headers["Access-Control-Allow-Origin"] = "*";
      proxyRes.headers["Access-Control-Allow-Methods"] =
        "GET, POST, PUT, DELETE";
      proxyRes.headers["Access-Control-Allow-Headers"] =
        "Content-Type, Authorization";
    },
  })
);
//console.log("Mongo URI:", process.env.MONGO_URI);
//console.log("BASE_URL:", process.env.BASE_URL);

if (!process.env.MONGO_URI || process.env.MONGO_URI.trim() === "") {
  console.error("Error: MONGO_URI is not found in .env file");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI) // Connect to MongoDB
  .then(() => console.log("Connected to MongoDB (Port 5000)."))
  .catch((err) => console.log("MongoDB connection error:", err));

app.use("/api/auth", userRoutes); // 
app.use("/api/posts", postRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/register", registerRoutes);
app.use("/api", lostDogRoutes);
app.use("/api", foundDogRoutes);
app.use("/api", unclaimedDogRoutes);
app.use("/api/lostfound", matchPageRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api", suggestionRoutes);

io.on("connection", (socket) => {
  console.log("A user connected to 5000:", socket.id);
  socket.on("send_forum_message", async (messageData) => {
    console.log("Received forum message on 5000:", messageData);
    try {
      const newMessage = new Chat({
        from: messageData.from,
        text: messageData.text,
        timestamp: messageData.timestamp,
      });
      await newMessage.save();
      console.log("Forum message saved on 5000:", newMessage);
      const allMessages = await Chat.find().sort({ createdAt: 1 });
      const messagesWithProfilePics = await Promise.all(
        allMessages.map(async (msg) => {
          const user = await User.findOne({ fullName: msg.from });
          return {
            ...msg._doc,
            profilePic: user
              ? user.profilePic
                ? `/uploads/pictures/${path.basename(user.profilePic)}`
                : "/uploads/default-user.png"
              : "/uploads/default-user.png",
          };
        })
      );
      const messageCount = await Chat.countDocuments();
      console.log(
        "Broadcasting forum messages from 5000:",
        messagesWithProfilePics.length,
        "Count:",
        messageCount
      );
      io.emit("receive_forum_message", {
        messages: messagesWithProfilePics,
        count: messageCount,
      });
    } catch (err) {
      console.error("Error saving forum message on 5000:", err);
      socket.emit("message_error", { error: "Failed to save forum message" });
    }
  });

  // Your existing private message handler
  socket.on("send_private_message", async (messageData) => {
    console.log("Received private message on 5000:", messageData);
    try {
      const newMessage = new PrivateChat({
        from: messageData.from,
        to: messageData.to,
        text: messageData.text,
        timestamp: messageData.timestamp,
      });
      await newMessage.save();
      console.log("Private message saved on 5000:", newMessage);

      const user = await User.findOne({ fullName: newMessage.from });
      const messageWithProfilePic = {
        ...newMessage._doc,
        profilePic: user
          ? user.profilePic
            ? `/uploads/pictures/${path.basename(user.profilePic)}`
            : "/uploads/default-user.png"
          : "/uploads/default-user.png",
      };

      console.log(
        "Broadcasting single private message from 5000 to",
        `${messageData.from}_${messageData.to} and ${messageData.to}_${messageData.from}`
      );
      io.emit(
        `private_message_${messageData.from}_${messageData.to}`,
        messageWithProfilePic
      );
      io.emit(
        `private_message_${messageData.to}_${messageData.from}`,
        messageWithProfilePic
      );
    } catch (err) {
      console.error("Error saving private message on 5000:", err);
      socket.emit("message_error", { error: "Failed to save private message" });
    }
  });

  // Additional handlers for chat functionality
  socket.on("joinChat", async ({ chatId, userId }) => {
    socket.join(chatId);
    console.log(`User ${userId} joined chat ${chatId}`);

    try {
      const chat = await Chat.findById(chatId);
      if (chat && !chat.participants.includes(userId)) {
        chat.participants.push(userId);
        await chat.save();
      }
    } catch (error) {
      console.error("Error joining chat:", error);
    }
  });

  socket.on("sendMessage", async ({ chatId, userId, message }) => {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        console.error("Chat not found:", chatId);
        return;
      }

      const newMessage = {
        sender: userId,
        content: message,
        timestamp: new Date(),
      };

      chat.messages.push(newMessage);
      await chat.save();

      io.to(chatId).emit("newMessage", {
        chatId,
        message: newMessage,
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  socket.on("sendPrivateMessage", async ({ privateChatId, userId, message }) => {
    try {
      const privateChat = await PrivateChat.findById(privateChatId);
      if (!privateChat) {
        console.error("Private chat not found:", privateChatId);
        return;
      }

      const newMessage = {
        sender: userId,
        content: message,
        timestamp: new Date(),
      };

      privateChat.messages.push(newMessage);
      await privateChat.save();

      io.to(privateChatId).emit("newPrivateMessage", {
        privateChatId,
        message: newMessage,
      });
    } catch (error) {
      console.error("Error sending private message:", error);
    }
  });

  socket.on("joinPrivateChat", async ({ privateChatId, userId }) => {
    socket.join(privateChatId);
    console.log(`User ${userId} joined private chat ${privateChatId}`);
  });

  socket.on("disconnect", (reason) => {
    console.log("User disconnected from 5000:", socket.id, "Reason:", reason);
  });

  socket.on("error", (error) => {
    console.error("Socket error on 5000:", error);
  });
});

server.listen(5000, '0.0.0.0', () => {
  console.log("Mobile Server is running on port 5000");
});

app.get("/api/ping", (req, res) => {
  console.log("Received /api/ping request");
  res.json({ message: "pong" });
});


const os = require('os');
const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach((iface) => {
  interfaces[iface].forEach((details) => {
    if (details.family === 'IPv4' && !details.internal) {
      console.log(`Server might be reachable at: http://${details.address}:5000`);
    }
  });
});
