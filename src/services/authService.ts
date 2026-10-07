import { supabase, ADMIN_EMAIL, ADMIN_CONTACT_DEFAULT } from '../lib/supabase';
import { UserProfile, UserLocation } from '../types';
import { brandingStore } from './brandingService';

export interface SignupParams {
  name: string;
  mobile: string;
  password: string;
  location?: Omit<UserLocation, 'user_id'>;
  address?: string;
}

export class AuthService {
  // Convert mobile number to internal Supabase Auth email format
  private static mobileToEmail(mobile: string): string {
    const clean = mobile.trim().replace(/[^0-9]/g, '');
    return `${clean}@user.kaammitra.local`;
  }

  static async signup(params: SignupParams): Promise<{ user: UserProfile | null; error: string | null }> {
    try {
      const cleanMobile = params.mobile.trim().replace(/[^0-9]/g, '');
      if (cleanMobile.length !== 10) {
        return { user: null, error: 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।' };
      }

      const email = this.mobileToEmail(cleanMobile);

      // Check if mobile number is already registered in profiles or private mobile table
      const { data: existingMobile } = await supabase
        .from('profiles')
        .select('id')
        .or(`mobile.eq.${cleanMobile},username.eq.${cleanMobile}`)
        .maybeSingle();

      if (existingMobile) {
        return { user: null, error: 'यह मोबाइल नंबर पहले से पंजीकृत है।' };
      }

      const { data: existingPrivate } = await supabase
        .from('user_private_mobile')
        .select('user_id')
        .eq('mobile', cleanMobile)
        .maybeSingle();

      if (existingPrivate) {
        return { user: null, error: 'यह मोबाइल नंबर पहले से पंजीकृत है।' };
      }

      // Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: params.password,
        options: {
          data: {
            name: params.name.trim(),
            mobile: cleanMobile,
          },
        },
      });

      if (authError || !authData.user) {
        return { user: null, error: authError?.message || 'खाता बनाने में समस्या आई।' };
      }

      // Supabase Auth returns an empty identities array if the email/identity already exists
      if (authData.user.identities && authData.user.identities.length === 0) {
        return {
          user: null,
          error: 'यह मोबाइल नंबर पहले से पंजीकृत है। कृपया लॉगिन करें या एडमिन से संपर्क करें।',
        };
      }

      const userId = authData.user.id;

      // Create public profile in profiles table.
      // (Supplying cleanMobile to username column ensures compatibility if database column has NOT NULL)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          username: cleanMobile,
          name: params.name.trim(),
          mobile: cleanMobile,
          address: params.address?.trim() || null,
        })
        .select()
        .single();

      if (profileError) {
        return { user: null, error: profileError.message };
      }

      // If initial location provided, save it
      if (params.location && (params.location.state || params.location.district || params.location.place)) {
        await supabase.from('locations').upsert({
          user_id: userId,
          state: params.location.state || '',
          district: params.location.district || '',
          place: params.location.place || (params.location as any).village || '',
          landmark: params.location.landmark || null,
          latitude: params.location.latitude || null,
          longitude: params.location.longitude || null,
          location_source: params.location.location_source || 'manual',
        });
      }

      return { user: profileData, error: null };
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'अज्ञात त्रुटि' };
    }
  }

  static async login(identifier: string, password: string): Promise<{ user: UserProfile | null; error: string | null }> {
    try {
      const isEmail = identifier.includes('@');
      let email = '';

      if (isEmail) {
        email = identifier.trim().toLowerCase();
      } else {
        const cleanMobile = identifier.trim().replace(/[^0-9]/g, '');

        if (cleanMobile.length !== 10) {
          return { user: null, error: 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।' };
        }

        // If admin contact number is entered, authenticate via official ADMIN_EMAIL so JWT has admin privileges
        if (cleanMobile === ADMIN_CONTACT_DEFAULT || cleanMobile === '9149275779') {
          const { data: adminAuth, error: adminErr } = await supabase.auth.signInWithPassword({
            email: ADMIN_EMAIL,
            password,
          });
          if (!adminErr && adminAuth.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', adminAuth.user.id)
              .maybeSingle();
            return { user: profile, error: null };
          }
        }

        // Check if this mobile belongs to the registered Admin user profile
        try {
          const { data: adminProf } = await supabase
            .from('profiles')
            .select('id, mobile')
            .eq('id', '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72')
            .maybeSingle();

          if (adminProf?.mobile && adminProf.mobile === cleanMobile) {
            const { data: adminAuth, error: adminErr } = await supabase.auth.signInWithPassword({
              email: ADMIN_EMAIL,
              password,
            });
            if (!adminErr && adminAuth.user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', adminAuth.user.id)
                .maybeSingle();
              return { user: profile, error: null };
            }
          }
        } catch {
          // Continue to regular login fallback
        }

        // Check for legacy profiles where a suffixed username might have been used in auth email
        const { data: matchedProfile } = await supabase
          .from('profiles')
          .select('id, username, mobile')
          .eq('mobile', cleanMobile)
          .maybeSingle();

        if (matchedProfile?.username && matchedProfile.username !== cleanMobile) {
          const legacyEmail = `${matchedProfile.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}@user.kaammitra.local`;
          const { data: authLegacy, error: errLegacy } = await supabase.auth.signInWithPassword({
            email: legacyEmail,
            password,
          });

          if (!errLegacy && authLegacy.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', authLegacy.user.id)
              .maybeSingle();
            return { user: profile, error: null };
          }
        }

        email = this.mobileToEmail(cleanMobile);
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        return { user: null, error: 'गलत मोबाइल नंबर या पासवर्ड।' };
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        // If profile record missing for admin, create a minimal profile
        if (authData.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          const { data: newAdminProfile } = await supabase
            .from('profiles')
            .upsert({
              id: authData.user.id,
              name: `${brandingStore.getName('hi')} एडमिन`,
              mobile: ADMIN_CONTACT_DEFAULT,
            })
            .select()
            .single();

          return { user: newAdminProfile, error: null };
        }
        return { user: null, error: 'प्रोफ़ाइल डेटा प्राप्त नहीं हो सका।' };
      }

      return { user: profile, error: null };
    } catch (err) {
      return { user: null, error: err instanceof Error ? err.message : 'लॉगिन में त्रुटि हुई।' };
    }
  }

  static async logout(): Promise<void> {
    await supabase.auth.signOut();
  }

  static async getCurrentUser(): Promise<UserProfile | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sessionData.session.user.id)
      .maybeSingle();

    return profile || null;
  }

  static async changePassword(newPassword: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: error.message };
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  static isAdmin(userEmail?: string | null): boolean {
    if (!userEmail) return false;
    return userEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }
}
