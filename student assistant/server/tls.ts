// Browsers only allow webcam and microphone access on HTTPS pages, and students
// reach this laptop by its Wi-Fi address, so the server needs a certificate.
// It's self-signed, which is why students click through a warning once.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import selfsigned from 'selfsigned';
import { dataDir } from './config.ts';

/** IPv4 addresses other computers could use to reach this laptop. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

export async function loadCertificate(): Promise<{ key: string; cert: string }> {
  const dir = join(dataDir, 'tls');
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  const addressFile = join(dir, 'addresses.txt');
  const addresses = lanAddresses();

  // Reissue when the laptop joins a new network so the address stays in the certificate.
  if (existsSync(keyFile) && existsSync(certFile) && existsSync(addressFile)) {
    const covered = readFileSync(addressFile, 'utf8').split('\n');
    if (addresses.every((address) => covered.includes(address))) {
      return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') };
    }
  }

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Student Assistant' }], {
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...addresses.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });

  mkdirSync(dir, { recursive: true });
  writeFileSync(keyFile, pems.private);
  writeFileSync(certFile, pems.cert);
  writeFileSync(addressFile, addresses.join('\n'));
  return { key: pems.private, cert: pems.cert };
}
