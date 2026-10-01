import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVerifiedUser, isAllowListed } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getVerifiedUser(req.headers.authorization as string);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { admin, prestige } = isAllowListed(user.email);
  if (admin) {
    return res.json({ role: 'hili_admin', email: user.email });
  }
  if (prestige) {
    return res.json({ role: 'prestige_user', email: user.email });
  }

  return res.json({ role: 'user', email: user.email });
}
