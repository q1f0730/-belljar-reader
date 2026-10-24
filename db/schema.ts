import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const importJobs=sqliteTable('library_import_jobs',{
  id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),owner:text('owner').notNull(),
  title:text('title').notNull(),status:text('status').notNull().default('planning'),
  cursor:integer('cursor').notNull().default(0),total:integer('total').notNull().default(0),
  metadata:text('metadata'),error:text('error'),leaseUntil:integer('lease_until').notNull().default(0),
  inputTokens:integer('input_tokens').notNull().default(0),outputTokens:integer('output_tokens').notNull().default(0),
  created:integer('created').notNull(),updated:integer('updated').notNull(),
},t=>[uniqueIndex('library_import_fingerprint').on(t.fingerprint)])
export const libraryBooks=sqliteTable('library_books',{
  id:text('id').primaryKey(),jobId:text('job_id').notNull(),metadata:text('metadata').notNull(),
  status:text('status').notNull().default('draft'),created:integer('created').notNull(),
})
