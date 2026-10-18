import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Disc,
  Shield,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { CallingService } from '../services/callingService';
import { ChatService } from '../services/chatService';
import { ringtoneService } from '../services/ringtoneService';
import { CallAudioRecorder } from '../services/callAudioRecorder';
import {
  CallRecord,
  CallStatus,
  CallSignal,
} from '../types/calling';
import { UserProfile } from '../types';
import { RecordingGuidelinesModal } from '../components/RecordingGuidelinesModal';

interface CallingContextType {
  activeCall: CallRecord | null;
  callState: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
  isMuted: boolean;
  isSpeaker: boolean;
  isPersonalRecording: boolean;
  isAdminRecordingActive: boolean;
  isReconnecting: boolean;
  callDuration: number;
  startCall: (targetUser: UserProfile, conversationId?: string) => Promise<boolean>;
  answerCall: (consentAdminRecording: boolean) => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  togglePersonalRecording: () => void;
  isCallSupported: boolean;
}

const CallingContext = createContext<CallingContextType | undefined>(undefined);

export const CallingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [callState, setCallState] = useState<
    'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'
  >('idle');
  const [otherParticipant, setOtherParticipant] = useState<UserProfile | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isPersonalRecording, setIsPersonalRecording] = useState(true);
  const [isAdminRecordingActive, setIsAdminRecordingActive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConnectingRefreshToast, setShowConnectingRefreshToast] = useState(false);

  // Guidelines modal
  const [showGuidelines, setShowGuidelines] = useState(false);

  // WebRTC & Audio refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<CallAudioRecorder | null>(null);

  // State refs to avoid stale closures in event listeners & subscriptions
  const activeCallRef = useRef<CallRecord | null>(null);
  activeCallRef.current = activeCall;
  const callStateRef = useRef<string>(callState);
  callStateRef.current = callState;
  const isReconnectingRef = useRef<boolean>(false);
  isReconnectingRef.current = isReconnecting;
  const reconnectionTimeoutRef = useRef<any>(null);
  const isRecoveringIceRef = useRef<boolean>(false);

  // ICE candidates queue to prevent "Remote description not set" errors
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const addedCandidatesRef = useRef<Set<string>>(new Set());
  const hasRemoteDescriptionRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  const terminatingCallIdRef = useRef<string | null>(null);

  // Timers & Channels
  const durationTimerRef = useRef<any>(null);
  const timeoutTimerRef = useRef<any>(null);
  const answerPollTimerRef = useRef<any>(null);
  const connectingTimerRef = useRef<any>(null);
  const roomChannelRef = useRef<any>(null);
  const callTableChannelRef = useRef<any>(null);
  const isInitiatorRef = useRef<boolean>(false);

  const isCallSupported =
    typeof window !== 'undefined' &&
    Boolean(window.RTCPeerConnection) &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  // 1. Stable, Persistent Listener for Incoming Calls (Created once per authenticated user)
  useEffect(() => {
    if (!user?.id) return;

    console.log('[WebRTC-Call] Initializing persistent incoming call listener for user:', user.id);

    const unsubscribe = CallingService.subscribeToIncomingCalls(user.id, (incomingCall) => {
      console.log('[WebRTC-Call] Incoming call event received:', incomingCall.id, 'from:', incomingCall.caller_id);

      // If already in an active call, ignore or decline duplicate
      if (
        activeCallRef.current &&
        callStateRef.current !== 'idle' &&
        callStateRef.current !== 'ended'
      ) {
        if (activeCallRef.current.id !== incomingCall.id) {
          console.warn('[WebRTC-Call] User busy. Rejecting parallel incoming call:', incomingCall.id);
          CallingService.rejectCall(incomingCall.id);
        }
        return;
      }

      setActiveCall(incomingCall);
      setOtherParticipant(incomingCall.caller || null);
      setCallState('ringing');
      isInitiatorRef.current = false;
      isConnectedRef.current = false;
      ringtoneService.startIncomingRingtone();

      // Auto-timeout after 45s if receiver doesn't answer
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = setTimeout(() => {
        console.log('[WebRTC-Call] Incoming call unanswered timeout (45s)');
        handleTimeout(incomingCall.id);
      }, 45000);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // 2. 10-second timer to suggest refresh if call remains in 'connecting' state without connecting
  useEffect(() => {
    if (callState === 'connecting') {
      connectingTimerRef.current = setTimeout(() => {
        if (callStateRef.current === 'connecting') {
          console.warn('[WebRTC-Call] Call in connecting state >10s. Suggesting page refresh to user.');
          setShowConnectingRefreshToast(true);
        }
      }, 10000);
    } else {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current);
        connectingTimerRef.current = null;
      }
      setShowConnectingRefreshToast(false);
    }

    return () => {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current);
        connectingTimerRef.current = null;
      }
    };
  }, [callState]);

  // Handle unanswered timeout
  const handleTimeout = async (callId: string) => {
    if (terminatingCallIdRef.current === callId) return;
    terminatingCallIdRef.current = callId;
    ringtoneService.stopAll();
    ringtoneService.playStatusBeep('ended');
    await CallingService.endCall({
      callId,
      reason: 'timeout_unanswered',
      status: 'missed',
    });
    cleanupCall();
    setCallState('idle');
    setActiveCall(null);
  };

  // Cleanup helper
  const cleanupCall = useCallback(() => {
    console.log('[WebRTC-Call] Cleaning up media, timers, channels, and peer connections');
    ringtoneService.stopAll();

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    if (answerPollTimerRef.current) {
      clearInterval(answerPollTimerRef.current);
      answerPollTimerRef.current = null;
    }
    if (connectingTimerRef.current) {
      clearTimeout(connectingTimerRef.current);
      connectingTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.warn('[WebRTC-Call] Error closing RTCPeerConnection:', err);
      }
      peerConnectionRef.current = null;
    }

    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }

    if (callTableChannelRef.current) {
      supabase.removeChannel(callTableChannelRef.current);
      callTableChannelRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
    }

    queuedCandidatesRef.current = [];
    addedCandidatesRef.current.clear();
    hasRemoteDescriptionRef.current = false;
    isConnectedRef.current = false;
    terminatingCallIdRef.current = null;
    setShowConnectingRefreshToast(false);
    setIsMuted(false);
    setIsSpeaker(false);

    if (reconnectionTimeoutRef.current) {
      clearTimeout(reconnectionTimeoutRef.current);
      reconnectionTimeoutRef.current = null;
    }
    isRecoveringIceRef.current = false;
    setIsReconnecting(false);

    if (user?.id) {
      ChatService.invalidateConversationsCache(user.id);
    }
  }, [user?.id]);

  // Process queued ICE candidates once remote description is set
  const drainQueuedCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc || !pc.remoteDescription) return;
    hasRemoteDescriptionRef.current = true;
    console.log('[WebRTC-Call] Draining queued ICE candidates, count:', queuedCandidatesRef.current.length);
    while (queuedCandidatesRef.current.length > 0) {
      const candidateInit = queuedCandidatesRef.current.shift();
      if (candidateInit) {
        const candKey = typeof candidateInit === 'string' ? candidateInit : JSON.stringify(candidateInit);
        if (addedCandidatesRef.current.has(candKey)) continue;
        addedCandidatesRef.current.add(candKey);
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
          console.log('[WebRTC-Call] Successfully added queued ICE candidate');
        } catch (candidateErr) {
          console.warn('[WebRTC-Call] Failed to drain ICE candidate:', candidateErr);
        }
      }
    }
  }, []);

  // Trigger when connection is established
  const handleConnectionEstablished = useCallback(() => {
    if (isConnectedRef.current) return;
    isConnectedRef.current = true;
    console.log('[WebRTC-Call] Call successfully established and connected!');

    ringtoneService.stopAll();
    ringtoneService.playStatusBeep('connected');
    setCallState('connected');

    // Update truthful call status in DB
    if (activeCallRef.current) {
      CallingService.markCallConnected(activeCallRef.current.id);
    }

    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    if (answerPollTimerRef.current) {
      clearInterval(answerPollTimerRef.current);
      answerPollTimerRef.current = null;
    }

    if (!durationTimerRef.current) {
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }

    // Ensure audio element is playing
    if (audioElementRef.current && remoteStreamRef.current) {
      audioElementRef.current.play().catch(() => {});
    }

    // Start recorder if personal or admin recording enabled
    if (!recorderRef.current) {
      recorderRef.current = new CallAudioRecorder();
    }
    if (isPersonalRecording || isAdminRecordingActive) {
      recorderRef.current.start(localStreamRef.current, remoteStreamRef.current);
    }
  }, [isPersonalRecording, isAdminRecordingActive]);

  // Stop recording and upload
  const finishAndUploadRecording = useCallback(
    async (callId: string, duration: number) => {
      if (!recorderRef.current || !recorderRef.current.isRecording()) return;

      const recordResult = await recorderRef.current.stop();
      if (!recordResult || recordResult.fileSizeBytes === 0) return;

      console.log('[WebRTC-Call] Uploading call audio, duration:', duration, 'size:', recordResult.fileSizeBytes);

      // 1. Upload personal copy if enabled for current user
      if (isPersonalRecording && user?.id) {
        await CallingService.uploadRecording({
          blob: recordResult.blob,
          callId,
          recordingType: 'personal',
          userId: user.id,
          durationSeconds: duration,
        });
      }

      // 2. Upload admin copy if admin recording was mutually consented & active
      if (isAdminRecordingActive && isInitiatorRef.current) {
        await CallingService.uploadRecording({
          blob: recordResult.blob,
          callId,
          recordingType: 'admin_evidence',
          durationSeconds: duration,
        });
      }
    },
    [isPersonalRecording, isAdminRecordingActive, user?.id]
  );

  // Automatic ICE reconnection attempt (without page reload)
  const attemptIceRecovery = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || pc.connectionState === 'closed') return;
    if (isRecoveringIceRef.current) return;
    isRecoveringIceRef.current = true;

    console.log('[WebRTC-Call] Attempting automatic WebRTC ICE recovery...');
    setIsReconnecting(true);

    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      if (isInitiatorRef.current && activeCallRef.current && user?.id) {
        const targetUserId = otherParticipant?.id || activeCallRef.current.receiver_id;
        const offer = await pc.createOffer({
          iceRestart: true,
          offerToReceiveAudio: true,
        });
        await pc.setLocalDescription(offer);
        console.log('[WebRTC-Call] Created ICE restart offer, broadcasting signal');

        CallingService.sendSignal(
          {
            call_id: activeCallRef.current.id,
            sender_id: user.id,
            recipient_id: targetUserId,
            type: 'offer',
            payload: offer,
          },
          roomChannelRef.current
        );
      }
    } catch (err) {
      console.warn('[WebRTC-Call] ICE restart attempt error:', err);
    } finally {
      setTimeout(() => {
        isRecoveringIceRef.current = false;
      }, 3000);
    }
  }, [user?.id, otherParticipant?.id]);

  // Browser online/offline event handlers to recover active WebRTC connection
  useEffect(() => {
    const handleBrowserOffline = () => {
      if (callStateRef.current === 'connected' || callStateRef.current === 'connecting') {
        console.log('[WebRTC-Call] Browser offline during call. Showing reconnecting state.');
        setIsReconnecting(true);
      }
    };

    const handleBrowserOnline = () => {
      if (callStateRef.current === 'connected' || callStateRef.current === 'connecting') {
        console.log('[WebRTC-Call] Browser back online. Attempting automatic recovery...');
        attemptIceRecovery();
      }
    };

    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);
    return () => {
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
    };
  }, [attemptIceRecovery]);

  // Initialize WebRTC Peer Connection
  const setupPeerConnection = useCallback(
    (callId: string, peerUserId: string) => {
      console.log('[WebRTC-Call] Creating RTCPeerConnection for call:', callId, 'peer:', peerUserId);
      const pc = new RTCPeerConnection(CallingService.getRtcConfiguration());

      // Send local ICE candidates to peer
      pc.onicecandidate = (event) => {
        if (event.candidate && user?.id) {
          console.log('[WebRTC-Call] Local ICE candidate generated');
          CallingService.sendSignal(
            {
              call_id: callId,
              sender_id: user.id,
              recipient_id: peerUserId,
              type: 'ice_candidate',
              payload: event.candidate.toJSON(),
            },
            roomChannelRef.current
          );
        }
      };

      // Handle receiving remote audio track
      pc.ontrack = (event) => {
        console.log('[WebRTC-Call] ontrack event fired! Track kind:', event.track.kind);
        
        let remoteStream = event.streams && event.streams[0] ? event.streams[0] : null;
        if (!remoteStream) {
          remoteStream = new MediaStream([event.track]);
        }
        remoteStreamRef.current = remoteStream;

        if (event.track) {
          event.track.enabled = true;
          event.track.onunmute = () => {
            console.log('[WebRTC-Call] Remote audio track unmuted, ensuring audio element is playing');
            if (audioElementRef.current) {
              audioElementRef.current.play().catch(() => {});
            }
          };
        }

        const audioEl = audioElementRef.current;
        if (audioEl) {
          console.log('[WebRTC-Call] Attaching remoteStream to audio element');
          audioEl.srcObject = remoteStream;
          audioEl.volume = 1.0;
          audioEl.muted = false;

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('[WebRTC-Call] Remote audio playback playing successfully');
              })
              .catch((playErr) => {
                console.warn('[WebRTC-Call] Autoplay audio blocked, awaiting user tap/click:', playErr);
                const resume = () => {
                  audioEl.play().catch(() => {});
                  window.removeEventListener('click', resume);
                  window.removeEventListener('touchstart', resume);
                };
                window.addEventListener('click', resume, { once: true });
                window.addEventListener('touchstart', resume, { once: true });
              });
          }
        }

        if (recorderRef.current && recorderRef.current.isRecording()) {
          recorderRef.current.attachRemoteStream(remoteStream);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC-Call] iceConnectionState changed:', pc.iceConnectionState);
        if (
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
        ) {
          if (reconnectionTimeoutRef.current) {
            clearTimeout(reconnectionTimeoutRef.current);
            reconnectionTimeoutRef.current = null;
          }
          setIsReconnecting(false);
          handleConnectionEstablished();
        } else if (pc.iceConnectionState === 'disconnected') {
          console.warn('[WebRTC-Call] iceConnectionState disconnected - entering reconnection state');
          setIsReconnecting(true);
          // Set a safe 20s recovery timeout before concluding permanent failure
          if (!reconnectionTimeoutRef.current) {
            reconnectionTimeoutRef.current = setTimeout(() => {
              if (
                peerConnectionRef.current &&
                (peerConnectionRef.current.iceConnectionState === 'disconnected' ||
                  peerConnectionRef.current.iceConnectionState === 'failed')
              ) {
                console.warn('[WebRTC-Call] ICE reconnection timeout (20s) reached');
                setErrorMessage('नेटवर्क कनेक्शन टूट गया (Connection lost after timeout)');
                setIsReconnecting(false);
                endCall();
              }
            }, 20000);
          }
          attemptIceRecovery();
        } else if (pc.iceConnectionState === 'failed') {
          console.warn('[WebRTC-Call] iceConnectionState failed');
          setIsReconnecting(true);
          if (!reconnectionTimeoutRef.current) {
            reconnectionTimeoutRef.current = setTimeout(() => {
              if (
                peerConnectionRef.current &&
                peerConnectionRef.current.iceConnectionState === 'failed'
              ) {
                setErrorMessage('नेटवर्क त्रुटि के कारण कॉल समाप्त हुई (Call failed due to network error)');
                setIsReconnecting(false);
                endCall();
              }
            }, 12000);
          }
          attemptIceRecovery();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC-Call] connectionState changed:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          if (reconnectionTimeoutRef.current) {
            clearTimeout(reconnectionTimeoutRef.current);
            reconnectionTimeoutRef.current = null;
          }
          setIsReconnecting(false);
          handleConnectionEstablished();
        } else if (pc.connectionState === 'disconnected') {
          console.warn('[WebRTC-Call] connectionState disconnected');
          setIsReconnecting(true);
          attemptIceRecovery();
        } else if (pc.connectionState === 'failed') {
          console.warn('[WebRTC-Call] Peer connection failed');
          if (!reconnectionTimeoutRef.current) {
            reconnectionTimeoutRef.current = setTimeout(() => {
              if (peerConnectionRef.current?.connectionState === 'failed') {
                setErrorMessage('कॉल कनेक्शन विफल (Call connection failed)');
                setIsReconnecting(false);
                endCall();
              }
            }, 10000);
          }
        }
      };

      peerConnectionRef.current = pc;
      return pc;
    },
    [user?.id, handleConnectionEstablished]
  );

  // Peer-initiated hangup (Idempotent local teardown without triggering recursive signal loop)
  const handlePeerHangup = useCallback(
    async (callId: string) => {
      if (terminatingCallIdRef.current === callId) {
        console.log('[WebRTC-Call] Call already terminating for:', callId, 'skipping duplicate peer hangup');
        return;
      }
      terminatingCallIdRef.current = callId;
      console.log('[WebRTC-Call] Processing peer hangup for call:', callId);

      ringtoneService.stopAll();
      ringtoneService.playStatusBeep('ended');
      setCallState('ended');

      const duration = callDuration;

      // Upload personal recording if active
      await finishAndUploadRecording(callId, duration);

      setTimeout(() => {
        cleanupCall();
        setCallState('idle');
        setActiveCall(null);
        setCallDuration(0);
        setOtherParticipant(null);
        setIsAdminRecordingActive(false);
      }, 1200);
    },
    [callDuration, finishAndUploadRecording, cleanupCall]
  );

  // Setup Realtime Room Signaling Channel
  const setupSignalingChannel = useCallback(
    (callId: string, peerUserId: string) => {
      console.log('[WebRTC-Call] Setting up signaling room for call:', callId);

      if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
      }

      const channel = supabase.channel(`call_room_${callId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }) => {
          const signal = payload as CallSignal;
          if (!signal || signal.sender_id === user?.id) return;

          console.log('[WebRTC-Call] Received broadcast signal:', signal.type, 'from:', signal.sender_id);
          const pc = peerConnectionRef.current;
          if (!pc) return;

          try {
            if (signal.type === 'offer') {
              // Receiver receives offer
              console.log('[WebRTC-Call] Setting remote description with received offer');
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
              hasRemoteDescriptionRef.current = true;
              await drainQueuedCandidates(pc);

              // Also fetch any candidates caller already stored in DB
              const dbCandidates = await CallingService.getIceCandidates(callId, peerUserId);
              for (const cand of dbCandidates) {
                const candKey = typeof cand === 'string' ? cand : JSON.stringify(cand);
                if (addedCandidatesRef.current.has(candKey)) continue;
                addedCandidatesRef.current.add(candKey);
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log('[WebRTC-Call] Created answer, sending back to caller');

              CallingService.sendSignal(
                {
                  call_id: callId,
                  sender_id: user!.id,
                  recipient_id: peerUserId,
                  type: 'answer',
                  payload: answer,
                },
                channel
              );
            } else if (signal.type === 'answer') {
              // Caller receives answer
              console.log('[WebRTC-Call] Caller received answer signal');
              if (
                pc.signalingState === 'have-local-offer' ||
                !pc.remoteDescription
              ) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
                hasRemoteDescriptionRef.current = true;
                await drainQueuedCandidates(pc);

                const rxCandidates = await CallingService.getIceCandidates(callId, peerUserId);
                for (const c of rxCandidates) {
                  const candKey = typeof c === 'string' ? c : JSON.stringify(c);
                  if (addedCandidatesRef.current.has(candKey)) continue;
                  addedCandidatesRef.current.add(candKey);
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                  } catch {}
                }
              }
            } else if (signal.type === 'ice_candidate') {
              if (hasRemoteDescriptionRef.current && pc.remoteDescription) {
                const candKey = typeof signal.payload === 'string' ? signal.payload : JSON.stringify(signal.payload);
                if (!addedCandidatesRef.current.has(candKey)) {
                  addedCandidatesRef.current.add(candKey);
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
                  } catch (candidateErr) {
                    console.warn('[WebRTC-Call] addIceCandidate error:', candidateErr);
                  }
                }
              } else {
                queuedCandidatesRef.current.push(signal.payload);
              }
            } else if (signal.type === 'rejected') {
              console.log('[WebRTC-Call] Peer rejected call');
              ringtoneService.stopAll();
              ringtoneService.playStatusBeep('ended');
              setCallState('ended');
              setErrorMessage('कॉल अस्वीकार कर दी गई (Call Declined)');
              setTimeout(() => {
                cleanupCall();
                setCallState('idle');
                setActiveCall(null);
              }, 2000);
            } else if (signal.type === 'ended' || signal.type === 'end') {
              console.log('[WebRTC-Call] Peer ended call');
              handlePeerHangup(callId);
            }
          } catch (err) {
            console.error('[WebRTC-Call] Signaling processing error:', err);
          }
        })
        .subscribe(async (status) => {
          console.log('[WebRTC-Call] call_room status:', status);
          if (status === 'SUBSCRIBED') {
            // If receiver just joined: check if Offer is in DB fallback
            if (!isInitiatorRef.current) {
              const dbOffer = await CallingService.getOfferSignal(callId);
              if (dbOffer && peerConnectionRef.current) {
                const pc = peerConnectionRef.current;
                if (!pc.remoteDescription) {
                  try {
                    console.log('[WebRTC-Call] Applying Offer retrieved from DB fallback');
                    await pc.setRemoteDescription(new RTCSessionDescription(dbOffer));
                    hasRemoteDescriptionRef.current = true;
                    
                    // Also fetch caller's existing ICE candidates from DB
                    const existingCandidates = await CallingService.getIceCandidates(callId, peerUserId);
                    console.log('[WebRTC-Call] Fetched caller ICE candidates from DB, count:', existingCandidates.length);
                    for (const cand of existingCandidates) {
                      const candKey = typeof cand === 'string' ? cand : JSON.stringify(cand);
                      if (addedCandidatesRef.current.has(candKey)) continue;
                      addedCandidatesRef.current.add(candKey);
                      try {
                        await pc.addIceCandidate(new RTCIceCandidate(cand));
                      } catch {}
                    }

                    await drainQueuedCandidates(pc);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    CallingService.sendSignal(
                      {
                        call_id: callId,
                        sender_id: user!.id,
                        recipient_id: peerUserId,
                        type: 'answer',
                        payload: answer,
                      },
                      channel
                    );
                  } catch (e) {
                    console.warn('[WebRTC-Call] Fallback offer processing error:', e);
                  }
                }
              }
            }
          }
        });

      roomChannelRef.current = channel;

      // 2. Also listen for database table updates on this specific call
      const callTableChannel = supabase
        .channel(`call_db_${callId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callId}`,
          },
          async (payload) => {
            const updated = payload.new as CallRecord;
            console.log('[WebRTC-Call] Database call status update:', updated?.status);
            if (updated) {
              if (updated.status === 'connecting' || updated.status === 'connected') {
                if (isInitiatorRef.current) {
                  ringtoneService.stopAll();
                  if (updated.status === 'connected') {
                    handleConnectionEstablished();
                  } else if (callStateRef.current === 'calling') {
                    setCallState('connecting');
                  }
                }
                // If caller sees call is connecting/connected on server, check for Answer in DB
                if (isInitiatorRef.current && peerConnectionRef.current) {
                  const pc = peerConnectionRef.current;
                  if (!pc.remoteDescription) {
                    const dbAnswer = await CallingService.getAnswerSignal(callId);
                    if (dbAnswer) {
                      console.log('[WebRTC-Call] Applying Answer retrieved from DB on status update');
                      await pc.setRemoteDescription(new RTCSessionDescription(dbAnswer));
                      hasRemoteDescriptionRef.current = true;
                      
                      // Fetch receiver's ICE candidates
                      const rxCandidates = await CallingService.getIceCandidates(callId, peerUserId);
                      for (const c of rxCandidates) {
                        const candKey = typeof c === 'string' ? c : JSON.stringify(c);
                        if (addedCandidatesRef.current.has(candKey)) continue;
                        addedCandidatesRef.current.add(candKey);
                        try {
                          await pc.addIceCandidate(new RTCIceCandidate(c));
                        } catch {}
                      }
                      await drainQueuedCandidates(pc);
                    }
                  }
                }
                if (updated.status === 'connected') {
                  handleConnectionEstablished();
                }
              } else if (updated.status === 'rejected') {
                ringtoneService.stopAll();
                ringtoneService.playStatusBeep('ended');
                setCallState('ended');
                setErrorMessage('कॉल अस्वीकार कर दी गई (Call Declined)');
                setTimeout(() => {
                  cleanupCall();
                  setCallState('idle');
                  setActiveCall(null);
                }, 2000);
              } else if (updated.status === 'ended') {
                handlePeerHangup(callId);
              }
            }
          }
        )
        .subscribe();

      callTableChannelRef.current = callTableChannel;
    },
    [user?.id, cleanupCall, drainQueuedCandidates, handlePeerHangup]
  );

  // START OUTGOING CALL
  const startCall = async (targetUser: UserProfile, conversationId?: string): Promise<boolean> => {
    if (!user) return false;
    if (!isCallSupported) {
      alert('आपका ब्राउज़र इंटरनेट कॉलिंग का समर्थन नहीं करता है।');
      return false;
    }

    try {
      console.log('[WebRTC-Call] Initiating outgoing call to:', targetUser.name, targetUser.id);
      setErrorMessage(null);
      setOtherParticipant(targetUser);
      setCallState('calling');
      isInitiatorRef.current = true;
      isConnectedRef.current = false;
      queuedCandidatesRef.current = [];
      hasRemoteDescriptionRef.current = false;
      ringtoneService.startOutgoingTone();

      // Prime audio playback capability within user gesture context
      if (audioElementRef.current) {
        audioElementRef.current.muted = false;
        audioElementRef.current.volume = 1.0;
        audioElementRef.current.play().catch(() => {});
      }

      // 1. Request microphone permission
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        localStreamRef.current = localStream;
        setIsMuted(false);
        console.log('[WebRTC-Call] Microphone access granted, audio tracks:', localStream.getAudioTracks().length);
      } catch (err: any) {
        console.error('[WebRTC-Call] Microphone access denied or error:', err);
        ringtoneService.stopAll();
        setCallState('idle');
        setErrorMessage(
          err?.name === 'NotAllowedError'
            ? 'माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।'
            : 'माइक्रोफ़ोन एक्सेस करने में विफल।'
        );
        return false;
      }

      // 2. Insert call record in DB & broadcast to recipient
      const res = await CallingService.initiateCall({
        callerId: user.id,
        receiverId: targetUser.id,
        conversationId: conversationId || null,
        callerConsentAdminRecording: true,
        callerProfile: {
          id: user.id,
          name: user.name || 'उपयोगकर्ता',
          profile_photo: user.profile_photo || null,
          mobile: user.mobile || '',
        },
      });

      if (!res.success || !res.call) {
        ringtoneService.stopAll();
        setCallState('idle');
        setErrorMessage(res.error || 'कॉल शुरू करने में असमर्थ');
        localStream.getTracks().forEach((t) => t.stop());
        return false;
      }

      const newCall = res.call;
      setActiveCall(newCall);
      console.log('[WebRTC-Call] Call record created successfully in DB, callId:', newCall.id);

      // 3. Setup RTCPeerConnection & Signaling Channel
      const pc = setupPeerConnection(newCall.id, targetUser.id);
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      setupSignalingChannel(newCall.id, targetUser.id);

      // 4. Create WebRTC Offer & Set Local Description
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      console.log('[WebRTC-Call] Local offer created & set on RTCPeerConnection');

      // 5. Send Offer (Both via Realtime broadcast and call_signals DB table)
      await CallingService.sendSignal(
        {
          call_id: newCall.id,
          sender_id: user.id,
          recipient_id: targetUser.id,
          type: 'offer',
          payload: offer,
        },
        roomChannelRef.current
      );

      // 6. Polling fallback for Answer (in case broadcast dropped)
      if (answerPollTimerRef.current) clearInterval(answerPollTimerRef.current);
      answerPollTimerRef.current = setInterval(async () => {
        if (!peerConnectionRef.current || hasRemoteDescriptionRef.current) {
          if (answerPollTimerRef.current) clearInterval(answerPollTimerRef.current);
          return;
        }

        const dbAnswer = await CallingService.getAnswerSignal(newCall.id);
        if (dbAnswer && peerConnectionRef.current && !hasRemoteDescriptionRef.current) {
          console.log('[WebRTC-Call] Periodic poll retrieved answer from DB, applying remote description');
          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(dbAnswer));
            hasRemoteDescriptionRef.current = true;
            const rxCandidates = await CallingService.getIceCandidates(newCall.id, targetUser.id);
            for (const c of rxCandidates) {
              const candKey = typeof c === 'string' ? c : JSON.stringify(c);
              if (addedCandidatesRef.current.has(candKey)) continue;
              addedCandidatesRef.current.add(candKey);
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
              } catch {}
            }
            await drainQueuedCandidates(peerConnectionRef.current);
            if (answerPollTimerRef.current) {
              clearInterval(answerPollTimerRef.current);
              answerPollTimerRef.current = null;
            }
          } catch (e) {
            console.warn('[WebRTC-Call] Error applying answer from periodic poll:', e);
          }
        }
      }, 1500);

      // 45-second unanswered timeout
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = setTimeout(() => {
        handleTimeout(newCall.id);
      }, 45000);

      return true;
    } catch (err: any) {
      console.error('[WebRTC-Call] startCall failed:', err);
      cleanupCall();
      setCallState('idle');
      setErrorMessage(err?.message || 'कॉल करने में त्रुटि');
      return false;
    }
  };

  // ANSWER INCOMING CALL
  const answerCall = async (consentAdminRecording: boolean) => {
    if (!activeCall || !user) return;

    console.log('[WebRTC-Call] Answering incoming call:', activeCall.id);

    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }

    ringtoneService.stopAll();
    setCallState('connecting');
    queuedCandidatesRef.current = [];
    hasRemoteDescriptionRef.current = false;
    isConnectedRef.current = false;

    // Prime audio playback capability within user gesture context
    if (audioElementRef.current) {
      audioElementRef.current.muted = false;
      audioElementRef.current.volume = 1.0;
      audioElementRef.current.play().catch(() => {});
    }

    try {
      // 1. Request microphone permission
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      localStreamRef.current = localStream;
      setIsMuted(false);
      console.log('[WebRTC-Call] Receiver mic access granted');

      // 2. Answer call on server
      const answerRes = await CallingService.answerCall({
        callId: activeCall.id,
        receiverConsentAdminRecording: consentAdminRecording,
      });

      if (!answerRes.success) {
        console.error('[WebRTC-Call] answerCall failed on server:', answerRes.error);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }
        ringtoneService.stopAll();
        ringtoneService.playStatusBeep('ended');
        setCallState('ended');
        setErrorMessage(answerRes.error || 'कॉल स्वीकार करने में विफल (Failed to answer call)');
        setTimeout(() => {
          cleanupCall();
          setCallState('idle');
          setActiveCall(null);
        }, 2000);
        return;
      }

      if (answerRes.adminRecordingActive) {
        setIsAdminRecordingActive(true);
      }

      // 3. Setup RTCPeerConnection & Signaling
      const pc = setupPeerConnection(activeCall.id, activeCall.caller_id);
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      setupSignalingChannel(activeCall.id, activeCall.caller_id);
    } catch (err: any) {
      console.error('[WebRTC-Call] answerCall failed:', err);
      ringtoneService.playStatusBeep('ended');
      setCallState('ended');
      setErrorMessage(
        err?.name === 'NotAllowedError'
          ? 'माइक्रोफ़ोन की अनुमति आवश्यक है।'
          : err?.message || 'कॉल कनेक्ट करने में त्रुटि'
      );
      setTimeout(() => {
        cleanupCall();
        setCallState('idle');
        setActiveCall(null);
      }, 2000);
    }
  };

  // REJECT INCOMING CALL
  const rejectCall = async () => {
    if (!activeCall) return;
    const callId = activeCall.id;
    if (terminatingCallIdRef.current === callId) return;
    terminatingCallIdRef.current = callId;

    console.log('[WebRTC-Call] Rejecting call:', callId);
    ringtoneService.stopAll();
    ringtoneService.playStatusBeep('ended');

    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }

    await CallingService.rejectCall(callId);

    // Broadcast rejected signal
    if (user?.id) {
      CallingService.sendSignal(
        {
          call_id: callId,
          sender_id: user.id,
          recipient_id: activeCall.caller_id,
          type: 'rejected',
          payload: {},
        },
        roomChannelRef.current
      );
    }

    cleanupCall();
    setCallState('idle');
    setActiveCall(null);
  };

  // END ACTIVE CALL
  const endCall = async () => {
    if (!activeCall) {
      cleanupCall();
      setCallState('idle');
      return;
    }

    const callId = activeCall.id;
    if (terminatingCallIdRef.current === callId) {
      console.log('[WebRTC-Call] Call already terminating for:', callId);
      return;
    }
    terminatingCallIdRef.current = callId;

    console.log('[WebRTC-Call] Ending active call:', callId);
    ringtoneService.stopAll();
    ringtoneService.playStatusBeep('ended');

    const duration = callDuration;

    // Send end signal to peer
    if (user?.id) {
      const recipientId = isInitiatorRef.current
        ? activeCall.receiver_id
        : activeCall.caller_id;

      CallingService.sendSignal(
        {
          call_id: callId,
          sender_id: user.id,
          recipient_id: recipientId,
          type: 'ended',
          payload: { reason: isInitiatorRef.current ? 'caller_ended' : 'receiver_ended' },
        },
        roomChannelRef.current
      );
    }

    setCallState('ended');

    // Update status on DB
    await CallingService.endCall({
      callId,
      reason: isInitiatorRef.current ? 'caller_ended' : 'receiver_ended',
      durationSeconds: duration,
      status: 'ended',
    });

    // Upload recorded audio if applicable
    await finishAndUploadRecording(callId, duration);

    setTimeout(() => {
      cleanupCall();
      setCallState('idle');
      setActiveCall(null);
      setCallDuration(0);
      setOtherParticipant(null);
      setIsAdminRecordingActive(false);
    }, 1200);
  };

  // Mute / Unmute: Derived directly from current participant's own local microphone tracks
  const toggleMute = () => {
    const localTracks: MediaStreamTrack[] = [];
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        if (!localTracks.includes(track)) localTracks.push(track);
      });
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio' && !localTracks.includes(sender.track)) {
          localTracks.push(sender.track);
        }
      });
    }

    if (localTracks.length === 0) {
      console.warn('[WebRTC-Call] No local audio tracks found to toggle mute');
      return;
    }

    // Toggle: if any track is enabled, mute all. Otherwise unmute all.
    const isCurrentlyActive = localTracks.some((t) => t.enabled);
    const newEnabledState = !isCurrentlyActive;

    localTracks.forEach((track) => {
      track.enabled = newEnabledState;
    });

    setIsMuted(!newEnabledState);
    console.log('[WebRTC-Call] Toggled local microphone. isMuted:', !newEnabledState);
  };

  // Speaker / Hands-free: Toggles local audio output without affecting remote participant
  const toggleSpeaker = async () => {
    const nextSpeaker = !isSpeaker;
    const el = audioElementRef.current as any;

    if (el && typeof el.setSinkId === 'function') {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
          if (nextSpeaker) {
            const speakerDevice = audioOutputs.find(
              (d) =>
                d.deviceId !== 'default' &&
                (d.label.toLowerCase().includes('speaker') ||
                  d.label.toLowerCase().includes('hands-free') ||
                  d.label.toLowerCase().includes('loudspeaker'))
            );
            if (speakerDevice?.deviceId) {
              await el.setSinkId(speakerDevice.deviceId);
            }
          } else {
            const defaultDevice = audioOutputs.find(
              (d) => d.deviceId === 'default' || d.label.toLowerCase().includes('earpiece')
            );
            await el.setSinkId(defaultDevice?.deviceId || '');
          }
        }
      } catch (sinkErr) {
        console.warn('[WebRTC-Call] setSinkId notice:', sinkErr);
      }
    }

    setIsSpeaker(nextSpeaker);
    if (el) {
      el.volume = nextSpeaker ? 1.0 : 0.8;
    }
    console.log('[WebRTC-Call] Toggled speaker mode, isSpeaker:', nextSpeaker);
  };

  // Personal Recording toggle: Independent control for both Caller and Receiver
  const togglePersonalRecording = () => {
    setIsPersonalRecording((prev) => {
      const next = !prev;
      console.log('[WebRTC-Call] Toggled personal recording, next state:', next);
      if (callStateRef.current === 'connected') {
        if (next) {
          if (!recorderRef.current) recorderRef.current = new CallAudioRecorder();
          if (!recorderRef.current.isRecording()) {
            recorderRef.current.start(localStreamRef.current, remoteStreamRef.current);
          }
        } else if (!isAdminRecordingActive) {
          if (recorderRef.current && recorderRef.current.isRecording()) {
            recorderRef.current.stop();
          }
        }
      }
      return next;
    });
  };

  // Format MM:SS
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <CallingContext.Provider
      value={{
        activeCall,
        callState,
        isMuted,
        isSpeaker,
        isPersonalRecording,
        isAdminRecordingActive,
        isReconnecting,
        callDuration,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        togglePersonalRecording,
        isCallSupported,
      }}
    >
      {children}

      {/* Real audio element for receiving remote peer WebRTC audio (Must not be display: none) */}
      <audio
        ref={audioElementRef}
        autoPlay
        playsInline
        muted={false}
        aria-hidden="true"
        className="fixed -top-full -left-full w-1 h-1 opacity-0 pointer-events-none"
      />

      {/* =====================================================================
          1. INCOMING CALL MODAL OVERLAY
      ====================================================================== */}
      {callState === 'ringing' && otherParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
            {/* Top Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold mb-6 animate-pulse">
              <PhoneIncoming className="w-3.5 h-3.5" />
              <span>इनकमिंग इंटरनेट कॉल (Incoming Call)</span>
            </div>

            {/* Avatar with Pulsing Rings */}
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="relative w-24 h-24 rounded-full overflow-hidden border-3 border-emerald-400 bg-slate-800 flex items-center justify-center shadow-lg">
                {otherParticipant.profile_photo ? (
                  <img
                    src={otherParticipant.profile_photo}
                    alt={otherParticipant.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-white">
                    {otherParticipant.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Name & Title */}
            <h3 className="text-xl font-bold text-white mb-1">
              {otherParticipant.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {otherParticipant.location?.place || 'काममित्र इंटरनेट कॉल'}
            </p>

            {/* Legal Recording Disclosure Card */}
            <div className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 mb-6 text-left">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-slate-300">
                  <p className="font-semibold text-emerald-300 mb-0.5">
                    सुरक्षा व पारदर्शिता हेतु कॉल रिकॉर्डिंग
                  </p>
                  <p className="text-slate-300">
                    यह इंटरनेट कॉल सुरक्षा उद्देश्यों से रिकॉर्ड की जा सकती है। कॉल स्वीकार करके आप घोषित नीति के अनुसार रिकॉर्डिंग से सहमत होते हैं।
                  </p>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowGuidelines(true)}
                  className="text-teal-300 hover:text-teal-200 underline flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>दिशानिर्देश व नियम पढ़ें</span>
                </button>
              </div>
            </div>

            {/* Accept / Reject Action Buttons */}
            <div className="flex items-center justify-center gap-8 w-full">
              {/* Reject Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={rejectCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-900/40 transition cursor-pointer"
                  title="अस्वीकार करें (Decline)"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-[11px] font-medium text-slate-400">अस्वीकार</span>
              </div>

              {/* Accept Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => answerCall(true)}
                  className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 transition cursor-pointer animate-bounce"
                  title="स्वीकार करें (Accept)"
                >
                  <PhoneCall className="w-7 h-7" />
                </button>
                <span className="text-[11px] font-semibold text-emerald-400">स्वीकार करें</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. ACTIVE OR OUTGOING CALL MODAL OVERLAY
      ====================================================================== */}
      {(callState === 'calling' ||
        callState === 'connecting' ||
        callState === 'connected' ||
        callState === 'ended') &&
        otherParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
              {/* Status Header Badge */}
              <div className="mb-4">
                {callState === 'calling' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full text-xs font-semibold animate-pulse">
                    <Phone className="w-3.5 h-3.5" />
                    घंटी बज रही है... (Ringing...)
                  </span>
                )}
                {callState === 'connecting' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-semibold animate-pulse">
                    कनेक्ट हो रहा है... (Connecting...)
                  </span>
                )}
                {callState === 'connected' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    सुरक्षित इंटरनेट कॉल • {formatDuration(callDuration)}
                  </span>
                )}
                {callState === 'ended' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-xs font-semibold">
                    कॉल समाप्त
                  </span>
                )}
              </div>

              {/* Avatar with Sound Wave Ring */}
              <div className="relative mb-4">
                {callState === 'connected' && (
                  <div className="absolute -inset-2 rounded-full bg-emerald-500/20 blur-sm animate-pulse" />
                )}
                <div className="relative w-24 h-24 rounded-full overflow-hidden border-3 border-teal-500 bg-slate-800 flex items-center justify-center shadow-xl">
                  {otherParticipant.profile_photo ? (
                    <img
                      src={otherParticipant.profile_photo}
                      alt={otherParticipant.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-white">
                      {otherParticipant.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Name & Title */}
              <h3 className="text-xl font-bold text-white mb-1">
                {otherParticipant.name}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {otherParticipant.location?.place || 'काममित्र इंटरनेट कॉल'}
              </p>

              {/* Recording Status Badges */}
              {(isPersonalRecording || isAdminRecordingActive) && (
                <div className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5 mb-5 space-y-1.5 text-left">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <Disc
                        className={`w-3.5 h-3.5 ${
                          isPersonalRecording && callState === 'connected'
                            ? 'text-rose-500 animate-spin'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>व्यक्तिगत रिकॉर्डिंग (Personal):</span>
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        isPersonalRecording ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {isPersonalRecording ? 'सक्रिय (ON)' : 'बंद (OFF)'}
                    </span>
                  </div>

                  {isAdminRecordingActive && (
                    <div className="flex items-center justify-between text-slate-300 border-t border-slate-700/50 pt-1.5">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <Shield className="w-3.5 h-3.5 text-teal-400" />
                        <span>प्रशासनिक साक्ष्य (Admin Safety):</span>
                      </span>
                      <span className="text-[11px] font-bold text-teal-300">
                        सहमति से सक्रिय
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Error Message if any */}
              {errorMessage && (
                <div className="w-full bg-rose-950/80 border border-rose-800 text-rose-200 text-xs p-3 rounded-2xl mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Reconnection Status Banner (Auto-recovery without page refresh) */}
              {isReconnecting && (
                <div className="w-full bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs p-3 rounded-2xl mb-4 flex items-center justify-center gap-2.5 text-center animate-pulse">
                  <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                  <span className="text-[11px] font-semibold leading-snug">
                    नेटवर्क रुकावट — पुनः कनेक्ट किया जा रहा है... (Reconnecting...)
                  </span>
                </div>
              )}

              {/* Informative connecting notice if initial connection takes >10s */}
              {showConnectingRefreshToast && callState === 'connecting' && !isReconnecting && (
                <div className="w-full bg-slate-800/90 border border-slate-700 text-slate-300 text-xs p-3 rounded-2xl mb-4 flex items-center justify-center gap-2 text-center animate-in fade-in duration-150">
                  <RefreshCw className="w-3.5 h-3.5 text-teal-400 shrink-0 animate-spin" />
                  <span className="text-[11px]">
                    सिग्नल स्थापित किया जा रहा है... कृपया प्रतीक्षा करें (Connecting...)
                  </span>
                </div>
              )}

              {/* Call Control Buttons */}
              <div className="flex items-center justify-center gap-4 w-full mb-4">
                {/* Mute Button - Independent control for both Caller and Receiver */}
                <button
                  type="button"
                  disabled={callState !== 'connected' && callState !== 'connecting'}
                  onClick={toggleMute}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                    isMuted
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-900/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  } ${(callState !== 'connected' && callState !== 'connecting') ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={isMuted ? 'अनम्यूट करें (Unmute)' : 'म्यूट करें (Mute)'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Speaker Button - Independent control for both Caller and Receiver */}
                <button
                  type="button"
                  disabled={callState !== 'connected' && callState !== 'connecting'}
                  onClick={toggleSpeaker}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                    isSpeaker
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  } ${(callState !== 'connected' && callState !== 'connecting') ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={isSpeaker ? 'स्पीकर बंद करें (Speaker Off)' : 'स्पीकर चालू करें (Speaker On)'}
                >
                  {isSpeaker ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <VolumeX className="w-5 h-5" />
                  )}
                </button>

                {/* Personal Recording Toggle Button - Independent control for both Caller and Receiver */}
                <button
                  type="button"
                  disabled={callState !== 'connected' && callState !== 'connecting'}
                  onClick={togglePersonalRecording}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                    isPersonalRecording
                      ? 'bg-rose-900/60 border border-rose-500 text-rose-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  } ${(callState !== 'connected' && callState !== 'connecting') ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={isPersonalRecording ? 'व्यक्तिगत रिकॉर्डिंग बंद करें (Turn Off Recording)' : 'व्यक्तिगत रिकॉर्डिंग चालू करें (Turn On Recording)'}
                >
                  <Disc className="w-5 h-5" />
                </button>
              </div>

              {/* Red End Call Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-900/50 transition cursor-pointer"
                  title="कॉल काटें (End Call)"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-[11px] font-medium text-slate-400">कॉल समाप्त</span>
              </div>
            </div>
          </div>
        )}

      {/* Guidelines Modal */}
      <RecordingGuidelinesModal
        isOpen={showGuidelines}
        onClose={() => setShowGuidelines(false)}
      />
    </CallingContext.Provider>
  );
};

export const useCalling = (): CallingContextType => {
  const context = useContext(CallingContext);
  if (!context) {
    throw new Error('useCalling must be used within CallingProvider');
  }
  return context;
};
