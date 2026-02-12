import { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getAuthHeaders(
  firebaseUser?: FirebaseUser,
): Promise<HeadersInit> {
  const user = firebaseUser ?? getFirebaseAuth().currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  firebaseUser?: FirebaseUser,
): Promise<T> {
  const authHeaders = await getAuthHeaders(firebaseUser);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message || `Request failed: ${response.status}`,
      body.code,
      response.status,
    );
  }

  return response.json();
}

export function get<T>(path: string, firebaseUser?: FirebaseUser): Promise<T> {
  return request<T>(path, { method: 'GET' }, firebaseUser);
}

export function post<T>(
  path: string,
  data?: unknown,
  firebaseUser?: FirebaseUser,
): Promise<T> {
  return request<T>(
    path,
    {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    },
    firebaseUser,
  );
}

export function patch<T>(
  path: string,
  data?: unknown,
  firebaseUser?: FirebaseUser,
): Promise<T> {
  return request<T>(
    path,
    {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    },
    firebaseUser,
  );
}
