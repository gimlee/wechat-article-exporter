import { db } from './db';

export interface PurgeCacheResult {
  articles: number;
  html: number;
  resourceMaps: number;
  resources: number;
  assets: number;
  comments: number;
  commentReplies: number;
  metadata: number;
  debug: number;
  bytes: number;
}

const emptyResult = (): PurgeCacheResult => ({
  articles: 0,
  html: 0,
  resourceMaps: 0,
  resources: 0,
  assets: 0,
  comments: 0,
  commentReplies: 0,
  metadata: 0,
  debug: 0,
  bytes: 0,
});

function addBlobSize(result: PurgeCacheResult, file?: Blob) {
  if (file) {
    result.bytes += file.size;
  }
}

export async function markArticleExported(url: string, format: string): Promise<void> {
  const now = Date.now();
  await db.article
    .where('link')
    .equals(url)
    .modify(article => {
      article.exportedAt = now;
      article.exportedFormats = Array.from(new Set([...(article.exportedFormats || []), format]));
    });
}

export async function markArticlesExported(urls: string[], format: string): Promise<void> {
  for (const url of urls) {
    await markArticleExported(url, format);
  }
}

export async function markArticleContentCached(url: string): Promise<void> {
  await db.article
    .where('link')
    .equals(url)
    .modify(article => {
      article.purgedAt = undefined;
      article.cacheSize = undefined;
    });
}

async function buildResourceRefCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const maps = await db['resource-map'].toArray();

  for (const map of maps) {
    for (const resourceUrl of map.resources) {
      counts.set(resourceUrl, (counts.get(resourceUrl) || 0) + 1);
    }
  }

  return counts;
}

export async function purgeArticleContentCaches(urls: string[]): Promise<PurgeCacheResult> {
  const result = emptyResult();
  const uniqueUrls = Array.from(new Set(urls));
  const resourceRefCounts = await buildResourceRefCounts();

  await db.transaction(
    'rw',
    ['article', 'html', 'resource-map', 'resource', 'comment', 'comment_reply', 'metadata', 'debug', 'asset'],
    async () => {
      const touchedFakeids = new Set<string>();
      const purgedAt = Date.now();

      for (const url of uniqueUrls) {
        const bytesBefore = result.bytes;
        const article = await db.article.where('link').equals(url).first();
        if (article) {
          touchedFakeids.add(article.fakeid);
        }

        const html = await db.html.get(url);
        if (html) {
          addBlobSize(result, html.file);
          await db.html.delete(url);
          result.html++;
        }

        const comment = await db.comment.get(url);
        if (comment) {
          result.bytes += new Blob([JSON.stringify(comment.data || {})]).size;
          await db.comment.delete(url);
          result.comments++;
        }

        const commentReplies = await db.comment_reply.where('url').equals(url).toArray();
        for (const commentReply of commentReplies) {
          result.bytes += new Blob([JSON.stringify(commentReply.data || {})]).size;
        }
        result.commentReplies += await db.comment_reply.where('url').equals(url).delete();

        const metadata = await db.metadata.get(url);
        if (metadata) {
          await db.metadata.delete(url);
          result.metadata++;
        }

        const debug = await db.debug.get(url);
        if (debug) {
          addBlobSize(result, debug.file);
          await db.debug.delete(url);
          result.debug++;
        }

        const resourceMap = await db['resource-map'].get(url);
        if (resourceMap) {
          for (const resourceUrl of resourceMap.resources) {
            const nextCount = (resourceRefCounts.get(resourceUrl) || 0) - 1;
            resourceRefCounts.set(resourceUrl, nextCount);

            if (nextCount <= 0) {
              const resource = await db.resource.get(resourceUrl);
              if (resource) {
                addBlobSize(result, resource.file);
                await db.resource.delete(resourceUrl);
                result.resources++;
              }
            }
          }

          await db['resource-map'].delete(url);
          result.resourceMaps++;
        }

        if (article) {
          await db.article
            .where('link')
            .equals(url)
            .modify(item => {
              item.purgedAt = purgedAt;
              item.cacheSize = result.bytes - bytesBefore;
            });
          result.articles++;
        }
      }

      for (const fakeid of touchedFakeids) {
        const remaining = await db.article
          .where('fakeid')
          .equals(fakeid)
          .and(article => !article.purgedAt)
          .count();

        if (remaining === 0) {
          for (const asset of await db.asset.where('fakeid').equals(fakeid).toArray()) {
            addBlobSize(result, asset.file);
          }
          result.assets += await db.asset.where('fakeid').equals(fakeid).delete();
        }
      }
    }
  );

  return result;
}

export async function purgeExportedArticleCaches(): Promise<PurgeCacheResult> {
  const articles = await db.article
    .filter(article => Boolean(article.exportedAt) && !article.purgedAt)
    .toArray();

  return purgeArticleContentCaches(articles.map(article => article.link));
}

export async function purgeAllArticleContentCaches(): Promise<PurgeCacheResult> {
  const result = emptyResult();
  const purgedAt = Date.now();

  await db.transaction(
    'rw',
    ['article', 'html', 'resource-map', 'resource', 'comment', 'comment_reply', 'metadata', 'debug', 'asset'],
    async () => {
      for (const html of await db.html.toArray()) {
        addBlobSize(result, html.file);
      }
      for (const resource of await db.resource.toArray()) {
        addBlobSize(result, resource.file);
      }
      for (const asset of await db.asset.toArray()) {
        addBlobSize(result, asset.file);
      }
      for (const debug of await db.debug.toArray()) {
        addBlobSize(result, debug.file);
      }

      result.articles = await db.article.toCollection().modify(article => {
        article.purgedAt = purgedAt;
      });
      result.html = await db.html.toCollection().delete();
      result.resourceMaps = await db['resource-map'].toCollection().delete();
      result.resources = await db.resource.toCollection().delete();
      result.assets = await db.asset.toCollection().delete();
      result.comments = await db.comment.toCollection().delete();
      result.commentReplies = await db.comment_reply.toCollection().delete();
      result.metadata = await db.metadata.toCollection().delete();
      result.debug = await db.debug.toCollection().delete();
    }
  );

  return result;
}
