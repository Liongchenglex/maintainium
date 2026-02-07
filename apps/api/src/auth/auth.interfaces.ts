import { User } from '../database/schema';

export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase: {
    sign_in_provider: string;
  };
}

export interface RequestUser extends User {}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
