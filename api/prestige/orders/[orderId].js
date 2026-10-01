import { getAuthedUser, canUsePrestige, getServiceClient } from '../../_lib/auth.js';

export default async function handler(req, res) {
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const { orderId } = req.query;

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*), tickets(*)')
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('Get order error:', error);
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    return res.status(404).json({ error: 'Order not found' });
  }
}
