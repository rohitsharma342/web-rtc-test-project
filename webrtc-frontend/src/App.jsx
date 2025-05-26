import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  height: 100vh;
  background-color: #f0f2f5;
`;

const VideoContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1200px;
  margin: 20px 0;
`;

const Video = styled.video`
  width: 100%;
  max-width: 400px;
  border-radius: 8px;
  background-color: #000;
`;

const Controls = styled.div`
  display: flex;
  gap: 10px;
  margin: 20px 0;
`;

const Button = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  background-color: ${props => props.primary ? '#007bff' : '#6c757d'};
  color: white;
  cursor: pointer;
  &:hover {
    opacity: 0.9;
  }
`;

const Input = styled.input`
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  margin-right: 10px;
`;

function App() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef();
  const socketRef = useRef();

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('https://web-rtc-test-project.onrender.com');

    // Socket event listeners
    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
      socketRef.current.emit('join', userId);
    });

    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);

    // Initialize local stream
    initializeLocalStream();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socketRef.current.disconnect();
    };
  }, []);

  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          target: targetUserId,
          from: userId,
          candidate: event.candidate
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
  };

  const startCall = async () => {
    if (!targetUserId) return;

    createPeerConnection();
    const pc = peerConnectionRef.current;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current.emit('offer', {
        target: targetUserId,
        from: userId,
        offer: offer
      });

      setIsCallActive(true);
    } catch (error) {
      console.error('Error starting call:', error);
    }
  };

  const handleOffer = async (data) => {
    if (!peerConnectionRef.current) {
      createPeerConnection();
    }

    const pc = peerConnectionRef.current;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit('answer', {
        target: data.from,
        from: userId,
        answer: answer
      });

      setIsCallActive(true);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (data) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setRemoteStream(null);
    setIsCallActive(false);
  };

  return (
    <Container>
      <h1>WebRTC Video Call</h1>
      <p>Your ID: {userId}</p>
      
      <VideoContainer>
        <Video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
        />
        {remoteStream && (
          <Video
            ref={remoteVideoRef}
            autoPlay
            playsInline
          />
        )}
      </VideoContainer>

      <Controls>
        <Input
          type="text"
          placeholder="Enter target user ID"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          disabled={isCallActive}
        />
        {!isCallActive ? (
          <Button primary onClick={startCall}>
            Start Call
          </Button>
        ) : (
          <Button onClick={endCall}>
            End Call
          </Button>
        )}
      </Controls>
    </Container>
  );
}

export default App;
