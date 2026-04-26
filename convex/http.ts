import { httpRouter } from 'convex/server';
import { handleReplicateWebhook } from './music';
import { handleNetworkingHttp } from './networking/http';

const http = httpRouter();

http.route({
  path: '/replicate_webhook',
  method: 'POST',
  handler: handleReplicateWebhook,
});

http.route({
  pathPrefix: '/api/v1/',
  method: 'GET',
  handler: handleNetworkingHttp,
});
http.route({
  pathPrefix: '/api/v1/',
  method: 'POST',
  handler: handleNetworkingHttp,
});
http.route({
  pathPrefix: '/api/v1/',
  method: 'OPTIONS',
  handler: handleNetworkingHttp,
});

export default http;
