import app from '../apiApp';

export default function handler(req: any, res: any) {
  if (!req.url || req.url === '/' || req.url.startsWith('/?')) {
    const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = '/api/tts' + qs;
  }
  return app(req, res);
}
