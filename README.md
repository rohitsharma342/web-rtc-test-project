# WebRTC Backend

This is a Node.js backend server that handles WebRTC signaling for audio and video calls.

## Features

- WebRTC signaling server using Socket.IO
- User connection management
- Support for audio and video calls
- CORS enabled for frontend integration

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:
```
PORT=3000
NODE_ENV=development
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint

## WebSocket Events

The server handles the following WebSocket events:

- `join` - When a user joins the system
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - ICE candidate exchange

## Frontend Integration

To connect to this signaling server from your frontend:

```javascript
const socket = io('http://localhost:3000');

// Join the system
socket.emit('join', userId);

// Listen for offers
socket.on('offer', (data) => {
  // Handle incoming offer
});

// Send offer
socket.emit('offer', {
  target: targetUserId,
  from: currentUserId,
  offer: offer
});

// Listen for answers
socket.on('answer', (data) => {
  // Handle incoming answer
});

// Send answer
socket.emit('answer', {
  target: targetUserId,
  from: currentUserId,
  answer: answer
});

// Handle ICE candidates
socket.on('ice-candidate', (data) => {
  // Handle incoming ICE candidate
});

socket.emit('ice-candidate', {
  target: targetUserId,
  from: currentUserId,
  candidate: candidate
});
``` 