import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { customerRouter } from './modules/customers/customer.routes.js';
import { identityRouter } from './modules/identity/identity.routes.js';
import { shipmentRouter } from './modules/shipments/shipment.routes.js';
import { vehicleRouter } from './modules/vehicles/vehicle.routes.js';
import { driverRouter } from './modules/drivers/driver.routes.js';
import { fleetRouter } from './modules/fleet/fleet.routes.js';
import { routeRouter } from './modules/routes/route.routes.js';
import { dispatchRouter } from './modules/dispatch/dispatch.routes.js';

export function createApp() {
  const env = getEnv();
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', identityRouter);
  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/shipments', shipmentRouter);
  app.use('/api/v1/vehicles', vehicleRouter);
  app.use('/api/v1/drivers', driverRouter);
  app.use('/api/v1/fleet', fleetRouter);
  app.use('/api/v1/routes', routeRouter);
  app.use('/api/v1/dispatch', dispatchRouter);
  app.use('/api/v1/audit', auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
