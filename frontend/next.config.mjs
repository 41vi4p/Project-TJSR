/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pdf-parse'],
  // Allow the backend API origin for server-side requests
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api/v1'}/:path*`,
      },
    ];
  },
  // Turbopack config (replaces webpack externals for Next.js 16+)
  turbopack: {},
}

export default nextConfig
