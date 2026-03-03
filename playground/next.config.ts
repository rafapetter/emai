import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@petter100/emai',
    'better-sqlite3',
    'imapflow',
    'mailparser',
    'nodemailer',
    '@google/generative-ai',
  ],
};

export default nextConfig;
