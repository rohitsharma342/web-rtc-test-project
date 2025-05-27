const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your frontend URL
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
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
    console.log('Current connected users:', Array.from(connectedUsers.entries()));
    
    // Notify the user that they've successfully joined
    socket.emit('joined', { userId, socketId: socket.id });
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    console.log('Received offer from:', data.from, 'to:', data.target);
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      console.log('Forwarding offer to:', targetSocketId);
      io.to(targetSocketId).emit('offer', {
        offer: data.offer,
        from: data.from
      });
    } else {
      console.log('Target user not found:', data.target);
      socket.emit('error', { message: 'Target user not found' });
    }
  });

  socket.on('answer', (data) => {
    console.log('Received answer from:', data.from, 'to:', data.target);
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      console.log('Forwarding answer to:', targetSocketId);
      io.to(targetSocketId).emit('answer', {
        answer: data.answer,
        from: data.from
      });
    } else {
      console.log('Target user not found:', data.target);
      socket.emit('error', { message: 'Target user not found' });
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('Received ICE candidate from:', data.from, 'to:', data.target);
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      console.log('Forwarding ICE candidate to:', targetSocketId);
      io.to(targetSocketId).emit('ice-candidate', {
        candidate: data.candidate,
        from: data.from
      });
    } else {
      console.log('Target user not found:', data.target);
      socket.emit('error', { message: 'Target user not found' });
    }
  });

  // Add call-ended event handler
  socket.on('call-ended', (data) => {
    console.log('Call ended by:', data.from, 'to:', data.target);
    const targetSocketId = connectedUsers.get(data.target);
    if (targetSocketId) {
      console.log('Notifying target about call end:', targetSocketId);
      io.to(targetSocketId).emit('call-ended', {
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
      console.log('Remaining connected users:', Array.from(connectedUsers.entries()));
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
  res.json({ 
    status: 'ok',
    connectedUsers: Array.from(connectedUsers.entries())
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 