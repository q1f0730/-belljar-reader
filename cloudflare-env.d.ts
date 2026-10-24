declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    INCEPTION_API_KEY?: string;
    LIBRARY_ADMIN_EMAIL?: string;
  }
}
