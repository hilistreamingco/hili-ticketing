import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../_lib/auth.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { eventId, base64, mimeType } = req.body as Record<string, string>;
    if (!eventId || !base64 || !mimeType) {
      return res.status(400).json({ error: 'eventId, base64, and mimeType are required' });
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({ error: 'Posters must be PNG, JPEG or WebP images' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Poster is larger than 5 MB' });
    }
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
