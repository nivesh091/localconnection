import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, ADMIN_EMAIL } from '../lib/supabase';
import { UserProfile, WorkerProfile, UserLocation, WorkerMedia } from '../types';
import { ProfileService } from '../services/profileService';
import { WorkerService } from '../services/workerService';
import { LocationService } from '../services/locationService';

interface AuthContextType {
  user: UserProfile | null;
  workerProfile: WorkerProfile | null;
  location: UserLocation | null;
  isAdmin: boolean;
  isLoading: boolean;
  setWorkerProfile: (profile: WorkerProfile | null) => void;
  refreshUser: (force?: boolean) => Promise<void>;
  updateWorkerPhotos: (photos: WorkerMedia[]) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  workerProfile: null,
  location: null,
  isAdmin: false,
  isLoading: true,
  setWorkerProfile: () => {},
  refreshUser: async () => {},
  updateWorkerPhotos: () => {},
  logout: async () => {},
});


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Track active user ref to prevent wiping local session on network drop
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  // Deduplicate concurrent user data loading
  const loadInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const loadUserData = useCallback(async (userId: string, email?: string | null) => {
    if (loadInFlightRef.current.has(userId)) {
      return loadInFlightRef.current.get(userId);
    }

    const loadPromise = (async () => {
      try {
        // Parallel admin verification
        if (
          email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
          userId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72'
        ) {
          Promise.resolve(supabase.rpc('is_admin'))
            .then(({ data: dbAdmin }) => {
              setIsAdmin(dbAdmin !== null ? Boolean(dbAdmin) : true);
            })
            .catch(() => {
              setIsAdmin(true);
            });
        } else {
          setIsAdmin(false);
        }

        // Fetch Profile, Location, and Worker Profile in parallel for fast loading
        const [profileRes, locRes, workerRes] = await Promise.allSettled([
          ProfileService.getProfile(userId),
          ProfileService.getUserLocation(userId),
          WorkerService.getWorkerDetail(userId),
        ]);

        if (profileRes.status === 'fulfilled' && profileRes.value) {
          const profileVal = { ...profileRes.value };
          if (workerRes.status === 'fulfilled' && workerRes.value?.is_mobile_public !== undefined) {
            profileVal.is_mobile_public = workerRes.value.is_mobile_public;
          }
          try {
            localStorage.setItem('km_active_user_id', profileVal.id);
            sessionStorage.setItem('km_active_user_id', profileVal.id);
          } catch {}
          setUser(profileVal);
        } else if (!userRef.current && navigator.onLine) {
          try {
            localStorage.removeItem('km_active_user_id');
            sessionStorage.removeItem('km_active_user_id');
          } catch {}
          setUser(null);
        }

        if (locRes.status === 'fulfilled' && (locRes.value || !userRef.current)) {
          let userLoc = locRes.value || null;
          if (
            userLoc &&
            (!userLoc.latitude || !userLoc.longitude || isNaN(Number(userLoc.latitude)) || isNaN(Number(userLoc.longitude))) &&
            userLoc.district
          ) {
            const districtCoords = LocationService.resolveDistrictCoordinates(userLoc.district);
            if (districtCoords) {
              userLoc = {
                ...userLoc,
                latitude: districtCoords.latitude,
                longitude: districtCoords.longitude,
              };
            }
          }
          setLocation(userLoc);
        }

        if (workerRes.status === 'fulfilled') {
          setWorkerProfile(workerRes.value || null);
        }
      } catch (err) {
        console.warn('Network or data loading warning:', err);
      } finally {
        setIsLoading(false);
        loadInFlightRef.current.delete(userId);
      }
    })();

    loadInFlightRef.current.set(userId, loadPromise);
    return loadPromise;
  }, []);

  const refreshUser = useCallback(async (force?: boolean) => {
    try {
      if (force && userRef.current) {
        loadInFlightRef.current.delete(userRef.current.id);
      }
      // Bounded promise with fast 2.5s timeout so startup and reconnect never hang
      const getSessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 2500)
      );

      const res = await Promise.race([getSessionPromise, timeoutPromise]);
      const session = (res as { data: { session: any } }).data?.session;

      if (session?.user) {
        if (force) {
          loadInFlightRef.current.delete(session.user.id);
        }
        await loadUserData(session.user.id, session.user.email);
      } else if (navigator.onLine && !userRef.current) {
        // Only clear when truly online and no existing local session
        setUser(null);
        setWorkerProfile(null);
        setLocation(null);
        setIsAdmin(false);
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }, [loadUserData]);

  useEffect(() => {
    // 1. Initial startup check
    refreshUser();

    // 2. Auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem('km_active_user_id');
          sessionStorage.removeItem('km_active_user_id');
        } catch {}
        setUser(null);
        setWorkerProfile(null);
        setLocation(null);
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        await loadUserData(session.user.id, session.user.email);
      } else if (event === 'INITIAL_SESSION' && !session) {
        if (!userRef.current) {
          setUser(null);
          setWorkerProfile(null);
          setLocation(null);
          setIsAdmin(false);
        }
        setIsLoading(false);
      }
    });

    // 3. Auto-reconnect handling on internet return (Requirement 25)
    const handleOnline = () => {
      // Re-verify session in background without page reset
      refreshUser();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      authListener.subscription.unsubscribe();
    };
  }, [refreshUser, loadUserData]);

  const updateWorkerPhotos = useCallback((photos: WorkerMedia[]) => {
    setWorkerProfile((prev) => {
      if (!prev) return null;
      const updated = { ...prev, work_photos: photos };
      WorkerService.updateCachedWorkerPhotos(prev.user_id, photos);
      return updated;
    });
  }, []);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('SignOut warning:', err);
    } finally {
      setUser(null);
      setWorkerProfile(null);
      setLocation(null);
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workerProfile,
        location,
        isAdmin,
        isLoading,
        setWorkerProfile,
        refreshUser,
        updateWorkerPhotos,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

