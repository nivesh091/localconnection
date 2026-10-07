export type UserRole = 'guest' | 'user' | 'worker' | 'admin';

export type PriceUnit = 'day' | 'hour' | 'month' | 'other' | 'custom';

export function getPriceUnitLabel(
  unit?: PriceUnit | string | null,
  customUnit?: string | null,
  lang: 'hi' | 'en' = 'hi'
): string {
  if (unit === 'hour') {
    return lang === 'hi' ? 'प्रति घंटे' : 'Per Hour';
  }
  if (unit === 'month') {
    return lang === 'hi' ? 'प्रति महीने' : 'Per Month';
  }
  if (unit === 'other' || unit === 'custom') {
    return customUnit?.trim() || (lang === 'hi' ? 'अन्य' : 'Other');
  }
  return lang === 'hi' ? 'प्रति दिन' : 'Per Day';
}

export interface UserProfile {
  id: string;
  username?: string | null;
  name: string;
  mobile: string;
  is_mobile_public?: boolean; // Feature 3: Public Mobile Number ON/OFF
  is_worker_active?: boolean; // Feature 1: Deactivated status indicator for worker account
  is_worker?: boolean;
  address?: string | null;
  profile_photo?: string | null;
  created_at: string;
  updated_at: string;
  location?: UserLocation | null;
}

export interface WorkerCategory {
  id: string;
  name_hi: string;
  name_en: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WorkerProfile {
  user_id: string;
  category_id?: string | null;
  other_category?: string | null;
  experience_years: number;
  price_per_day: number;
  price_unit?: PriceUnit; // Feature 2: Flexible Pricing (default 'day' for existing, 'month' for new)
  custom_price_unit?: string | null;
  is_active?: boolean; // Feature 1: Admin Service Provider Activate / Deactivate (default true)
  is_mobile_public?: boolean; // Feature 3: Public Mobile Number ON/OFF (default true)
  about_text?: string | null;
  priority_points: number; // 1-100, Admin only
  created_at: string;
  updated_at: string;
  // Joined fields for display
  category?: WorkerCategory | null;
  profile?: UserProfile | null;
  location?: UserLocation | null;
  voice_recording?: WorkerMedia | null;
  work_photos?: WorkerMedia[];
}

export interface UserLocation {
  id?: string;
  user_id: string;
  state: string;
  district: string;
  place: string; // Village / Town / City
  village?: string;
  city?: string;
  town?: string;
  subdistrict?: string;
  tehsil?: string;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_source: 'gps' | 'manual';
  created_at?: string;
  updated_at?: string;
}

export interface WorkerMedia {
  id: string;
  worker_user_id: string;
  media_type: 'photo' | 'voice';
  storage_path: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  public_url?: string;
}

export interface Conversation {
  id: string;
  user_1_id: string;
  user_2_id: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  other_user?: UserProfile;
  latest_message?: Message;
  unread_count?: number;
}

export type MessageType = 'text' | 'photo' | 'video' | 'voice' | 'location';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface MessageLocationData {
  place: string;
  district?: string;
  latitude: number;
  longitude: number;
}

export interface MessageReferenceMetadata {
  comment_id?: string;
  author_id?: string;
  author_name?: string;
  target_type?: 'worker' | 'requirement';
  target_id?: string;
  has_voice?: boolean;
  text?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  message_text?: string | null;
  media_id?: string | null;
  location_data?: MessageLocationData | null;
  status: MessageStatus;
  deleted_for_everyone: boolean;
  created_at: string;
  updated_at: string;
  media_url?: string | null;
  media_failed?: boolean;
  is_mine?: boolean;
  is_deleted_for_me?: boolean;
  is_read?: boolean;
  // Comment reference metadata (WhatsApp-style reply/reference)
  reference_type?: 'comment' | 'message' | null;
  reference_comment_id?: string | null;
  reference_preview?: string | null;
  reference_metadata?: MessageReferenceMetadata | null;
}

export interface CommentAuthor {
  id: string;
  name: string;
  profile_photo?: string | null;
  mobile?: string | null;
  is_mobile_public?: boolean;
}

export interface CommentItem {
  id: string;
  author_id: string;
  target_type: 'worker' | 'requirement';
  target_id: string;
  parent_comment_id?: string | null;
  text?: string | null;
  voice_storage_path?: string | null;
  created_at: string;
  updated_at: string;
  // Hydrated display fields
  author?: CommentAuthor | null;
  voice_url?: string | null;
  replies?: CommentItem[];
  replies_count?: number;
}

export interface CommentReference {
  commentId: string;
  authorId: string;
  authorName: string;
  textPreview: string;
  hasVoice?: boolean;
  targetType: 'worker' | 'requirement';
  targetId: string;
}

export interface AdminSettings {
  id: string;
  admin_call_enabled: boolean;
  admin_contact_number: string;
  about_kaammitra_hi: string;
  about_kaammitra_en: string;
  home_welcome_hi: string;
  home_welcome_en: string;
  chat_retention_days: number;
  show_requirements_on_map?: boolean; // Admin only: Show requirements on Map (default false)
  updated_at: string;
}

export interface AdminCommunication {
  id: string;
  admin_id: string;
  recipient_id?: string | null;
  send_to_all: boolean;
  message_type: 'text' | 'voice' | 'media';
  message_text?: string | null;
  media_url?: string | null;
  created_at: string;
  updated_at: string;
  is_read?: boolean;
  is_delivered?: boolean;
}

export interface HelpRequest {
  id: string;
  user_id?: string | null;
  guest_request_id?: string | null;
  request_type: string;
  name: string;
  mobile: string;
  voice_storage_path?: string | null;
  voice_url?: string | null;
  description?: string | null;
  status: 'pending' | 'contacted' | 'resolved';
  created_at: string;
  updated_at: string;
}

export interface WorkerRequest {
  id: string;
  user_id?: string | null;
  guest_request_id?: string | null;
  name?: string | null;
  mobile?: string | null;
  voice_storage_path?: string | null;
  voice_url?: string | null;
  category_id?: string | null;
  other_category?: string | null;
  description?: string | null;
  status: 'pending' | 'contacted' | 'resolved';
  created_at: string;
  updated_at: string;
  category?: WorkerCategory | null;
}

export interface ProviderComplaint {
  id: string;
  user_id: string;
  provider_id: string;
  voice_storage_path: string;
  voice_url?: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  updated_at: string;
  user?: UserProfile | null;
  provider?: UserProfile | null;
}

export interface SearchFilterState {
  categoryId?: string;
  radiusKm?: number;
  maxPricePerDay?: number;
  minExperienceYears?: number;
  searchTerm?: string;
  userLat?: number;
  userLng?: number;
  place?: string;
}

export interface Requirement {
  id: string;
  owner_id: string;
  category: string;
  short_requirement: string;
  location_id?: string | null;
  place: string;
  district?: string | null;
  state?: string | null;
  subdistrict?: string | null;
  tehsil?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maximum_budget: number;
  minimum_experience_years?: number | null;
  voice_storage_path?: string | null;
  additional_info?: string | null;
  keywords?: string[];
  photo_storage_paths?: string[];
  photos?: string[];
  is_active: boolean;
  priority_points?: number; // 1-100, Admin only, default 50
  created_at: string;
  updated_at: string;
  // Joined or calculated display fields
  owner?: UserProfile | null;
  voice_url?: string | null;
  location?: UserLocation | null;
}

export interface RequirementFilterState {
  searchTerm?: string;
  categories?: string[];
  radiusKm?: number;
  userLat?: number;
  userLng?: number;
}

export interface UserNotification {
  id: string;
  user_id: string;
  sender_id: string;
  notification_type: 'comment' | 'reply';
  target_type: 'worker' | 'requirement';
  target_id: string;
  comment_id?: string | null;
  comment_preview?: string | null;
  has_voice?: boolean;
  is_read: boolean;
  created_at: string;
  sender?: {
    id: string;
    name: string;
    profile_photo?: string | null;
    mobile?: string | null;
    is_mobile_public?: boolean;
  } | null;
}
