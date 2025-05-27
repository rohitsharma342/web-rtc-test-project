// App.jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import styled from 'styled-components';

/* ─────────────────────────────────────────────────────────────────────────────
   Styled components for layout—no changes needed here if you already have them
─────────────────────────────────────────────────────────────────────────────*/
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
  background-color: ${(props) => (props.primary ? '#007bff' : '#6c757d')};
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

/* ─────────────────────────────────────────────────────────────────────────────
   App component starts here
─────────────────────────────────────────────────────────────────────────────*/
function App() {
  // ─── State & refs ─────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const [connectionStatus, setConnectionStatus] = useState('');

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef();
  const socketRef = useRef();
  const peerUserIdRef = useRef(''); 
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    /* ─ Step 1: Initialize Socket.IO and listeners ───────────────────────────── */
    socketRef.current = io('https://web-rtc-test-project.onrender.com', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
      socketRef.current.emit('join', userId);
      setConnectionStatus('Connected to signaling server');
    });

    socketRef.current.on('joined', (data) => {
      console.log('Successfully joined:', data);
      setConnectionStatus('Ready to make calls');
    });

    socketRef.current.on('error', (error) => {
      console.error('Signaling error:', error);
      setConnectionStatus('Error: ' + error.message);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus('Connection error: ' + error.message);
    });

    // Listen for incoming offer / answer / ICE
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    /* ────────────────────────────────────────────────────────────────────────── */

    /* ─ Step 2: Grab local media right away ──────────────────────────────────── */
    initializeLocalStream();

    return () => {
      // Cleanup on unmount
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socketRef.current.disconnect();
    };
    // We deliberately leave out peerConnectionRef and all listener fns from dependency list
    // so that the initial setup runs once. localStream will update in initializeLocalStream().
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────────
     initializeLocalStream:
     Fetches getUserMedia, displays it in the local <video>, and stores it in state.
  ──────────────────────────────────────────────────────────────────────────────*/
  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      console.log(
        'Local stream initialized with tracks:',
        stream.getTracks().map((t) => t.kind)
      );
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionStatus('Error accessing camera/microphone: ' + error.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     createPeerConnection:
     - Closes any existing RTCPeerConnection
     - Creates a new one with STUN servers
     - Hooks up onicecandidate, onconnectionstatechange, and ontrack 
     (no more onnegotiationneeded here).
  ──────────────────────────────────────────────────────────────────────────────*/
  const createPeerConnection = () => {
    if (peerConnectionRef.current) {
      console.log('Closing existing peer connection');
      peerConnectionRef.current.close();
    }

    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };

    const pc = new RTCPeerConnection(configuration);

    // Add our local tracks into this new RTCPeerConnection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        console.log('Adding track to peer connection:', track.kind);
        pc.addTrack(track, localStream);
      });
    }

    // ─── ICE candidates → send to the other peer ───────────────────────────────
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        // Always send ICE to peerUserIdRef.current if available; otherwise fallback to state
        const trueTarget = peerUserIdRef.current || targetUserId;
        socketRef.current.emit('ice-candidate', {
          target: trueTarget,
          from: userId,
          candidate: event.candidate,
        });
      }
    };

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
      setConnectionStatus('ICE Connection: ' + pc.iceConnectionState);
    };

    // Monitor overall peerConnection state
    pc.onconnectionstatechange = () => {
      console.log('Connection State:', pc.connectionState);
      setConnectionStatus('Connection: ' + pc.connectionState);
    };

    // ─── The crucial ontrack handler ───────────────────────────────────────────
    // When remote track(s) arrive, attach to the <video> tag.
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);

      let incomingStream;
      if (event.streams && event.streams[0]) {
        // Browser gave us a full MediaStream
        incomingStream = event.streams[0];
      } else {
        // Some browsers do NOT populate event.streams[0] on the first track
        console.log('No event.streams[0], creating a new MediaStream');
        incomingStream = new MediaStream();
        incomingStream.addTrack(event.track);
      }

      console.log(
        'Attaching remote stream with tracks:',
        incomingStream.getTracks().map((t) => t.kind)
      );
      setRemoteStream(incomingStream);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = incomingStream;
        remoteVideoRef.current.onloadedmetadata = () => {
          console.log('Remote video metadata loaded');
          remoteVideoRef.current
            .play()
            .catch((error) => console.error('Error playing remote video:', error));
        };
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     startCall (caller flow)
     1) Create a new PeerConnection
     2) Create an offer, set it as localDescription
     3) PUSH that offer to the callee's socket ID (peerUserIdRef.current)
     4) Mark isCallActive = true so UI switches to “End Call”
  ──────────────────────────────────────────────────────────────────────────────*/
  const startCall = async () => {
    if (!targetUserId) {
      setConnectionStatus('Please enter a target user ID');
      return;
    }

    try {
      // 1) Create PeerConnection (adds local tracks and sets up handlers)
      const pc = createPeerConnection();

      // 2) Make an offer
      console.log('Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      // 3) Write callee’s ID into the ref and send the offer
      peerUserIdRef.current = targetUserId;
      console.log('Sending offer to:', peerUserIdRef.current);
      socketRef.current.emit('offer', {
        target: peerUserIdRef.current,
        from: userId,
        offer: pc.localDescription,
      });

      setIsCallActive(true);
      setConnectionStatus('Call initiated...');
    } catch (error) {
      console.error('Error starting call:', error);
      setConnectionStatus('Error starting call: ' + error.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     handleOffer (callee flow)
     1) As soon as we see data.from, store it in peerUserIdRef.current
     2) Create a new PeerConnection
     3) setRemoteDescription(offer)
     4) createAnswer(), setLocalDescription(answer)
     5) send that answer back to data.from (which is in peerUserIdRef.current)
  ──────────────────────────────────────────────────────────────────────────────*/
  const handleOffer = async (data) => {
    console.log('Received offer from:', data.from);
    // 1) Remember caller’s ID so ICE goes back there
    peerUserIdRef.current = data.from;

    try {
      // 2) Create a fresh RTCPeerConnection (adds local tracks, sets up ontrack)
      const pc = createPeerConnection();

      // 3) Set their offer as our remote description
      console.log('Setting remote description...');
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      // 4) Create and send back an answer
      console.log('Creating answer...');
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(answer);

      console.log('Sending answer to:', peerUserIdRef.current);
      socketRef.current.emit('answer', {
        target: peerUserIdRef.current,
        from: userId,
        answer: pc.localDescription,
      });

      setIsCallActive(true);
      setConnectionStatus('Call connected…');
    } catch (error) {
      console.error('Error handling offer:', error);
      setConnectionStatus('Error handling offer: ' + error.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     handleAnswer (caller receives callee’s answer)
     1) Simply setRemoteDescription(answer)
     2) Our ontrack from earlier (in createPeerConnection) will fire when RTP starts.
  ──────────────────────────────────────────────────────────────────────────────*/
  const handleAnswer = async (data) => {
    console.log('Received answer from:', data.from);
    try {
      if (!peerConnectionRef.current) {
        throw new Error('No peer connection exists');
      }
      console.log('Setting remote description with answer…');
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      // As soon as remoteDescription is set, the ICE handshake should finish,
      // and ontrack() will fire to attach the remote stream. No extra code needed.
      setConnectionStatus('Call connected…');
    } catch (error) {
      console.error('Error handling answer:', error);
      setConnectionStatus('Error handling answer: ' + error.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     handleIceCandidate (both sides)
     Just add new ICE candidates to the existing RTCPeerConnection.
  ──────────────────────────────────────────────────────────────────────────────*/
  const handleIceCandidate = async (data) => {
    console.log('Received ICE candidate from:', data.from);
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
      setConnectionStatus('Error handling ICE candidate: ' + error.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     endCall (either side clicks “End Call”)
     - Close peerConnection (stops all RTC activity)
     - Clear remoteStream so <video> goes blank
     - Mark isCallActive=false to show “Start Call” again
  ──────────────────────────────────────────────────────────────────────────────*/
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setRemoteStream(null);
    setIsCallActive(false);
    setConnectionStatus('Call ended');
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     Render UI
  ──────────────────────────────────────────────────────────────────────────────*/
  return (
    <Container>
      <h1>WebRTC Video Call</h1>
      <p>Your ID: {userId}</p>
      <p>Status: {connectionStatus}</p>

      <VideoContainer>
        <div>
          <h3>Local Video</h3>
          <Video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
        <div>
          <h3>Remote Video</h3>
          <Video
   ref={remoteVideoRef}
   autoPlay 
   playsInline 
  //  muted      // ← allow autoplay by muting 
   style={{ backgroundColor: '#000' }} 
 />
          {!remoteStream && isCallActive && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: 'white',
              }}
            >
              Waiting for remote video…
            </div>
          )}
        </div>
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
          <Button onClick={endCall}>End Call</Button>
        )}
      </Controls>
    </Container>
  );
}

export default App;
