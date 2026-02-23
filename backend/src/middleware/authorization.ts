import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const authorize = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.user.Permissions || !req.user.Permissions.includes(permission)) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: `Permission '${permission}' required`
      });
      return;
    }

    next();
  };
};

export const authorizeAny = (permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.user.Permissions || !permissions.some(p => req.user!.Permissions.includes(p))) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: `One of the following permissions required: ${permissions.join(', ')}`
      });
      return;
    }

    next();
  };
};
