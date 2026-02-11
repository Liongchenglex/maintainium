import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, stat, readdir, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as tar from 'tar';

const MAX_TARBALL_SIZE = 500 * 1024 * 1024; // 500MB

interface DownloadResult {
  extractPath: string;
  cleanup: () => Promise<void>;
}

@Injectable()
export class RepoDownloaderService {
  private readonly logger = new Logger(RepoDownloaderService.name);

  async downloadAndExtract(
    token: string,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<DownloadResult> {
    const sessionId = randomUUID();
    const baseDir = join(tmpdir(), `maintainium-analysis-${sessionId}`);
    await mkdir(baseDir, { recursive: true });

    const tarballPath = join(baseDir, 'repo.tar.gz');
    const extractDir = join(baseDir, 'extracted');
    await mkdir(extractDir, { recursive: true });

    const cleanup = async () => {
      try {
        await rm(baseDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temp directory: ${baseDir}`);
      } catch (err) {
        this.logger.warn(`Failed to clean up temp directory ${baseDir}: ${err}`);
      }
    };

    try {
      // Download tarball from GitHub Archive API
      const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;
      this.logger.log(`Downloading tarball: ${owner}/${repo}@${ref}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        redirect: 'follow',
      });

      if (response.status === 401) {
        throw new Error('GITHUB_TOKEN_EXPIRED');
      }

      if (response.status === 404 || response.status === 403) {
        throw new Error('REPO_NOT_ACCESSIBLE');
      }

      if (!response.ok) {
        throw new Error(`GitHub API error ${response.status}: ${response.statusText}`);
      }

      // Check content-length if available
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_TARBALL_SIZE) {
        throw new Error('REPO_TOO_LARGE');
      }

      // Stream to file
      if (!response.body) {
        throw new Error('Empty response body from GitHub');
      }

      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      const fileStream = createWriteStream(tarballPath);
      let downloadedBytes = 0;

      nodeStream.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > MAX_TARBALL_SIZE) {
          nodeStream.destroy(new Error('REPO_TOO_LARGE'));
        }
      });

      await pipeline(nodeStream, fileStream);

      // Verify file size
      const fileInfo = await stat(tarballPath);
      this.logger.log(`Tarball downloaded: ${(fileInfo.size / 1024 / 1024).toFixed(1)}MB`);

      // Extract tarball
      await tar.extract({
        file: tarballPath,
        cwd: extractDir,
      });

      // GitHub tarballs extract to a prefix directory like "owner-repo-sha/"
      const entries = await readdir(extractDir);
      let extractPath = extractDir;
      if (entries.length === 1) {
        const innerPath = join(extractDir, entries[0]);
        const innerStat = await stat(innerPath);
        if (innerStat.isDirectory()) {
          extractPath = innerPath;
        }
      }

      this.logger.log(`Repository extracted to: ${extractPath}`);
      return { extractPath, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}
