import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

function parseJWT(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthedUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = parseJWT(authHeader.slice(7));
  if (!payload?.email) return null;
  
  const email = payload.email.toLowerCase();
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  
  if (admins.includes(email)) {
    return { uid: payload.sub || '', email, role: 'hili_admin' };
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getAuthedUser(req.headers.authorization as string);
    if (!user || user.role !== 'hili_admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { eventId, base64, mimeType } = req.body as Record<string, string>;
    if (!eventId || !base64 || !mimeType) {
      return res.status(400).json({ error: 'eventId, base64, and mimeType are required' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const buffer = Buffer.from(base64, 'base64');
    const ext = mimeType.split('/')[1] || 'jpg';
    const path = `${eventId}/${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('event-posters')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('event-posters').getPublicUrl(path);
    return res.json({ url: urlData.publicUrl });
  } catch (error: any) {
    console.error('Upload poster error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
