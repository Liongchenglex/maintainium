import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as tls from 'tls';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

@Injectable()
export class SslScanner {
  private readonly logger = new Logger(SslScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { project } = context;
    if (!project.productionUrl) {
      return [];
    }

    let url: URL;
    try {
      url = new URL(project.productionUrl);
    } catch {
      return [];
    }

    if (url.protocol !== 'https:') {
      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.SSL}:no-https:${url.hostname}`)
        .digest('hex');

      return [
        {
          fingerprint,
          severity: 'high',
          title: 'Site not using HTTPS',
          description: `${project.productionUrl} uses HTTP instead of HTTPS. SSL/TLS is required for secure communication.`,
          details: {
            url: project.productionUrl,
            protocol: url.protocol,
          },
        },
      ];
    }

    const hostname = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : 443;

    try {
      const certInfo = await this.getCertificateInfo(hostname, port);
      const findings: FindingData[] = [];

      // Check expiry
      const now = new Date();
      const expiryDate = new Date(certInfo.validTo);
      const daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysRemaining < 0) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:expired:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'critical',
          title: `SSL certificate expired`,
          description: `The SSL certificate for ${hostname} expired ${Math.abs(daysRemaining)} days ago on ${expiryDate.toISOString().split('T')[0]}.`,
          details: {
            hostname,
            issuer: certInfo.issuer,
            expiryDate: expiryDate.toISOString(),
            daysRemaining,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      } else if (daysRemaining <= 7) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:expiring-soon:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'critical',
          title: `SSL certificate expires in ${daysRemaining} days`,
          description: `The SSL certificate for ${hostname} expires on ${expiryDate.toISOString().split('T')[0]}. Renew immediately.`,
          details: {
            hostname,
            issuer: certInfo.issuer,
            expiryDate: expiryDate.toISOString(),
            daysRemaining,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      } else if (daysRemaining <= 14) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:expiring-soon:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'high',
          title: `SSL certificate expires in ${daysRemaining} days`,
          description: `The SSL certificate for ${hostname} expires on ${expiryDate.toISOString().split('T')[0]}. Plan renewal soon.`,
          details: {
            hostname,
            issuer: certInfo.issuer,
            expiryDate: expiryDate.toISOString(),
            daysRemaining,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      } else if (daysRemaining <= 30) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:expiring-soon:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'medium',
          title: `SSL certificate expires in ${daysRemaining} days`,
          description: `The SSL certificate for ${hostname} expires on ${expiryDate.toISOString().split('T')[0]}.`,
          details: {
            hostname,
            issuer: certInfo.issuer,
            expiryDate: expiryDate.toISOString(),
            daysRemaining,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      }

      // If cert is healthy (>30 days), report as info
      if (daysRemaining > 30) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:healthy:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'info',
          title: 'SSL certificate valid',
          description: `The SSL certificate for ${hostname} is valid until ${expiryDate.toISOString().split('T')[0]} (${daysRemaining} days remaining). Issued by ${certInfo.issuer}.`,
          details: {
            hostname,
            issuer: certInfo.issuer,
            subject: certInfo.subject,
            validFrom: certInfo.validFrom,
            expiryDate: expiryDate.toISOString(),
            daysRemaining,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      }

      // Check TLS version
      if (certInfo.tlsVersion && this.isTlsVersionOld(certInfo.tlsVersion)) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.SSL}:old-tls:${hostname}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'medium',
          title: `Outdated TLS version: ${certInfo.tlsVersion}`,
          description: `${hostname} is using ${certInfo.tlsVersion}. TLS 1.2 or higher is recommended.`,
          details: {
            hostname,
            tlsVersion: certInfo.tlsVersion,
          },
        });
      }

      return findings;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.SSL}:handshake-failed:${hostname}`)
        .digest('hex');

      return [
        {
          fingerprint,
          severity: 'critical',
          title: 'SSL verification failed',
          description: `TLS handshake to ${hostname} failed: ${message}`,
          details: {
            hostname,
            error: message,
          },
        },
      ];
    }
  }

  private getCertificateInfo(
    hostname: string,
    port: number,
  ): Promise<{
    issuer: string;
    subject: string;
    validFrom: string;
    validTo: string;
    tlsVersion: string;
  }> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 10000,
        },
        () => {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol();

          socket.destroy();

          if (!cert || !cert.valid_to) {
            reject(new Error('No certificate returned'));
            return;
          }

          resolve({
            issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
            subject: cert.subject?.CN || 'Unknown',
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            tlsVersion: protocol || 'Unknown',
          });
        },
      );

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.setTimeout(10000, () => {
        socket.destroy();
        reject(new Error('TLS handshake timeout'));
      });
    });
  }

  private isTlsVersionOld(version: string): boolean {
    return version === 'TLSv1' || version === 'TLSv1.1';
  }
}
