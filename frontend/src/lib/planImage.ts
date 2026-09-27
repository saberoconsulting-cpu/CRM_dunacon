export function optimizedPlanImageUrl(url?: string | null) {
  if (!url) return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (/\/upload\/[^/]*(f_auto|q_auto|w_\d+)/.test(url)) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_1600/');
}
