import { UserProfile } from './index';

export type CallStatus =
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'missed'
  | 'rejected'
  | 'ended'
  | 'failed';

export type CallEndReason =
  | 'normal'
  | 'caller_ended'
  | 'receiver_ended'
  | 'rejected'
  | 'timeout_unanswered'
  | 'failed'
  | 'network_lost'
  | 'permission_denied'
  | 'busy';

export type RecordingType = 'personal' | 'admin_evidence';

export interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string;
  conversation_id?: string | null;
  status: CallStatus;
  started_at: string;
  answered_at?: string | null;
  connected_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  ended_reason?: CallEndReason | string | null;
  end_reason?: CallEndReason | string | null;
  caller_personal_recording?: boolean;
  recipient_personal_recording?: boolean;
  admin_recording_active?: boolean;
  caller_consent_admin_recording?: boolean;
  recipient_consent_admin_recording?: boolean;
  receiver_consent_admin_recording?: boolean;
  created_at: string;
  updated_at?: string;
  // Hydrated participant fields
  caller?: UserProfile | null;
  receiver?: UserProfile | null;
}

export interface CallRecording {
  id: string;
  call_id: string;
  user_id?: string | null;
  owner_id?: string | null;
  recording_type: RecordingType;
  storage_path: string;
  file_size_bytes: number;
  duration_seconds: number;
  mime_type: string;
  is_deleted_by_user?: boolean;
  purged_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at?: string;
  // Hydrated fields
  signed_url?: string | null;
  call?: CallRecord | null;
  owner?: UserProfile | null;
}

export type SignalType =
  | 'offer'
  | 'answer'
  | 'ice_candidate'
  | 'ready'
  | 'ringing'
  | 'rejected'
  | 'end'
  | 'ended'
  | 'ping';

export interface CallSignal {
  id?: string;
  call_id: string;
  sender_id: string;
  recipient_id: string;
  type: SignalType;
  payload: any;
  created_at?: string;
}

export interface CallPreferences {
  internet_calling_enabled: boolean;
  personal_call_recording_enabled: boolean;
  ringtone_enabled: boolean;
  notifications_enabled: boolean;
}
