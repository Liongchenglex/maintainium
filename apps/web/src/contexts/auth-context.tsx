'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  GithubAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { get } from '@/lib/api';

interface DbUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  authProvider: 'email' | 'github';
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextValue {
  user: FirebaseUser | null;
  dbUser: DbUser | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function setSessionCookie(user: FirebaseUser | null) {
  if (user) {
    document.cookie = '__session=1; path=/; max-age=86400; SameSite=Lax';
  } else {
    document.cookie = '__session=; path=/; max-age=0; SameSite=Lax';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDbUser = useCallback(async () => {
    try {
      const data = await get<DbUser>('/users/me');
      setDbUser(data);
    } catch {
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setUser(firebaseUser);
      setSessionCookie(firebaseUser);

      if (firebaseUser) {
        await fetchDbUser();
      } else {
        setDbUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [fetchDbUser]);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const credential = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password,
      );
      await updateProfile(credential.user, { displayName });
      await fetchDbUser();
    },
    [fetchDbUser],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await fetchDbUser();
    },
    [fetchDbUser],
  );

  const signInWithGithub = useCallback(async () => {
    const provider = new GithubAuthProvider();
    await signInWithPopup(getFirebaseAuth(), provider);
    await fetchDbUser();
  }, [fetchDbUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setDbUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, dbUser, loading, signUp, signIn, signInWithGithub, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
