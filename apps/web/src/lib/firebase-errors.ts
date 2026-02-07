const errorMessages: Record<string, string> = {
  'auth/email-already-in-use':
    'An account with this email already exists. Try logging in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled. Please contact support.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-disabled':
    'This account has been disabled. Please contact support.',
  'auth/user-not-found':
    'No account found with this email. Check your email or sign up.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential':
    'Invalid email or password. Please check your credentials and try again.',
  'auth/too-many-requests':
    'Too many failed attempts. Please wait a moment and try again.',
  'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
  'auth/cancelled-popup-request': 'Only one popup request is allowed at a time.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/network-request-failed':
    'Network error. Please check your connection and try again.',
};

export function getFirebaseErrorMessage(errorCode: string): string {
  return errorMessages[errorCode] || 'Something went wrong. Please try again.';
}
