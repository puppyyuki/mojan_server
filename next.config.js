/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'mojan-server-0kuv.onrender.com',
        pathname: '/**',
      },
      // 後援：舊資料或代理未轉發 proto 時曾寫入 http://…（next/image 需列入才會載入）
      {
        protocol: 'http',
        hostname: 'mojan-server-0kuv.onrender.com',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig

