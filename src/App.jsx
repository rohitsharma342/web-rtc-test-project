import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SOCKET_URL = 'http://localhost:3000';

function App() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const [userId, setUserId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [error, setError] = useState('');

  const socketRef = useRef();
  const peerConnectionRef = useRef();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pendingIceCandidatesRef = useRef([]);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    // Socket event listeners
    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current.id);
      setStatus('connected');
    });

    socketRef.current.on('disconnect', () => {
      console.log('Socket disconnected');
      setStatus('disconnected');
      setIsCallActive(false);
    });

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error);
      setError(error.message);
    });

    socketRef.current.on('joined', (data) => {
      console.log('Joined successfully:', data);
      setUserId(data.userId);
    });

    socketRef.current.on('offer', async (data) => {
      console.log('Received offer:', data);
      try {
        await handleIncomingCall(data);
      } catch (err) {
        console.error('Error handling incoming call:', err);
        setError('Failed to handle incoming call');
      }
    });

    socketRef.current.on('answer', async (data) => {
      console.log('Received answer:', data);
      try {
        await handleAnswer(data);
      } catch (err) {
        console.error('Error handling answer:', err);
        setError('Failed to handle answer');
      }
    });

    socketRef.current.on('ice-candidate', async (data) => {
      console.log('Received ICE candidate:', data);
      try {
        await handleIceCandidate(data);
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
        setError('Failed to handle ICE candidate');
      }
    });

    // Add call-ended event listener
    socketRef.current.on('call-ended', (data) => {
      console.log('Call ended by remote peer:', data);
      handleRemoteCallEnd();
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      console.log('Local media initialized successfully');
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera and microphone');
    }
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);
    console.log('Created new peer connection');

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          from: userId,
          target: targetUserId
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      setStatus(pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsCallActive(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsCallActive(false);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding local track to peer connection:', track.kind);
        pc.addTrack(track, localStream);
      });
    }

    return pc;
  };

  const handleIncomingCall = async (data) => {
    try {
      if (!localStream) {
        await initializeMedia();
      }

      peerConnectionRef.current = createPeerConnection();
      
      // Add any pending ICE candidates
      pendingIceCandidatesRef.current.forEach(candidate => {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingIceCandidatesRef.current = [];

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        answer,
        from: userId,
        target: data.from
      });
      
      setStatus('connected');
      setIsCallActive(true);
    } catch (err) {
      console.error('Error handling incoming call:', err);
      setError('Failed to handle incoming call');
    }
  };

  const handleAnswer = async (data) => {
    try {
      if (!peerConnectionRef.current) {
        throw new Error('No peer connection exists');
      }

      // Add any pending ICE candidates
      pendingIceCandidatesRef.current.forEach(candidate => {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingIceCandidatesRef.current = [];

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      setStatus('connected');
      setIsCallActive(true);
    } catch (err) {
      console.error('Error handling answer:', err);
      setError('Failed to handle answer');
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      if (!peerConnectionRef.current) {
        console.log('Storing ICE candidate for later');
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
      setError('Failed to handle ICE candidate');
    }
  };

  const startCall = async () => {
    try {
      if (!targetUserId) {
        setError('Please enter a target user ID');
        return;
      }

      if (!localStream) {
        await initializeMedia();
      }

      peerConnectionRef.current = createPeerConnection();
      const offer = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current.emit('offer', {
        offer,
        from: userId,
        target: targetUserId
      });

      setStatus('calling');
    } catch (err) {
      console.error('Error starting call:', err);
      setError('Failed to start call');
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsCallActive(false);
    setStatus('disconnected');
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    pendingIceCandidatesRef.current = [];

    // Notify the other peer that the call has ended
    if (targetUserId) {
      socketRef.current.emit('call-ended', {
        from: userId,
        target: targetUserId
      });
    }
  };

  // Add new function to handle remote call end
  const handleRemoteCallEnd = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsCallActive(false);
    setStatus('disconnected');
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    pendingIceCandidatesRef.current = [];
    setError('Call ended by remote peer');
  };

  const joinRoom = () => {
    if (!userId) {
      setError('Please enter a user ID');
      return;
    }
    socketRef.current.emit('join', userId);
    initializeMedia();
  };

  return (
    <div className="app">
      <h1>WebRTC Video Call</h1>
      
      <div className="controls">
        <input
          type="text"
          placeholder="Your User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={isCallActive}
        />
        <button onClick={joinRoom} disabled={isCallActive}>
          Join Room
        </button>
        
        <input
          type="text"
          placeholder="Target User ID"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          disabled={isCallActive}
        />
        <button onClick={startCall} disabled={isCallActive || !userId || !targetUserId}>
          Start Call
        </button>
        <button onClick={endCall} disabled={!isCallActive}>
          End Call
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="status">Status: {status}</div>

      <div className="videos">
        <div className="video-container">
          <h3>Local Video</h3>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video"
          />
        </div>
        <div className="video-container">
          <h3>Remote Video</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="video"
          />
        </div>
      </div>
    </div>
  );
}

export default App; 