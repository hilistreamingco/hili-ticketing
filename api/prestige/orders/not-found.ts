import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
  const prestigeEmails = (process.env.PRESTIGE_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  
  if (adminEmails.includes(email) || prestigeEmails.includes(email)) {
    return { uid: payload.sub || '', email };
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
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId, note } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'not_found',
        payment_note: note || 'Payment not found',
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Order update error:', updateError);
      return res.status(500).json({ error: 'Failed to update order' });
    }

    // Create audit log
    await supabase
      .from('audit_log')
      .insert({
        order_id: orderId,
        action: 'payment_not_found',
        actor_id: user.uid,
        actor_email: user.email,
        metadata: { note: note || '' },
      });

    return res.json({ 
      success: true, 
      message: 'Order marked as payment not found' 
    });
  } catch (error: any) {
    console.error('Mark not found error:', error);
    return res.status(500).json({ error: error.message || 'Could not update order' });
  }
}
