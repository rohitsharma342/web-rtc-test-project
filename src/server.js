const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your frontend URL
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store connected users
const connectedUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user joining
  socket.on('join', (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', {
        offer: data.offer,
        from: data.from
      });
    }
  });

  socket.on('answer', (data) => {
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', {
        answer: data.answer,
        from: data.from
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate: data.candidate,
        from: data.from
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    let disconnectedUserId;
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }
    if (disconnectedUserId) {
      connectedUsers.delete(disconnectedUserId);
      console.log(`User ${disconnectedUserId} disconnected`);
    }
  });
});
app.use(express.static("dist"));

// show admin panel 
app.get("/*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});
// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 