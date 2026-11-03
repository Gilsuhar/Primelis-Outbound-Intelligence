const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#244f5f"/><path d="M9 21.4c1.7 1.6 4 2.4 6.8 2.4 4.2 0 7.2-2 7.2-5.3 0-3-2.1-4.4-6.2-5.2-2.5-.5-3.5-1-3.5-2.2 0-1.1 1-1.8 2.8-1.8 1.7 0 3.2.5 4.5 1.5l1.6-2.8c-1.6-1.2-3.6-1.8-6-1.8-3.9 0-6.6 2-6.6 5.1 0 3 2.1 4.5 6.1 5.3 2.6.5 3.5 1 3.5 2.2 0 1.2-1.1 1.9-3.2 1.9-2 0-3.7-.6-5.2-1.9L9 21.4z" fill="#f8f5ef"/></svg>`;

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml",
    },
  });
}
