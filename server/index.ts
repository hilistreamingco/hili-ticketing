import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 8080;

async function createServer() {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Import and mount all API routes
  const { default: pingHandler } = await import('../api/ping.js');
  const { default: adminMe } = await import('../api/admin/me.js');
  const { default: adminEvents } = await import('../api/admin/events.js');
  const { default: adminEventById } = await import('../api/admin/events/[id].js');
  const { default: adminEventTickets } = await import('../api/admin/events/[id]/tickets.js');
  const { default: adminTickets } = await import('../api/admin/tickets.js');
  const { default: adminTicketById } = await import('../api/admin/tickets/[id].js');
  const { default: adminUploadPoster } = await import('../api/admin/upload-poster.js');
  const { default: ordersManual } = await import('../api/orders/manual.js');
  const { default: paymentConfig } = await import('../api/payment-config/[eventSlug].js');
  const { default: prestigeStats } = await import('../api/prestige/stats.js');
  const { default: prestigeOrders } = await import('../api/prestige/orders.js');

  // Mount API routes
  app.all('/api/ping', pingHandler);
  app.all('/api/admin/me', adminMe);
  app.all('/api/admin/events', adminEvents);
  app.all('/api/admin/events/:id', (req, res) => {
    req.query = { ...req.query, id: req.params.id };
    adminEventById(req, res);
  });
  app.all('/api/admin/events/:id/tickets', (req, res) => {
    req.query = { ...req.query, id: req.params.id };
    adminEventTickets(req, res);
  });
  app.all('/api/admin/tickets', adminTickets);
  app.all('/api/admin/tickets/:id', (req, res) => {
    req.query = { ...req.query, id: req.params.id };
    adminTicketById(req, res);
  });
  app.all('/api/admin/upload-poster', adminUploadPoster);
  app.all('/api/orders/manual', ordersManual);
  app.all('/api/payment-config/:eventSlug', (req, res) => {
    req.query = { ...req.query, eventSlug: req.params.eventSlug };
    paymentConfig(req, res);
  });
  app.all('/api/prestige/stats', prestigeStats);
  app.all('/api/prestige/orders', prestigeOrders);

  if (isProduction) {
    // Serve static files from dist/spa in production
    app.use(express.static(join(__dirname, '../dist/spa')));
    
    // SPA fallback - all non-API routes serve index.html
    app.get('*', (req, res) => {
      res.sendFile(join(__dirname, '../dist/spa/index.html'));
    });
  } else {
    // Development mode with Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    
    app.use(vite.middlewares);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

createServer();
